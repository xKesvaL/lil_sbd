import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { and, asc, eq, isNull, lte } from "drizzle-orm";
import { db, ensureSchemaInitialized } from "#/db";
import { artistProfiles, socialPosts, socialRawClips } from "#/db/schema";
import {
  deleteMediaObject,
  getLocalStorageStats,
  getScratchDir,
  getStorageMode,
  normalizeStorageKey,
  resolveLocalMediaPath,
} from "./media-storage.server";

export interface MediaCleanupSummary {
  scratchFilesDeleted: number;
  rawClipsDeleted: number;
  renderedVideosDeleted: number;
  bytesFreed: number;
}

export interface SystemReadinessDiagnostics {
  ffmpegAvailable: boolean;
  publicHttpsReady: boolean;
  publicBaseUrl: string;
  storageMode: "s3_r2" | "local_nvme";
  geminiConfigured: boolean;
  geminiModel: string;
}

let cachedFfmpegAvailable: boolean | null = null;

export function checkFfmpegAvailable(): boolean {
  if (cachedFfmpegAvailable !== null) return cachedFfmpegAvailable;
  try {
    const res = spawnSync("ffmpeg", ["-version"], { windowsHide: true, timeout: 4000 });
    cachedFfmpegAvailable = res.status === 0;
  } catch {
    cachedFfmpegAvailable = false;
  }
  return cachedFfmpegAvailable;
}

export function getSystemReadinessDiagnostics(
  geminiConfigured: boolean,
  geminiModel: string,
): SystemReadinessDiagnostics {
  const publicBaseUrl = (
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.BETTER_AUTH_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/$/, "");

  const isLocalhost =
    publicBaseUrl.includes("localhost") ||
    publicBaseUrl.includes("127.0.0.1") ||
    publicBaseUrl.includes("0.0.0.0");

  return {
    ffmpegAvailable: checkFfmpegAvailable(),
    publicHttpsReady: publicBaseUrl.startsWith("https://") && !isLocalhost,
    publicBaseUrl,
    storageMode: getStorageMode(),
    geminiConfigured,
    geminiModel,
  };
}

function getManagedLocalByteSize(keyOrUrl: string): number {
  try {
    const key = normalizeStorageKey(keyOrUrl);
    const localPath = resolveLocalMediaPath(key);
    if (existsSync(localPath)) {
      return statSync(localPath).size;
    }
  } catch {
    // External URL or invalid key
  }
  return 0;
}

function isManagedRenderedKey(videoUrl?: string | null): boolean {
  if (!videoUrl) return false;
  if (videoUrl.startsWith("/api/socials/media/")) return true;
  if (videoUrl.startsWith("rendered/") || videoUrl.startsWith("socials/")) return true;
  const s3Public = process.env.S3_PUBLIC_URL?.trim().replace(/\/$/, "");
  if (s3Public && videoUrl.startsWith(`${s3Public}/rendered/`)) return true;
  return false;
}

function extractKeyFromManagedUrl(videoUrl: string): string {
  const s3Public = process.env.S3_PUBLIC_URL?.trim().replace(/\/$/, "");
  if (s3Public && videoUrl.startsWith(`${s3Public}/`)) {
    return videoUrl.slice(s3Public.length + 1);
  }
  return videoUrl;
}

/**
 * Deletes orphaned scratch files older than `maxAgeMs` (default 2 hours).
 */
export function cleanupStaleScratchFiles(now = new Date(), maxAgeMs = 2 * 3600_000): {
  deleted: number;
  bytesFreed: number;
} {
  const scratchDir = getScratchDir();
  if (!existsSync(scratchDir)) return { deleted: 0, bytesFreed: 0 };

  let deleted = 0;
  let bytesFreed = 0;
  const cutoffMs = now.getTime() - maxAgeMs;

  for (const entry of readdirSync(scratchDir)) {
    const full = join(scratchDir, entry);
    try {
      const st = statSync(full);
      if (st.isFile() && st.mtimeMs <= cutoffMs) {
        bytesFreed += st.size;
        unlinkSync(full);
        deleted++;
      }
    } catch {
      // Ignore files removed concurrently
    }
  }

  return { deleted, bytesFreed };
}

/**
 * Conveyor-belt media retention pass for a user (or all users if userId omitted):
 * 1. Prunes stale scratch files (>2h old)
 * 2. Deletes raw phone takes for published posts older than `rawRetentionDays` (default 7d)
 * 3. Deletes final rendered MP4s for published posts older than `renderedRetentionDays` (default 90d)
 *    while preserving poster thumbnails, published links, and demo masters forever
 * 4. If local usage exceeds `storageCapGb`, prunes oldest published renders until under 85% of cap
 */
