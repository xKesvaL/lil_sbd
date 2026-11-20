// @vitest-environment node
import { spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrackAudioAnalysis } from "#/db/schema";
import { probeMediaFile } from "./audio-analysis.server";
import {
  buildDeterministicDirectionFallback,
  createGeminiVideoProxy,
  directClipWithGemini,
  rerollCopyWithGemini,
} from "./gemini-director.server";
import { getScratchDir } from "./media-storage.server";

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
  version: 1,
  durationSec: 145,
  sampleRate: 8000,
  bpm: 200,
  beatConfidence: 0.92,
  firstBeatSec: 0.1,
  beatsSec: [38, 38.3, 38.6, 38.9],
  barsSec: [38, 39.2, 40.4, 41.6, 42.8],
  drops: [
    {
      label: "1st Drop",
      startSec: 38,
      endSec: 56,
      dropImpactSec: 42,
      peakEnergy: 0.98,
    },
  ],
  energyEnvelope: [0.2, 0.5, 0.95],
  envelopeStepSec: 1,
  analyzedAt: new Date().toISOString(),
};

describe("Milestone 4 — Token-Efficient Gemini AI Director & Copywriter", () => {
  const originalKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
  });

  it("compresses a raw vertical clip into a tiny token-efficient 360p @ 2fps muted proxy", async () => {
    const rawPath = join(getScratchDir(), `m4-raw-${Date.now()}.mp4`);
    let proxyPath: string | null = null;
    try {
      await runFfmpegHelper([
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=720x1280:rate=30:duration=4",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        rawPath,
      ]);

      const proxy = await createGeminiVideoProxy(rawPath, 60);
      proxyPath = proxy.proxyPath;
      expect(proxy.sizeBytes).toBeGreaterThan(1_000);
      expect(proxy.sizeBytes).toBeLessThan(350_000);

      const probed = await probeMediaFile(proxyPath);
      expect(probed.width).toBe(360);
      expect(probed.hasAudio).toBe(false);
      expect(probed.fps).toBeLessThanOrEqual(2.5);
    } finally {
      if (existsSync(rawPath)) unlinkSync(rawPath);
      if (proxyPath && existsSync(proxyPath)) unlinkSync(proxyPath);
    }
  });

  it("parses structured Gemini JSON, clamps timestamps safely, and supports fast copy re-roll", async () => {
    const rawPath = join(getScratchDir(), `m4-gemini-${Date.now()}.mp4`);
    try {
      await runFfmpegHelper([
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=360x640:rate=10:duration=14",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        rawPath,
      ]);

      process.env.GEMINI_API_KEY = "test-gemini-key";
      process.env.GEMINI_MODEL = "gemini-4-hydrogen";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      activeDancingStartSec: 2.5,
                      activeDancingEndSec: 13.0,
                      recommendedMasterStartSec: 40.5,
                      recommendedDurationSec: 12.0,
                      recommendedPreset: "hard",
                      sceneSummary: "Dark purple studio lighting, tight camera framing",
                      directorNotes: "Trimmed 2.5s camera walk-up to open directly into the buildup.",
                      title: "INDUZAAG (200 BPM) — Studio Drop Cut",
                      caption:
                        "Sharp zaag kicks over a real melodic backbone. INDUZAAG is streaming everywhere.",
                      hookOverlayText: "200 BPM zaag pressure",
                      hashtags: ["UptempoHardcore", "#zaagkick", "lilsbd"],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const directed = await directClipWithGemini({
        rawClipStorageKeyOrPath: rawPath,
        clipDurationSec: 14,
        detectedOffsetSec: 38,
        syncConfidence: 0.91,
        trackAnalysis: SAMPLE_ANALYSIS,
        trackContext: {
          title: "INDUZAAG",
          bpm: 200,
          stageName: "LIL SBD",
          defaultBioLink: "https://lilsbd.com",
        },
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = String(mockFetch.mock.calls[0]?.[0]);
      expect(calledUrl).toContain("gemini-4-hydrogen:generateContent");
      expect(directed.source).toBe("gemini");
      expect(directed.direction.recommendedPreset).toBe("hard");
      expect(directed.direction.recommendedMasterStartSec).toBe(40);
      expect(directed.direction.hashtags).toEqual(["#uptempohardcore", "#zaagkick", "#lilsbd"]);

      // Test copy-only fast re-roll
      const rerolled = await rerollCopyWithGemini({
        trackContext: {
          title: "INDUZAAG",
          bpm: 200,
          stageName: "LIL SBD",
          defaultBioLink: "https://lilsbd.com",
        },
        sceneSummary: directed.direction.sceneSummary,
      });
      expect(rerolled.source).toBe("gemini");
      expect(rerolled.copy.title).toContain("INDUZAAG");
    } finally {
      if (existsSync(rawPath)) unlinkSync(rawPath);
    }
  });

  it("falls back seamlessly to deterministic DSP direction when GEMINI_API_KEY is unset or rate-limited", async () => {
    delete process.env.GEMINI_API_KEY;

    const res = await directClipWithGemini({
      rawClipStorageKeyOrPath: "nonexistent-never-opened-when-no-key.mp4",
      clipDurationSec: 18,
      detectedOffsetSec: 38,
      syncConfidence: 0.85,
      trackAnalysis: SAMPLE_ANALYSIS,
      trackContext: {
        title: "INDUZAAG",
        bpm: 200,
        stageName: "LIL SBD",
        defaultBioLink: "https://lilsbd.com",
      },
      variationSeed: 1,
    });

    expect(res.source).toBe("deterministic_fallback");
    expect(res.fallbackReason).toContain("GEMINI_API_KEY");
    expect(res.direction.recommendedDurationSec).toBeGreaterThanOrEqual(4);
    expect(res.direction.caption).toContain("INDUZAAG");

    const v0 = buildDeterministicDirectionFallback({
      clipDurationSec: 18,
      detectedOffsetSec: 38,
      trackAnalysis: SAMPLE_ANALYSIS,
      trackContext: {
        title: "INDUZAAG",
        bpm: 200,
        stageName: "LIL SBD",
        defaultBioLink: "https://lilsbd.com",
      },
      variationIndex: 0,
    });
    const v1 = buildDeterministicDirectionFallback({
      clipDurationSec: 18,
      detectedOffsetSec: 38,
      trackAnalysis: SAMPLE_ANALYSIS,
      trackContext: {
        title: "INDUZAAG",
        bpm: 200,
        stageName: "LIL SBD",
        defaultBioLink: "https://lilsbd.com",
      },
      variationIndex: 1,
    });
    expect(v0.caption).not.toBe(v1.caption);
  });
});
