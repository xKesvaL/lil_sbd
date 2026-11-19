import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { Plugin } from "vite-plus";
import type {
  PressKitFileCategory,
  PressKitFileNode,
  PressKitFolderNode,
  PressKitManifest,
  PressKitNode,
} from "virtual:presskit-manifest";

const VIRTUAL_MODULE_ID = "virtual:presskit-manifest";
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;

export const PRESSKIT_ROOT_NAME = "LIL SBD - PRESS PACK";
export const PRESSKIT_PUBLIC_PREFIX = "/presskit";
export const PRESSKIT_THUMB_PREFIX = "/_presskit-thumbs";

const THUMB_MAX_WIDTH = 440;
const THUMB_MAX_HEIGHT = 320;
const THUMB_QUALITY = 76;
const THUMB_SPEC_VERSION = "v1";
const THUMB_CONCURRENCY = 4;
const WATCHER_DEBOUNCE_MS = 150;

const IGNORED_NAMES = new Set(["thumbs.db", "desktop.ini"]);

const THUMBNAILABLE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "avif",
  "tiff",
  "tif",
  "svg",
]);

const THUMB_FILENAME_PATTERN = /^[a-f0-9]{12}\.webp$/;

const naturalCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

type ThumbnailCacheEntry = {
  fileName: string;
  width: number;
  height: number;
};

type ThumbnailCacheIndex = Record<string, ThumbnailCacheEntry>;

export function classifyPressKitExtension(extension: string): PressKitFileCategory {
  const ext = extension.toLowerCase();

  if (ext === "pdf") {
    return "pdf";
  }

  if (["png", "jpg", "jpeg", "webp", "gif", "avif", "tiff", "tif", "bmp"].includes(ext)) {
    return "image";
  }

  if (["svg", "ai", "eps", "psd", "indd"].includes(ext)) {
    return "vector";
  }

  if (["txt", "md", "rtf", "doc", "docx", "odt"].includes(ext)) {
    return "text";
  }

  if (["wav", "mp3", "flac", "aiff", "aif", "ogg", "m4a"].includes(ext)) {
    return "audio";
  }

  if (["mp4", "mov", "webm", "mkv"].includes(ext)) {
    return "video";
  }

  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return "archive";
  }

  return "other";
}

function shouldIgnoreEntry(name: string): boolean {
  return name.startsWith(".") || IGNORED_NAMES.has(name.toLowerCase());
}

