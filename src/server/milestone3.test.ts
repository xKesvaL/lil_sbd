// @vitest-environment node
import { spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, ensureSchemaInitialized } from "#/db";
import { artistCatalogItems, socialPosts, socialRawClips, user } from "#/db/schema";
import {
  analyzeAudioFile,
  decodeAudioToMonoPcm,
  probeMediaFile,
} from "./audio-analysis.server";
import { syncClipPcmToMasterPcm } from "./audio-sync.server";
import { enqueueJob, processNextJob } from "./jobs.server";
import {
  buildStorageKey,
  deleteMediaObject,
  ensureLocalMediaFile,
  getScratchDir,
  putMediaObject,
} from "./media-storage.server";
import { buildSingleTakeEditRecipe, buildSingleTakeFiltergraph } from "./video-editor.server";

function runFfmpegTestHelper(args: string[]): Promise<void> {
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

describe("Milestone 3 — Acoustic Auto-Sync & Single-Take Dynamic FFmpeg Auto-Editor", () => {
  it("recovers exact master track timestamp from a noisy room-mic slice of INDUZAAG", async () => {
    const trackPath = resolve(process.cwd(), "public", "songs", "induzaag.mp3");
    if (!existsSync(trackPath)) return;

    const sampleRate = 8000;
    const masterPcm = await decodeAudioToMonoPcm(trackPath, sampleRate);
    const trueOffsetSec = 42.5;
    const sliceLenSec = 10;
    const startIdx = Math.round(trueOffsetSec * sampleRate);
    const len = Math.round(sliceLenSec * sampleRate);

    // Simulate noisy/attenuated phone mic recording of room speakers
    const simulatedPhoneMic = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const s = masterPcm[startIdx + i] ?? 0;
      const echo = i >= 160 ? (masterPcm[startIdx + i - 160] ?? 0) * 0.25 : 0;
      const noise = (Math.sin(i * 12.9898) * 43758.5453 - Math.floor(Math.sin(i * 12.9898) * 43758.5453) - 0.5) * 0.04;
      simulatedPhoneMic[i] = s * 0.45 + echo * 0.3 + noise;
    }

    const sync = syncClipPcmToMasterPcm(masterPcm, simulatedPhoneMic, { sampleRate });
    expect(sync.method).toBe("acoustic_xcorr");
    expect(sync.confidence).toBeGreaterThanOrEqual(0.45);
    expect(Math.abs(sync.offsetSec - trueOffsetSec)).toBeLessThanOrEqual(0.1);

    // Silent clip should gracefully fall back to drop_snap_fallback
    const silent = new Float32Array(sampleRate * 6);
    const fallback = syncClipPcmToMasterPcm(masterPcm, silent, {
      sampleRate,
      trackAnalysis: {
        version: 1,
        durationSec: 150,
        sampleRate,
        bpm: 200,
        beatConfidence: 0.9,
        firstBeatSec: 0,
        beatsSec: [],
        barsSec: [],
        drops: [{ label: "1st Drop", startSec: 38, endSec: 58, dropImpactSec: 42, peakEnergy: 1 }],
        energyEnvelope: [],
        envelopeStepSec: 1,
        analyzedAt: new Date().toISOString(),
      },
    });
    expect(fallback.method).toBe("drop_snap_fallback");
    expect(fallback.offsetSec).toBe(38);
  });

  it("builds a beat-synced edit recipe and direct-loudness FFmpeg filtergraph (-1.5dB, no -14 LUFS)", async () => {
    const trackPath = resolve(process.cwd(), "public", "songs", "induzaag.mp3");
    if (!existsSync(trackPath)) return;

    const analysis = await analyzeAudioFile(trackPath, 200);
    const firstDrop = analysis.drops[0]!;
    const recipe = buildSingleTakeEditRecipe({
      clipId: "clip-1",
      clipDurationSec: 20,
      detectedOffsetSec: Math.max(0, firstDrop.startSec - 1),
      trackAnalysis: analysis,
      preset: "punchy",
      audioHeadroomDb: -1.5,
      burnHookOverlay: false,
    });

    expect(recipe.mode).toBe("single_take");
    expect(recipe.audioHeadroomDb).toBe(-1.5);
    expect(recipe.fxEvents.length).toBeGreaterThan(2);

    const graph = buildSingleTakeFiltergraph(recipe, { width: 360, height: 640, fps: 24 });
    expect(graph.audioFilter).toContain("volume=-1.50dB");
    expect(graph.audioFilter).not.toContain("loudnorm");
    expect(graph.videoFilter).toContain("eval=frame");
  });

  it(
    "runs end-to-end render_video job: auto-syncs raw video, renders beat-synced MP4 + thumbnail via FFmpeg",
    async () => {
      const trackPath = resolve(process.cwd(), "public", "songs", "induzaag.mp3");
      if (!existsSync(trackPath)) return;

      await ensureSchemaInitialized();
      const testUserId = `test-m3-render-${Date.now()}`;
      await db.insert(user).values({
        id: testUserId,
        name: "LIL SBD",
        email: `${testUserId}@lilsbd.com`,
        emailVerified: true,
      });

      const catId = `cat-m3-${Date.now()}`;
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

      // Synthesize a small 6s raw vertical video with audio taken from INDUZAAG @ 42.0s
      const scratchRaw = join(getScratchDir(), `m3-synth-raw-${Date.now()}.mp4`);
      const rawKey = buildStorageKey("raw", "synth-dance-take.mp4");
      let renderedKeyToClean: string | null = null;
      let thumbKeyToClean: string | null = null;

      try {
        await runFfmpegTestHelper([
          "-y",
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=360x640:rate=24:duration=6",
          "-ss",
          "42.0",
          "-t",
          "6.0",
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
          scratchRaw,
        ]);

        const storedRaw = await putMediaObject(rawKey, scratchRaw, "video/mp4");

        const postId = `post-m3-${Date.now()}`;
        const clipId = `raw-m3-${Date.now()}`;
        await db.insert(socialPosts).values({
          id: postId,
          userId: testUserId,
          catalogItemId: catId,
          title: "INDUZAAG Auto-Edit Test",
          status: "editing",
          reviewStatus: "processing",
          editMode: "single_take",
          platforms: ["youtube_shorts"],
        });
        await db.insert(socialRawClips).values({
          id: clipId,
          userId: testUserId,
          postId,
          storageKey: storedRaw.key,
          fileName: "synth-dance-take.mp4",
          sizeBytes: storedRaw.sizeBytes,
          durationSec: 6,
          width: 360,
          height: 640,
          fps: 24,
          orderIndex: 0,
        });

        const job = await enqueueJob({
          userId: testUserId,
          postId,
          catalogItemId: catId,
          jobType: "render_video",
          payload: {
            postId,
            preset: "punchy",
            // Render at fast 360x640@24fps inside unit test so CI stays snappy
            renderWidth: 360,
            renderHeight: 640,
            renderFps: 24,
          },
          runAfter: new Date(Date.now() - 1_000),
        });

        const finished = await processNextJob();
        expect(finished?.id).toBe(job.id);
        expect(finished?.status).toBe("succeeded");
        expect(finished?.progress).toBe(100);

        const [updatedPost] = await db
          .select()
          .from(socialPosts)
          .where(eq(socialPosts.id, postId))
          .limit(1);
        expect(updatedPost?.reviewStatus).toBe("needs_review");
        expect(updatedPost?.videoUrl).toContain("/api/socials/media/rendered/");
        expect(updatedPost?.thumbnailUrl).toContain("/api/socials/media/thumbs/");
        expect(updatedPost?.editRecipe?.preset).toBe("punchy");

        const [updatedClip] = await db
          .select()
          .from(socialRawClips)
          .where(eq(socialRawClips.id, clipId))
          .limit(1);
        expect(Math.abs((updatedClip?.detectedOffsetSec ?? 0) - 42.0)).toBeLessThanOrEqual(0.2);

        renderedKeyToClean = updatedPost!.videoUrl!;
        thumbKeyToClean = updatedPost!.thumbnailUrl!;

        const renderedLocal = await ensureLocalMediaFile(renderedKeyToClean);
        const probed = await probeMediaFile(renderedLocal.localPath);
        expect(probed.hasVideo).toBe(true);
        expect(probed.hasAudio).toBe(true);
        expect(probed.width).toBe(360);
        expect(probed.height).toBe(640);
        expect(probed.durationSec).toBeGreaterThan(3.5);
      } finally {
        if (existsSync(scratchRaw)) unlinkSync(scratchRaw);
        await deleteMediaObject(rawKey).catch(() => {});
        if (renderedKeyToClean) await deleteMediaObject(renderedKeyToClean).catch(() => {});
        if (thumbKeyToClean) await deleteMediaObject(thumbKeyToClean).catch(() => {});
      }
    },
    25_000,
  );
});
