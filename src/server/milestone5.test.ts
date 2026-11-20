// @vitest-environment node
import { spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, ensureSchemaInitialized } from "#/db";
import {
  artistCatalogItems,
  socialPosts,
  socialRawClips,
  type TrackAudioAnalysis,
  user,
} from "#/db/schema";
import { probeMediaFile } from "./audio-analysis.server";
import { enqueueJob, processNextJob } from "./jobs.server";
import {
  buildStorageKey,
  deleteMediaObject,
  ensureLocalMediaFile,
  getScratchDir,
  putMediaObject,
} from "./media-storage.server";
import { buildMultiTakeEditRecipe } from "./video-editor.server";

function runFfmpegHelper(args: string[]): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn("ffmpeg", args, { windowsHide: true });
    let stderr = "";
    proc.stderr.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
    });
    proc.on("error", rejectPromise);
    proc.on("close", (code) => {
      if (code !== 0) rejectPromise(new Error(`ffmpeg failed (${code}): ${stderr.slice(-300)}`));
      else resolvePromise();
    });
  });
}

function make200BpmAnalysis(): TrackAudioAnalysis {
  const beatsSec: number[] = [];
  const barsSec: number[] = [];
  for (let i = 0; i < 400; i++) {
    const t = Number((i * 0.3).toFixed(3));
    beatsSec.push(t);
    if (i % 4 === 0) barsSec.push(t);
  }
  return {
    version: 1,
    durationSec: 120,
    sampleRate: 8000,
    bpm: 200,
    beatConfidence: 0.95,
    firstBeatSec: 0,
    beatsSec,
    barsSec,
    drops: [{ label: "1st Drop", startSec: 38.4, endSec: 57.6, dropImpactSec: 42.0, peakEnergy: 1 }],
    energyEnvelope: [0.3, 0.8, 1],
    envelopeStepSec: 1,
    analyzedAt: new Date().toISOString(),
  };
}