export function buildPressKitUrl(relativePosixPath: string): string {
  const encoded = relativePosixPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${PRESSKIT_PUBLIC_PREFIX}/${encoded}`;
}

export function canGenerateThumbnail(extension: string): boolean {
  return THUMBNAILABLE_EXTENSIONS.has(extension.toLowerCase());
}

export function scanPressKitDirectory(
  directoryPath: string,
  rootName = PRESSKIT_ROOT_NAME,
): PressKitManifest {
  const nodes: Record<string, PressKitNode> = {};

  function walkFolder(
    absoluteDir: string,
    nodeId: string,
    name: string,
    parentId: string | null,
    relativePosixPath: string,
  ): PressKitFolderNode {
    const entries = fs.existsSync(absoluteDir)
      ? fs
          .readdirSync(absoluteDir, { withFileTypes: true })
          .filter((entry) => !shouldIgnoreEntry(entry.name))
      : [];

    entries.sort((a, b) => {
      const aIsDir = a.isDirectory();
      const bIsDir = b.isDirectory();

      if (aIsDir !== bIsDir) {
        return aIsDir ? -1 : 1;
      }

      return naturalCollator.compare(a.name, b.name);
    });

    const childIds: string[] = [];
    let fileCount = 0;
    let totalSize = 0;

    for (const entry of entries) {
      const childAbsolute = path.join(absoluteDir, entry.name);
      const childRelative = relativePosixPath
        ? `${relativePosixPath}/${entry.name}`
        : entry.name;

      if (entry.isDirectory()) {
        const folderNode = walkFolder(
          childAbsolute,
          childRelative,
          entry.name,
          nodeId,
          childRelative,
        );
        childIds.push(folderNode.id);
        fileCount += folderNode.fileCount;
        totalSize += folderNode.totalSize;
      } else if (entry.isFile()) {
        const stat = fs.statSync(childAbsolute);
        const ext = path.extname(entry.name).replace(/^\./, "").toLowerCase();
        const fileNode: PressKitFileNode = {
          id: childRelative,
          name: entry.name,
          kind: "file",
          parentId: nodeId,
          path: childRelative,
          url: buildPressKitUrl(childRelative),
          extension: ext,
          category: classifyPressKitExtension(ext),
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        };
        nodes[fileNode.id] = fileNode;
        childIds.push(fileNode.id);
        fileCount += 1;
        totalSize += stat.size;
      }
    }

    const folderNode: PressKitFolderNode = {
      id: nodeId,
      name,
      kind: "folder",
      parentId,
      path: relativePosixPath,
      children: childIds,
      fileCount,
      totalSize,
    };

    nodes[nodeId] = folderNode;
    return folderNode;
  }

  const rootFolder = walkFolder(directoryPath, "root", rootName, "__root__", "");

  nodes.__root__ = {
    id: "__root__",
    name: "__root__",
    kind: "folder",
    parentId: null,
    path: "",
    children: [rootFolder.id],
    fileCount: rootFolder.fileCount,
    totalSize: rootFolder.totalSize,
  };

  return {
    virtualRootId: "__root__",
    rootId: "root",
    rootName,
    nodes,
  };
}

function readThumbnailIndex(indexPath: string): ThumbnailCacheIndex {
  try {
    if (!fs.existsSync(indexPath)) {
      return {};
    }

    const parsed: unknown = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as ThumbnailCacheIndex) : {};
  } catch {
    return {};
  }
}

function computeThumbnailKey(file: PressKitFileNode): string {
  return crypto
    .createHash("sha1")
    .update(`${THUMB_SPEC_VERSION}:${file.path}:${file.size}:${file.modifiedAt}`)
    .digest("hex")
    .slice(0, 12);
}

async function generateSingleThumbnail(
  sourcePath: string,
  extension: string,
  targetPath: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const isSvg = extension.toLowerCase() === "svg";
    const pipeline = isSvg
      ? sharp(sourcePath, { density: 144 })
      : sharp(sourcePath, { limitInputPixels: false }).rotate();

    const { data, info } = await pipeline
      .resize(THUMB_MAX_WIDTH, THUMB_MAX_HEIGHT, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        quality: isSvg ? 82 : THUMB_QUALITY,
        alphaQuality: 90,
        effort: 4,
      })
      .toBuffer({ resolveWithObject: true });

    await fs.promises.writeFile(targetPath, data);
    return { width: info.width, height: info.height };
  } catch (error) {
    console.warn(`[presskit-manifest] Failed to create thumbnail for ${sourcePath}:`, error);
    return null;
  }
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item !== undefined) {
        await worker(item);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
}

/**
 * Populates lightweight WebP thumbnails in `cacheDir` for every previewable Press Kit image/SVG,
 * mutating matching `PressKitFileNode` entries with `thumbnailUrl`, `thumbnailWidth`, and `thumbnailHeight`.
 * Returns the active thumbnail filename -> absolute path map for dev serving / production emission.
 */
export async function populatePressKitThumbnails(
  manifest: PressKitManifest,
  presskitDir: string,
  cacheDir: string,
): Promise<Map<string, string>> {
  fs.mkdirSync(cacheDir, { recursive: true });
  const indexPath = path.join(cacheDir, "index.json");
  const cacheIndex = readThumbnailIndex(indexPath);
  const activeThumbnails = new Map<string, string>();
  let indexDirty = false;

  const candidates = Object.values(manifest.nodes).filter(
    (node): node is PressKitFileNode => node.kind === "file" && canGenerateThumbnail(node.extension),
  );

  await mapWithConcurrency(candidates, THUMB_CONCURRENCY, async (file) => {
    const hash = computeThumbnailKey(file);
    const fileName = `${hash}.webp`;
    const cachedFilePath = path.join(cacheDir, fileName);
    const cachedMeta = cacheIndex[hash];

    if (cachedMeta && cachedMeta.fileName === fileName && fs.existsSync(cachedFilePath)) {
      file.thumbnailUrl = `${PRESSKIT_THUMB_PREFIX}/${fileName}`;
      file.thumbnailWidth = cachedMeta.width;
      file.thumbnailHeight = cachedMeta.height;
      activeThumbnails.set(fileName, cachedFilePath);
      return;
    }

    const sourcePath = path.join(presskitDir, ...file.path.split("/"));
    const result = await generateSingleThumbnail(sourcePath, file.extension, cachedFilePath);

    if (result) {
      cacheIndex[hash] = {
        fileName,
        width: result.width,
        height: result.height,
      };
      indexDirty = true;
      file.thumbnailUrl = `${PRESSKIT_THUMB_PREFIX}/${fileName}`;
      file.thumbnailWidth = result.width;
      file.thumbnailHeight = result.height;
      activeThumbnails.set(fileName, cachedFilePath);
    }
  });

  if (indexDirty) {
    try {
      await fs.promises.writeFile(indexPath, JSON.stringify(cacheIndex, null, 2));
    } catch {
      // Cache index write is best-effort.
    }
  }

  return activeThumbnails;
}

export function presskitManifestPlugin(): Plugin {
  let presskitDir = path.resolve(process.cwd(), "public", "presskit");
  let cacheDir = path.resolve(process.cwd(), ".cache", "presskit-thumbs");
  let activeThumbnails = new Map<string, string>();
  let pendingBuild: Promise<{ manifest: PressKitManifest; thumbnails: Map<string, string> }> | null =
    null;

  async function buildManifestAndThumbnails() {
    if (!pendingBuild) {
      pendingBuild = (async () => {
        const manifest = scanPressKitDirectory(presskitDir);
        const thumbnails = await populatePressKitThumbnails(manifest, presskitDir, cacheDir);
        activeThumbnails = thumbnails;
        return { manifest, thumbnails };
      })();
    }

    return pendingBuild;
  }

  return {
    name: "presskit-manifest",
    configResolved(config) {
      presskitDir = path.resolve(config.root, "public", "presskit");
      cacheDir = path.resolve(config.root, ".cache", "presskit-thumbs");
    },
    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }

      return null;
    },
    async load(id) {
      if (id !== RESOLVED_VIRTUAL_MODULE_ID) {
        return null;
      }

      const { manifest } = await buildManifestAndThumbnails();
      return `export const pressKitManifest = ${JSON.stringify(manifest)};`;
    },
    async generateBundle() {
      const envName = this.environment?.name;
      if (envName && envName !== "client") {
        return;
      }

      const { thumbnails } = await buildManifestAndThumbnails();

      for (const [fileName, absolutePath] of thumbnails.entries()) {
        if (!fs.existsSync(absolutePath)) {
          continue;
        }

        const source = await fs.promises.readFile(absolutePath);
        this.emitFile({
          type: "asset",
          fileName: `${PRESSKIT_THUMB_PREFIX.replace(/^\//, "")}/${fileName}`,
          source,
        });
      }
    },
    configureServer(server) {
      const normalizedDir = path.normalize(presskitDir);
      server.watcher.add(normalizedDir);

      // Serve generated WebP thumbnails directly in dev mode with immutable caching.
      server.middlewares.use(PRESSKIT_THUMB_PREFIX, (req, res, next) => {
        const rawPath = (req.url ?? "").split("?")[0] ?? "";
        const fileName = rawPath.replace(/^\/+/, "");

        if (!THUMB_FILENAME_PATTERN.test(fileName)) {
          next();
          return;
        }

        const filePath = activeThumbnails.get(fileName) ?? path.join(cacheDir, fileName);

        if (!fs.existsSync(filePath)) {
          next();
          return;
        }

        res.setHeader("Content-Type", "image/webp");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        fs.createReadStream(filePath).pipe(res);
      });

      let debounceTimer: ReturnType<typeof setTimeout> | null = null;

      const invalidate = (changedPath: string) => {
        const normalizedChanged = path.normalize(changedPath);
        if (
          normalizedChanged !== normalizedDir &&
          !normalizedChanged.startsWith(`${normalizedDir}${path.sep}`)
        ) {
          return;
        }

        const baseName = path.basename(normalizedChanged);
        if (shouldIgnoreEntry(baseName)) {
          return;
        }

        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          pendingBuild = null;
          const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
          if (mod) {
            server.moduleGraph.invalidateModule(mod);
          }
          server.ws.send({ type: "full-reload" });
        }, WATCHER_DEBOUNCE_MS);
      };

      server.watcher.on("add", invalidate);
      server.watcher.on("unlink", invalidate);
      server.watcher.on("addDir", invalidate);
      server.watcher.on("unlinkDir", invalidate);
      server.watcher.on("change", invalidate);
    },
  };
}
