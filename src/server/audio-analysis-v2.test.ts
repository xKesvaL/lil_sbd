import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { TrackAudioAnalysis } from "#/db/schema";
import { analyzeAudioFile } from "./audio-analysis.server";
import { buildMultiTakeEditRecipe, buildSingleTakeEditRecipe } from "./video-editor.server";

const songPath = (name: string) => resolve(process.cwd(), "public", "songs", name);

describe("Audio Brain v2 — High-Precision BPM, Multi-BPM, Unlimited Drops, Kick Switches & Kickrolls", () => {
  it("detects exact BPM without 200 BPM bias on real Lil SBD catalog tracks", async () => {
    const kinoPath = songPath("kino.mp3");
    const damnedPath = songPath("we-are-damned.mp3");
    const hardcorePath = songPath("hardcore-power.mp3");
    if (!existsSync(kinoPath) || !existsSync(damnedPath) || !existsSync(hardcorePath)) {
      return;
    }

    const [kino, damned, hardcore] = await Promise.all([
      analyzeAudioFile(kinoPath),
      analyzeAudioFile(damnedPath),
      analyzeAudioFile(hardcorePath),
    ]);

    expect(kino.version).toBe(2);
    expect(kino.bpm).toBe(175);
    expect(kino.drops.length).toBeGreaterThan(4); // No more artificial 3-drop cap!
    expect(kino.drops.some((d) => d.kind === "highlight")).toBe(true);

    expect(damned.bpm).toBe(220);
    expect(damned.drops.length).toBeGreaterThan(4);

    expect(hardcore.bpm).toBe(200);
    expect(hardcore.drops.length).toBeGreaterThan(5);
  }, 30_000);

  it("detects multi-BPM non-multiple tempo switches natively on CAFFEINE (140 -> 220 -> 260 BPM)", async () => {
    const caffeinePath = songPath("caffeine.mp3");
    if (!existsSync(caffeinePath)) return;

    const res = await analyzeAudioFile(caffeinePath);
    expect(res.bpmRange).toEqual([140, 260]);
    const sectionBpms = new Set(res.drops.map((d) => d.bpm));
    expect(sectionBpms.has(140)).toBe(true);
    expect(sectionBpms.has(220)).toBe(true);
    expect(sectionBpms.has(260)).toBe(true);
  }, 20_000);

  it("respects lockedBpm override when user locks BPM manually", async () => {
    const kinoPath = songPath("kino.mp3");
    if (!existsSync(kinoPath)) return;

    const locked = await analyzeAudioFile(kinoPath, 175, { lockedBpm: 180 });
    expect(locked.bpm).toBe(180);
    expect(locked.bpmLocked).toBe(true);
    expect(locked.bpmRange).toBeUndefined();
  }, 15_000);

  it("triggers dedicated FX and forces hard angle cuts on Drops and Highlights", () => {
    const analysis: TrackAudioAnalysis = {
      version: 2,
      durationSec: 60,
      sampleRate: 11025,
      bpm: 200,
      beatConfidence: 0.95,
      firstBeatSec: 0,
      beatsSec: Array.from({ length: 200 }, (_, i) => Number((i * 0.3).toFixed(3))),
      barsSec: Array.from({ length: 50 }, (_, i) => Number((i * 1.2).toFixed(3))),
      drops: [
        {
          id: "d1",
          kind: "drop",
          label: "Drop 1",
          startSec: 10,
          endSec: 32,
          dropImpactSec: 14,
          peakEnergy: 0.98,
          bpm: 200,
        },
        {
          id: "hl1",
          kind: "highlight",
          label: "Highlight",
          startSec: 20,
          endSec: 32,
          dropImpactSec: 22.4,
          peakEnergy: 0.94,
          bpm: 200,
        },
      ],
      energyEnvelope: Array(80).fill(0.8),
      envelopeStepSec: 0.75,
      analyzedAt: new Date().toISOString(),
    };

    const single = buildSingleTakeEditRecipe({
      clipId: "clip-1",
      clipDurationSec: 25,
      detectedOffsetSec: 8,
      trackAnalysis: analysis,
      preset: "punchy",
      audioHeadroomDb: -1.5,
      overrideMasterStartSec: 10,
      overrideDurationSec: 18,
    });

    // Drop at rel 4.0s gets full flash (1.0), Highlight at rel 12.4s gets crisp flash (0.78)
    const flashes = single.fxEvents.filter((e) => e.type === "drop_flash");
    expect(flashes.some((f) => Math.abs(f.timeSec - 4.0) < 0.05 && f.intensity === 1.0)).toBe(true);
    expect(flashes.some((f) => Math.abs(f.timeSec - 12.4) < 0.05 && f.intensity < 1.0)).toBe(true);

    const multi = buildMultiTakeEditRecipe({
      takes: [
        { clipId: "take-a", durationSec: 25, detectedOffsetSec: 8, syncConfidence: 0.9 },
        { clipId: "take-b", durationSec: 25, detectedOffsetSec: 8, syncConfidence: 0.9 },
      ],
      trackAnalysis: analysis,
      preset: "punchy",
      audioHeadroomDb: -1.5,
      overrideMasterStartSec: 10,
      overrideDurationSec: 18,
    });

    // Hard angle cuts must align directly onto both Drop (14s) and Highlight (22.4s)
    expect(multi.segments.some((s) => Math.abs(s.masterStartSec - 14.0) < 0.05)).toBe(true);
    expect(multi.segments.some((s) => Math.abs(s.masterStartSec - 22.4) < 0.05)).toBe(true);
  });
});
