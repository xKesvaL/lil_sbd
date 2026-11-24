// @vitest-environment node
import { spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { TrackAudioAnalysis } from "#/db/schema";
import { clampDirectionToActiveDancingWindow } from "./gemini-director.server";
import { deleteMediaObject, getScratchDir } from "./media-storage.server";
import {
  buildMultiTakeEditRecipe,
  buildSingleTakeEditRecipe,
  buildSingleTakeFiltergraph,
  renderSingleTakeVideo,
} from "./video-editor.server";

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

const SAMPLE_ANALYSIS: TrackAudioAnalysis = {
  version: 2,
  durationSec: 120,
  sampleRate: 8000,
  bpm: 200,
  beatConfidence: 0.92,
  firstBeatSec: 0,
  beatsSec: Array.from({ length: 120 }, (_, i) => Number((30 + i * 0.3).toFixed(3))),
  barsSec: Array.from({ length: 30 }, (_, i) => Number((30 + i * 1.2).toFixed(3))),
  drops: [
    {
      id: "drop-1",
      kind: "drop",
      label: "Drop 1",
      startSec: 38,
      dropImpactSec: 42,
      endSec: 60,
      peakEnergy: 1,
    },
  ],
  energyEnvelope: [],
  envelopeStepSec: 1,
  analyzedAt: new Date().toISOString(),
};

describe("Milestone 4 — Gemini Dead-Air Trim, Timed Hook Text & Multi-Take Cut Polish", () => {
  it("clamps Gemini trim window strictly inside activeDancingStartSec..activeDancingEndSec", () => {
    // Raw clip is 22s long starting at master 36.0s (covers master 36..58s)
    // Artist walks back from phone for first 3.2s and walks to stop recording at 18.5s
    // -> active dancing in master time is [39.2, 54.5]
    const clamped = clampDirectionToActiveDancingWindow({
      recommendedMasterStartSec: 36.5, // accidentally included walk-up!
      recommendedDurationSec: 20, // accidentally extended past walk-away!
      activeDancingStartSec: 3.2,
      activeDancingEndSec: 18.5,
      clipDurationSec: 22,
      detectedOffsetSec: 36,
      trackDurationSec: 120,
    });

    expect(clamped.recommendedMasterStartSec).toBeGreaterThanOrEqual(39.2);
    expect(clamped.recommendedMasterStartSec + clamped.recommendedDurationSec).toBeLessThanOrEqual(
      54.51,
    );
    expect(clamped.recommendedDurationSec).toBeCloseTo(15.3, 1);

    // If active window is unrealistically tiny (< 4s), fall back gracefully to full valid overlap
    const fallback = clampDirectionToActiveDancingWindow({
      recommendedMasterStartSec: 38,
      recommendedDurationSec: 14,
      activeDancingStartSec: 1,
      activeDancingEndSec: 2.5,
      clipDurationSec: 22,
      detectedOffsetSec: 36,
      trackDurationSec: 120,
    });
    expect(fallback.recommendedMasterStartSec).toBe(38);
    expect(fallback.recommendedDurationSec).toBe(14);
  });

  it("adds timed multi-line hook overlay & multi-take drop-cut micro-flashes and renders cleanly via FFmpeg", async () => {
    const multiRecipe = buildMultiTakeEditRecipe({
      takes: [
        { clipId: "take-1", durationSec: 22, detectedOffsetSec: 36, syncConfidence: 0.85 },
        { clipId: "take-2", durationSec: 22, detectedOffsetSec: 36, syncConfidence: 0.81 },
      ],
      trackAnalysis: SAMPLE_ANALYSIS,
      preset: "punchy",
      audioHeadroomDb: -1.5,
      burnHookOverlay: true,
      hookOverlayText: "INDUZAAG 200 BPM — Zaag kicks with a melodic backbone",
    });

    const cutMicroFlashes = multiRecipe.fxEvents.filter(
      (e) => e.type === "drop_flash" && e.intensity === 0.48,
    );
    expect(cutMicroFlashes.length).toBeGreaterThanOrEqual(1);

    const graph = buildSingleTakeFiltergraph(multiRecipe, { width: 360, height: 640, fps: 24 });
    // Two wrapped drawtext layers with timed fade-in/out alpha expression
    const drawtextMatches = graph.videoFilter.match(/drawtext=/g) ?? [];
    expect(drawtextMatches.length).toBe(2);
    expect(graph.videoFilter).toContain("alpha='if(lt(t,");
    expect(graph.videoFilter).toContain("boxcolor=0x151124@0.72");

    // End-to-end FFmpeg verification that our timed drawtext filter renders cleanly with exit code 0
    const trackPath = resolve(process.cwd(), "public", "songs", "induzaag.mp3");
    if (!existsSync(trackPath)) return;

    const synthClip = join(getScratchDir(), `m4-hook-test-${Date.now()}.mp4`);
    let videoKey: string | null = null;
    let thumbKey: string | null = null;

    try {
      await runFfmpegHelper([
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=360x640:rate=24:duration=5",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        synthClip,
      ]);

      const singleRecipe = buildSingleTakeEditRecipe({
        clipId: "clip-hook",
        clipDurationSec: 5,
        detectedOffsetSec: 40,
        trackAnalysis: SAMPLE_ANALYSIS,
        preset: "punchy",
        audioHeadroomDb: -1.5,
        burnHookOverlay: true,
        hookOverlayText: "INDUZAAG 200 BPM — Testing the main drop",
        overrideMasterStartSec: 40,
        overrideDurationSec: 4.5,
      });

      const rendered = await renderSingleTakeVideo({
        rawClipStorageKeyOrPath: synthClip,
        masterAudioLocalPath: trackPath,
        recipe: singleRecipe,
        outputTitleSlug: "induzaag-hook-check",
        width: 360,
        height: 640,
        fps: 24,
      });

      videoKey = rendered.videoStorageKey;
      thumbKey = rendered.thumbnailStorageKey;
      expect(rendered.videoSizeBytes).toBeGreaterThan(10_000);
    } finally {
      if (existsSync(synthClip)) unlinkSync(synthClip);
      if (videoKey) await deleteMediaObject(videoKey).catch(() => {});
      if (thumbKey) await deleteMediaObject(thumbKey).catch(() => {});
    }
  }, 25_000);
});
