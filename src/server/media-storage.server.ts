import { createHash, createHmac } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";

export type StorageNamespace = "raw" | "rendered" | "masters" | "thumbs" | "socials";
export type StorageMode = "s3_r2" | "local_nvme";

export interface S3Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl?: string;
}

const ALLOWED_NAMESPACES = new Set<string>(["raw", "rendered", "masters", "thumbs", "socials"]);

export function getSocialDataDir(): string {
  const custom = process.env.SOCIAL_DATA_DIR?.trim();
  if (!custom) {
    return join(process.cwd(), ".data");
  }
  return isAbsolute(custom) ? custom : resolve(process.cwd(), custom);
}

export function getUploadsRootDir(): string {
  const dir = join(getSocialDataDir(), "uploads");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getScratchDir(): string {
  const dir = join(getSocialDataDir(), "scratch");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getLegacySocialsDir(): string {
  const dir = join(getUploadsRootDir(), "socials");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getS3Config(): S3Config | null {
  const endpoint = process.env.S3_ENDPOINT?.trim().replace(/\/$/, "");
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    endpoint,
    bucket,
    region: process.env.S3_REGION?.trim() || "auto",
    accessKeyId,
    secretAccessKey,
    publicUrl: process.env.S3_PUBLIC_URL?.trim().replace(/\/$/, "") || undefined,
  };
}

export function getStorageMode(): StorageMode {
  return getS3Config() ? "s3_r2" : "local_nvme";
}

/**
 * Normalizes and validates a storage key to prevent directory traversal.
 * Supports namespaced keys ("rendered/abc.mp4", "masters/demo.wav")
 * as well as legacy flat keys ("abc.mp4" -> resolved under "socials/").
 */
export function normalizeStorageKey(rawKey: string): string {
  const trimmed = rawKey
    .replace(/^\/api\/socials\/media\//, "")
    .replace(/^\/+/, "")
    .replaceAll("\\", "/")
    .trim();

  if (!trimmed || trimmed.includes("..") || trimmed.includes("\0")) {
    throw new Error(`Invalid storage key: ${rawKey}`);
  }

  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length === 1) {
    const file = basename(parts[0]!);
    if (!file || file === "." || file === "..") {
      throw new Error(`Invalid storage filename: ${rawKey}`);
    }
    return `socials/${file}`;
  }

  if (parts.length === 2 && ALLOWED_NAMESPACES.has(parts[0]!)) {
    const file = basename(parts[1]!);
    if (!file || file === "." || file === "..") {
      throw new Error(`Invalid storage filename: ${rawKey}`);
    }
    return `${parts[0]}/${file}`;
  }

  throw new Error(`Unsupported storage key path: ${rawKey}`);
}

export function buildStorageKey(namespace: StorageNamespace, originalFileName: string): string {
  const ext = extname(originalFileName).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".bin";
  const safeBase = originalFileName
    .replace(/\.[^/.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${namespace}/${Date.now()}-${rand}-${safeBase || "asset"}${ext}`;
}

export function resolveLocalMediaPath(rawKey: string): string {
  const key = normalizeStorageKey(rawKey);
  const root = resolve(getUploadsRootDir());
  const fullPath = resolve(root, key);
  if (!fullPath.startsWith(root)) {
    throw new Error("Path traversal blocked");
  }
  return fullPath;
}

export function guessContentType(fileNameOrKey: string): string {
  const lower = fileNameOrKey.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".flac")) return "audio/flac";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

// ============================================================================
// Minimal Zero-Dependency AWS SigV4 Signer (Cloudflare R2 / Hetzner S3 / AWS)
// ============================================================================

function sha256Hex(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function encodeRfc3986Path(path: string): string {
  return path
    .split("/")
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join("/");
}

async function signedS3Fetch(
  config: S3Config,
  method: "GET" | "PUT" | "DELETE" | "HEAD",
  key: string,
  body?: Uint8Array,
  contentType?: string,
): Promise<Response> {
  const normalizedKey = normalizeStorageKey(key);
  const endpointUrl = new URL(config.endpoint);
  const objectPath = `/${config.bucket}/${normalizedKey}`;
  const canonicalUri = encodeRfc3986Path(objectPath);
  const targetUrl = `${endpointUrl.origin}${canonicalUri}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body ?? new Uint8Array());

  const headersToSign: Record<string, string> = {
    host: endpointUrl.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) {
    headersToSign["content-type"] = contentType;
  }

  const sortedKeys = Object.keys(headersToSign).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${headersToSign[k]}\n`).join("");
  const signedHeaders = sortedKeys.join(";");

  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmacSha256(`AWS4${config.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, config.region);
  const kService = hmacSha256(kRegion, "s3");
  const kSigning = hmacSha256(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const fetchHeaders: Record<string, string> = {
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    Authorization: authorization,
  };
  if (contentType) {
    fetchHeaders["Content-Type"] = contentType;
  }

  return fetch(targetUrl, {
    method,
    headers: fetchHeaders,
    body: body ? Buffer.from(body) : undefined,
  });
}

// ============================================================================
// Public MediaStorage API
// ============================================================================

export function getPublicMediaUrl(rawKey: string): string {
  const key = normalizeStorageKey(rawKey);
  const s3 = getS3Config();
  if (s3?.publicUrl) {
    return `${s3.publicUrl}/${key}`;
  }
  return `/api/socials/media/${key}`;
}

export async function putMediaObject(
  rawKey: string,
  input: Uint8Array | Buffer | string,
  contentType?: string,
): Promise<{ key: string; publicUrl: string; sizeBytes: number; storageMode: StorageMode }> {
  const key = normalizeStorageKey(rawKey);
  const resolvedContentType = contentType || guessContentType(key);
  const s3 = getS3Config();

  if (s3) {
    const bytes =
      typeof input === "string" ? new Uint8Array(readFileSync(input)) : new Uint8Array(input);
    const res = await signedS3Fetch(s3, "PUT", key, bytes, resolvedContentType);
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`S3/R2 upload failed (${res.status}): ${errText.slice(0, 200)}`);
    }
    return {
      key,
      publicUrl: getPublicMediaUrl(key),
      sizeBytes: bytes.byteLength,
      storageMode: "s3_r2",
    };
  }

  const destPath = resolveLocalMediaPath(key);
  mkdirSync(dirname(destPath), { recursive: true });
  let sizeBytes: number;
  if (typeof input === "string") {
    if (resolve(input) !== resolve(destPath)) {
      copyFileSync(input, destPath);
    }
    sizeBytes = statSync(destPath).size;
  } else {
    writeFileSync(destPath, input);
    sizeBytes = input.byteLength;
  }

  return {
    key,
    publicUrl: getPublicMediaUrl(key),
    sizeBytes,
    storageMode: "local_nvme",
  };
}

export async function readMediaBuffer(rawKey: string): Promise<Uint8Array> {
  const key = normalizeStorageKey(rawKey);
  const localPath = resolveLocalMediaPath(key);
  if (existsSync(localPath)) {
    return new Uint8Array(readFileSync(localPath));
  }

  const s3 = getS3Config();
  if (s3) {
    const res = await signedS3Fetch(s3, "GET", key);
    if (!res.ok) {
      throw new Error(`S3/R2 download failed (${res.status}) for ${key}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  throw new Error(`Media object not found: ${key}`);
}

/**
 * Ensures a media object is readable from the local filesystem (for FFmpeg/ffprobe).
 * Zero-copy on local NVMe; downloads into local scratch when stored on S3/R2.
 */
export async function ensureLocalMediaFile(rawKey: string): Promise<{
  localPath: string;
  isTemporary: boolean;
}> {
  const key = normalizeStorageKey(rawKey);
  const localPath = resolveLocalMediaPath(key);
  if (existsSync(localPath)) {
    return { localPath, isTemporary: false };
  }

  const s3 = getS3Config();
  if (s3) {
    const bytes = await readMediaBuffer(key);
    const scratchPath = join(
      getScratchDir(),
      `dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${basename(key)}`,
    );
    writeFileSync(scratchPath, bytes);
    return { localPath: scratchPath, isTemporary: true };
  }

  throw new Error(`Media file not found locally or in S3/R2: ${key}`);
}

export async function mediaObjectExists(rawKey: string): Promise<boolean> {
  try {
    const key = normalizeStorageKey(rawKey);
    const localPath = resolveLocalMediaPath(key);
    if (existsSync(localPath)) return true;

    const s3 = getS3Config();
    if (s3) {
      const res = await signedS3Fetch(s3, "HEAD", key);
      return res.ok;
    }
    return false;
  } catch {
    return false;
  }
}

export async function deleteMediaObject(rawKey: string): Promise<void> {
  const key = normalizeStorageKey(rawKey);
  const localPath = resolveLocalMediaPath(key);
  if (existsSync(localPath)) {
    unlinkSync(localPath);
  }

  const s3 = getS3Config();
  if (s3) {
    await signedS3Fetch(s3, "DELETE", key).catch(() => {});
  }
}

export function getLocalStorageStats(): {
  storageMode: StorageMode;
  dataDir: string;
  totalBytes: number;
  byNamespace: Record<string, { files: number; bytes: number }>;
} {
  const uploadsRoot = getUploadsRootDir();
  const byNamespace: Record<string, { files: number; bytes: number }> = {};
  let totalBytes = 0;

  for (const ns of ALLOWED_NAMESPACES) {
    const nsDir = join(uploadsRoot, ns);
    let files = 0;
    let bytes = 0;
    if (existsSync(nsDir)) {
      for (const entry of readdirSync(nsDir)) {
        try {
          const st = statSync(join(nsDir, entry));
          if (st.isFile()) {
            files++;
            bytes += st.size;
          }
        } catch {
          // Ignore transient files
        }
      }
    }
    byNamespace[ns] = { files, bytes };
    totalBytes += bytes;
  }

  return {
    storageMode: getStorageMode(),
    dataDir: getSocialDataDir(),
    totalBytes,
    byNamespace,
  };
}