export async function runMediaLifecycleCleanup(options?: {
  userId?: string;
  now?: Date;
  scratchMaxAgeMs?: number;
  overrideStorageCapBytes?: number;
}): Promise<MediaCleanupSummary> {
  await ensureSchemaInitialized();
  const now = options?.now ?? new Date();
  const summary: MediaCleanupSummary = {
    scratchFilesDeleted: 0,
    rawClipsDeleted: 0,
    renderedVideosDeleted: 0,
    bytesFreed: 0,
  };

  // Pass 1: Ephemeral FFmpeg/proxy scratch cleanup
  const scratchRes = cleanupStaleScratchFiles(now, options?.scratchMaxAgeMs ?? 2 * 3600_000);
  summary.scratchFilesDeleted += scratchRes.deleted;
  summary.bytesFreed += scratchRes.bytesFreed;

  const profiles = options?.userId
    ? await db
        .select()
        .from(artistProfiles)
        .where(eq(artistProfiles.userId, options.userId))
    : await db.select().from(artistProfiles);

  for (const profile of profiles) {
    const rawRetentionDays = Math.max(1, profile.rawRetentionDays ?? 7);
    const renderedRetentionDays = Math.max(7, profile.renderedRetentionDays ?? 90);
    const rawCutoff = new Date(now.getTime() - rawRetentionDays * 86_400_000);
    const renderedCutoff = new Date(now.getTime() - renderedRetentionDays * 86_400_000);

    // Pass 2: Prune raw takes for published posts older than rawRetentionDays
    const postsToCleanRaw = await db
      .select()
      .from(socialPosts)
      .where(
        and(
          eq(socialPosts.userId, profile.userId),
          eq(socialPosts.status, "posted"),
          isNull(socialPosts.rawCleanedAt),
          lte(socialPosts.postedAt, rawCutoff),
        ),
      );

    for (const post of postsToCleanRaw) {
      const clips = await db
        .select()
        .from(socialRawClips)
        .where(eq(socialRawClips.postId, post.id));

      for (const clip of clips) {
        const bytes = getManagedLocalByteSize(clip.storageKey) || clip.sizeBytes || 0;
        await deleteMediaObject(clip.storageKey).catch(() => {});
        await db.delete(socialRawClips).where(eq(socialRawClips.id, clip.id));
        summary.rawClipsDeleted++;
        summary.bytesFreed += bytes;
      }

      await db
        .update(socialPosts)
        .set({ rawCleanedAt: now, updatedAt: now })
        .where(eq(socialPosts.id, post.id));
    }

    // Pass 3: Prune final rendered MP4s for published posts older than renderedRetentionDays
    const postsToCleanRendered = await db
      .select()
      .from(socialPosts)
      .where(
        and(
          eq(socialPosts.userId, profile.userId),
          eq(socialPosts.status, "posted"),
          lte(socialPosts.postedAt, renderedCutoff),
        ),
      );

    for (const post of postsToCleanRendered) {
      if (!isManagedRenderedKey(post.videoUrl)) continue;
      const key = extractKeyFromManagedUrl(post.videoUrl!);
      const bytes = getManagedLocalByteSize(key) || post.videoSizeBytes || 0;
      await deleteMediaObject(key).catch(() => {});
      await db
        .update(socialPosts)
        .set({
          videoUrl: null,
          videoSizeBytes: null,
          updatedAt: now,
        })
        .where(eq(socialPosts.id, post.id));
      summary.renderedVideosDeleted++;
      summary.bytesFreed += bytes;
    }

    // Pass 4: Storage cap guard (prune oldest published renders if over storageCapGb)
    const capBytes =
      options?.overrideStorageCapBytes ?? Math.max(1, profile.storageCapGb ?? 8) * 1024 * 1024 * 1024;
    const stats = getLocalStorageStats();
    // Exclude masters & thumbs from evictable calculation, measure total vs cap
    if (stats.totalBytes > capBytes) {
      const targetBytes = Math.floor(capBytes * 0.85);
      let currentBytes = stats.totalBytes;

      const oldestPublished = await db
        .select()
        .from(socialPosts)
        .where(and(eq(socialPosts.userId, profile.userId), eq(socialPosts.status, "posted")))
        .orderBy(asc(socialPosts.postedAt));

      for (const post of oldestPublished) {
        if (currentBytes <= targetBytes) break;

        // First evict any remaining raw takes on this published post
        const clips = await db
          .select()
          .from(socialRawClips)
          .where(eq(socialRawClips.postId, post.id));
        for (const clip of clips) {
          const bytes = getManagedLocalByteSize(clip.storageKey) || clip.sizeBytes || 0;
          await deleteMediaObject(clip.storageKey).catch(() => {});
          await db.delete(socialRawClips).where(eq(socialRawClips.id, clip.id));
          summary.rawClipsDeleted++;
          summary.bytesFreed += bytes;
          currentBytes = Math.max(0, currentBytes - bytes);
        }

        // Next evict rendered MP4 if still above target
        if (currentBytes > targetBytes && isManagedRenderedKey(post.videoUrl)) {
          const key = extractKeyFromManagedUrl(post.videoUrl!);
          const bytes = getManagedLocalByteSize(key) || post.videoSizeBytes || 0;
          await deleteMediaObject(key).catch(() => {});
          await db
            .update(socialPosts)
            .set({ videoUrl: null, videoSizeBytes: null, updatedAt: now })
            .where(eq(socialPosts.id, post.id));
          summary.renderedVideosDeleted++;
          summary.bytesFreed += bytes;
          currentBytes = Math.max(0, currentBytes - bytes);
        }
      }
    }
  }

  return summary;
}
