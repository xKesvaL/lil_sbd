// @vitest-environment node
import { existsSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, ensureSchemaInitialized } from "#/db";
import { artistProfiles, socialPosts, socialRawClips, user } from "#/db/schema";
import { enqueueJob, processNextJob } from "./jobs.server";
import {
  checkFfmpegAvailable,
  getSystemReadinessDiagnostics,
  runMediaLifecycleCleanup,
} from "./media-cleanup.server";
import {
  buildStorageKey,
  deleteMediaObject,
  getScratchDir,
  mediaObjectExists,
  putMediaObject,
} from "./media-storage.server";

describe("Milestone 6 — Conveyor-Belt Media Lifecycle Cleanup & Readiness Diagnostics", () => {
  it("reports FFmpeg & readiness diagnostics cleanly", () => {
    expect(checkFfmpegAvailable()).toBe(true);
    const diag = getSystemReadinessDiagnostics(false, "gemini-2.5-flash");
    expect(diag.ffmpegAvailable).toBe(true);
    expect(diag.geminiModel).toBe("gemini-2.5-flash");
  });

  it("prunes stale scratch, 7d+ published raw takes, and 90d+ rendered MP4s while sparing active drafts, thumbs & masters", async () => {
    await ensureSchemaInitialized();

    const testUserId = `test-m6-cleanup-${Date.now()}`;
    await db.insert(user).values({
      id: testUserId,
      name: "LIL SBD",
      email: `${testUserId}@lilsbd.com`,
      emailVerified: true,
    });
    await db.insert(artistProfiles).values({
      id: `profile-${testUserId}`,
      userId: testUserId,
      stageName: "LIL SBD",
      rawRetentionDays: 7,
      renderedRetentionDays: 90,
      storageCapGb: 8,
    });

    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 86_400_000);
    const hundredDaysAgo = new Date(now.getTime() - 100 * 86_400_000);

    // 1. Stale scratch file (3 hours old)
    const staleScratch = join(getScratchDir(), `m6-stale-${Date.now()}.tmp`);
    writeFileSync(staleScratch, Buffer.alloc(1024, 1));
    const threeHoursAgo = new Date(now.getTime() - 3 * 3600_000);
    utimesSync(staleScratch, threeHoursAgo, threeHoursAgo);

    // 2. Media files across namespaces
    const oldRawKey = buildStorageKey("raw", "old-published-take.mp4");
    const activeRawKey = buildStorageKey("raw", "queued-draft-take.mp4");
    const oldRenderKey = buildStorageKey("rendered", "very-old-render.mp4");
    const recentRenderKey = buildStorageKey("rendered", "recent-render.mp4");
    const thumbKey = buildStorageKey("thumbs", "keep-thumb.jpg");
    const masterKey = buildStorageKey("masters", "keep-demo.wav");

    try {
      const [sOldRaw, sActiveRaw, sOldRender, sRecentRender, sThumb] = await Promise.all([
        putMediaObject(oldRawKey, new Uint8Array(2048), "video/mp4"),
        putMediaObject(activeRawKey, new Uint8Array(2048), "video/mp4"),
        putMediaObject(oldRenderKey, new Uint8Array(4096), "video/mp4"),
        putMediaObject(recentRenderKey, new Uint8Array(4096), "video/mp4"),
        putMediaObject(thumbKey, new Uint8Array(512), "image/jpeg"),
        putMediaObject(masterKey, new Uint8Array(4096), "audio/wav"),
      ]);

      // Post A: published 10 days ago -> raw take pruned, final render KEPT (<90d)
      const postA = `post-m6-a-${Date.now()}`;
      await db.insert(socialPosts).values({
        id: postA,
        userId: testUserId,
        title: "Published 10d ago",
        status: "posted",
        reviewStatus: "published",
        postedAt: tenDaysAgo,
        videoUrl: sRecentRender.publicUrl,
        videoSizeBytes: sRecentRender.sizeBytes,
        thumbnailUrl: sThumb.publicUrl,
      });
      await db.insert(socialRawClips).values({
        id: `raw-a-${Date.now()}`,
        userId: testUserId,
        postId: postA,
        storageKey: sOldRaw.key,
        fileName: "old-published-take.mp4",
        sizeBytes: sOldRaw.sizeBytes,
      });

      // Post B: published 100 days ago -> final render pruned, thumbnail KEPT
      const postB = `post-m6-b-${Date.now()}`;
      await db.insert(socialPosts).values({
        id: postB,
        userId: testUserId,
        title: "Published 100d ago",
        status: "posted",
        reviewStatus: "published",
        postedAt: hundredDaysAgo,
        videoUrl: sOldRender.publicUrl,
        videoSizeBytes: sOldRender.sizeBytes,
        thumbnailUrl: sThumb.publicUrl,
      });

      // Post C: unposted active draft -> raw take MUST NOT be deleted
      const postC = `post-m6-c-${Date.now()}`;
      await db.insert(socialPosts).values({
        id: postC,
        userId: testUserId,
        title: "Unposted draft",
        status: "ready",
        reviewStatus: "needs_review",
      });
      await db.insert(socialRawClips).values({
        id: `raw-c-${Date.now()}`,
        userId: testUserId,
        postId: postC,
        storageKey: sActiveRaw.key,
        fileName: "queued-draft-take.mp4",
        sizeBytes: sActiveRaw.sizeBytes,
      });

      // Execute via background worker "cleanup_media" job
      const job = await enqueueJob({
        userId: testUserId,
        jobType: "cleanup_media",
        runAfter: new Date(Date.now() - 1_000),
      });
      const finished = await processNextJob();
      expect(finished?.id).toBe(job.id);
      expect(finished?.status).toBe("succeeded");

      // Verify exact conveyor-belt behavior
      expect(existsSync(staleScratch)).toBe(false);
      expect(await mediaObjectExists(oldRawKey)).toBe(false);
      expect(await mediaObjectExists(oldRenderKey)).toBe(false);

      // Spared assets MUST still exist
      expect(await mediaObjectExists(activeRawKey)).toBe(true);
      expect(await mediaObjectExists(recentRenderKey)).toBe(true);
      expect(await mediaObjectExists(thumbKey)).toBe(true);
      expect(await mediaObjectExists(masterKey)).toBe(true);

      const [updatedA] = await db.select().from(socialPosts).where(eq(socialPosts.id, postA));
      expect(updatedA?.rawCleanedAt).toBeTruthy();
      expect(updatedA?.videoUrl).toBe(sRecentRender.publicUrl);

      const [updatedB] = await db.select().from(socialPosts).where(eq(socialPosts.id, postB));
      expect(updatedB?.videoUrl).toBeNull();
      expect(updatedB?.thumbnailUrl).toBe(sThumb.publicUrl);

      // Re-running cleanup directly is idempotent
      const secondPass = await runMediaLifecycleCleanup({ userId: testUserId, now });
      expect(secondPass.rawClipsDeleted).toBe(0);
      expect(secondPass.renderedVideosDeleted).toBe(0);
    } finally {
      for (const k of [oldRawKey, activeRawKey, oldRenderKey, recentRenderKey, thumbKey, masterKey]) {
        await deleteMediaObject(k).catch(() => {});
      }
    }
  });
});