describe("Milestone 5 — Multi-Take Beat-Cut Mashup Engine", () => {
  it("plans non-repeating bar-aligned beat cuts across 3 overlapping takes and varies by preset & seed", () => {
    const analysis = make200BpmAnalysis();
    const takes = [
      { clipId: "take-1", durationSec: 20, detectedOffsetSec: 37.5, syncConfidence: 0.92 },
      { clipId: "take-2", durationSec: 20, detectedOffsetSec: 38.0, syncConfidence: 0.88 },
      { clipId: "take-3", durationSec: 20, detectedOffsetSec: 38.2, syncConfidence: 0.94 },
    ];

    const punchy = buildMultiTakeEditRecipe({
      takes,
      trackAnalysis: analysis,
      preset: "punchy",
      audioHeadroomDb: -1.5,
      variationSeed: 0,
    });
    const hard = buildMultiTakeEditRecipe({
      takes,
      trackAnalysis: analysis,
      preset: "hard",
      audioHeadroomDb: -1.5,
      variationSeed: 0,
    });
    const shuffled = buildMultiTakeEditRecipe({
      takes,
      trackAnalysis: analysis,
      preset: "punchy",
      audioHeadroomDb: -1.5,
      variationSeed: 1,
    });

    expect(punchy.mode).toBe("multi_take");
    expect(punchy.segments.length).toBeGreaterThanOrEqual(5);
    expect(hard.segments.length).toBeGreaterThanOrEqual(punchy.segments.length);

    // Zero consecutive duplicate takes
    for (let i = 1; i < punchy.segments.length; i++) {
      expect(punchy.segments[i]!.clipId).not.toBe(punchy.segments[i - 1]!.clipId);
    }

    // All 3 takes should participate
    const usedIds = new Set(punchy.segments.map((s) => s.clipId));
    expect(usedIds.size).toBe(3);

    // Different seed changes the opening take
    expect(shuffled.segments[0]!.clipId).not.toBe(punchy.segments[0]!.clipId);
  });

  it(
    "runs end-to-end multi-take render_video job: auto-syncs 2 takes and renders beat-cut vertical MP4 + thumbnail",
    async () => {
      const trackPath = resolve(process.cwd(), "public", "songs", "induzaag.mp3");
      if (!existsSync(trackPath)) return;

      await ensureSchemaInitialized();
      const testUserId = `test-m5-mashup-${Date.now()}`;
      await db.insert(user).values({
        id: testUserId,
        name: "LIL SBD",
        email: `${testUserId}@lilsbd.com`,
        emailVerified: true,
      });

      const catId = `cat-m5-${Date.now()}`;
      await db.insert(artistCatalogItems).values({
        id: catId,
        userId: testUserId,
        type: "track",
        slug: "induzaag",
        title: "INDUZAAG",
        releaseDate: new Date("2026-09-17"),
        audioPreviewUrl: "/songs/induzaag.mp3",
        masterAudioPath: "/songs/induzaag.mp3",
        bpm: 200,
      });

      const scratchTake1 = join(getScratchDir(), `m5-take1-${Date.now()}.mp4`);
      const scratchTake2 = join(getScratchDir(), `m5-take2-${Date.now()}.mp4`);
      const key1 = buildStorageKey("raw", "angle-wide.mp4");
      const key2 = buildStorageKey("raw", "angle-close.mp4");
      let renderedUrlToClean: string | null = null;
      let thumbUrlToClean: string | null = null;

      try {
        // Two distinct synthetic angles covering overlapping drop window (40s..47s in INDUZAAG)
        await Promise.all([
          runFfmpegHelper([
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=360x640:rate=24:duration=7",
            "-ss",
            "40.0",
            "-t",
            "7.0",
            "-i",
            trackPath,
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            scratchTake1,
          ]),
          runFfmpegHelper([
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "smptebars=size=360x640:rate=24:duration=7",
            "-ss",
            "40.5",
            "-t",
            "7.0",
            "-i",
            trackPath,
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            scratchTake2,
          ]),
        ]);

        const [stored1, stored2] = await Promise.all([
          putMediaObject(key1, scratchTake1, "video/mp4"),
          putMediaObject(key2, scratchTake2, "video/mp4"),
        ]);

        const postId = `post-m5-${Date.now()}`;
        await db.insert(socialPosts).values({
          id: postId,
          userId: testUserId,
          catalogItemId: catId,
          title: "INDUZAAG 2-Angle Mashup",
          status: "editing",
          reviewStatus: "processing",
          editMode: "multi_take",
          platforms: ["youtube_shorts"],
        });

        await db.insert(socialRawClips).values([
          {
            id: `raw-m5-1-${Date.now()}`,
            userId: testUserId,
            postId,
            storageKey: stored1.key,
            fileName: "angle-wide.mp4",
            sizeBytes: stored1.sizeBytes,
            durationSec: 7,
            width: 360,
            height: 640,
            fps: 24,
            orderIndex: 0,
          },
          {
            id: `raw-m5-2-${Date.now()}`,
            userId: testUserId,
            postId,
            storageKey: stored2.key,
            fileName: "angle-close.mp4",
            sizeBytes: stored2.sizeBytes,
            durationSec: 7,
            width: 360,
            height: 640,
            fps: 24,
            orderIndex: 1,
          },
        ]);

        const job = await enqueueJob({
          userId: testUserId,
          postId,
          catalogItemId: catId,
          jobType: "render_video",
          payload: {
            postId,
            preset: "hard",
            skipAiDirector: true,
            renderWidth: 360,
            renderHeight: 640,
            renderFps: 24,
          },
          runAfter: new Date(Date.now() - 1_000),
        });

        const finished = await processNextJob();
        expect(finished?.id).toBe(job.id);
        expect(finished?.status).toBe("succeeded");

        const [updatedPost] = await db
          .select()
          .from(socialPosts)
          .where(eq(socialPosts.id, postId))
          .limit(1);
        expect(updatedPost?.editMode).toBe("multi_take");
        expect(updatedPost?.reviewStatus).toBe("needs_review");
        expect(updatedPost?.editRecipe?.segments.length).toBeGreaterThanOrEqual(2);
        const uniqueAngles = new Set(updatedPost?.editRecipe?.segments.map((s) => s.clipId));
        expect(uniqueAngles.size).toBe(2);

        renderedUrlToClean = updatedPost!.videoUrl!;
        thumbUrlToClean = updatedPost!.thumbnailUrl!;

        const localOut = await ensureLocalMediaFile(renderedUrlToClean);
        const probed = await probeMediaFile(localOut.localPath);
        expect(probed.hasVideo).toBe(true);
        expect(probed.hasAudio).toBe(true);
        expect(probed.width).toBe(360);
        expect(probed.height).toBe(640);
        expect(probed.durationSec).toBeGreaterThan(3.5);
      } finally {
        for (const p of [scratchTake1, scratchTake2]) {
          if (existsSync(p)) unlinkSync(p);
        }
        await deleteMediaObject(key1).catch(() => {});
        await deleteMediaObject(key2).catch(() => {});
        if (renderedUrlToClean) await deleteMediaObject(renderedUrlToClean).catch(() => {});
        if (thumbUrlToClean) await deleteMediaObject(thumbUrlToClean).catch(() => {});
      }
    },
    30_000,
  );
});
