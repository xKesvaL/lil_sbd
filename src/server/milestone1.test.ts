// @vitest-environment node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, ensureSchemaInitialized } from "#/db";
import { artistCatalogItems, backgroundJobs, user } from "#/db/schema";
import { analyzeAudioFile, analyzePcmSamples } from "./audio-analysis.server";
import { enqueueJob, processNextJob, registerJobHandler } from "./jobs.server";
import {
  buildStorageKey,
  deleteMediaObject,
  mediaObjectExists,
  normalizeStorageKey,
  putMediaObject,
  readMediaBuffer,
} from "./media-storage.server";

describe("Milestone 1 — MediaStorage, Audio DSP Analyzer & Background Job Queue", () => {
  it("normalizes keys safely, blocks traversal, and stores/reads/deletes on local NVMe", async () => {
    expect(normalizeStorageKey("/api/socials/media/clip.mp4")).toBe("socials/clip.mp4");
    expect(normalizeStorageKey("rendered/test-reel.mp4")).toBe("rendered/test-reel.mp4");
    expect(normalizeStorageKey("/api/socials/media/masters/demo.wav")).toBe("masters/demo.wav");
    expect(() => normalizeStorageKey("../secret.env")).toThrow();
    expect(() => normalizeStorageKey("unknown/file.mp4")).toThrow();

    const key = buildStorageKey("masters", "Test Demo Track.wav");
    expect(key.startsWith("masters/")).toBe(true);
    expect(key.endsWith(".wav")).toBe(true);

    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const stored = await putMediaObject(key, payload, "audio/wav");
    expect(stored.sizeBytes).toBe(8);
    expect(stored.publicUrl).toBe(`/api/socials/media/${key}`);
    expect(await mediaObjectExists(key)).toBe(true);

    const readBack = await readMediaBuffer(key);
    expect(Array.from(readBack)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    await deleteMediaObject(key);
    expect(await mediaObjectExists(key)).toBe(false);
  });

  it("accurately detects 200 BPM beat grid and buildup -> drop section on synthetic uptempo PCM", () => {
    const sampleRate = 8000;
    const durationSec = 24;
    const samples = new Float32Array(sampleRate * durationSec);
    const beatPeriodSec = 60 / 200; // 0.300s (200 BPM)

    // Quiet buildup from 0..8s, loud zaag drop from 8..20s, quiet outro 20..24s
    for (let i = 0; i < samples.length; i++) {
      const t = i / sampleRate;
      const beatPhase = (t % beatPeriodSec) / beatPeriodSec;
      const inDrop = t >= 8 && t <= 20;
      const env = Math.exp(-beatPhase * 12);
      const amp = inDrop ? 0.9 : 0.18;
      // Kick punch + harmonic buzz
      samples[i] =
        amp * env * Math.sin(2 * Math.PI * (65 + 90 * Math.exp(-beatPhase * 20)) * t) +
        (inDrop ? 0.25 * Math.sin(2 * Math.PI * 440 * t) : 0);
    }

    const analysis = analyzePcmSamples(samples, { sampleRate, hintBpm: 200 });
    expect(analysis.bpm).toBeGreaterThanOrEqual(199);
    expect(analysis.bpm).toBeLessThanOrEqual(201);
    expect(analysis.beatsSec.length).toBeGreaterThan(70);
    expect(analysis.barsSec.length).toBeGreaterThan(15);
    expect(analysis.drops.length).toBeGreaterThanOrEqual(1);
    // Drop impact should land right around t = 8s
    expect(analysis.drops[0]!.dropImpactSec).toBeGreaterThanOrEqual(6.5);
    expect(analysis.drops[0]!.dropImpactSec).toBeLessThanOrEqual(9.5);
  });

  it("analyzes a real Lil SBD track via FFmpeg (public/songs/induzaag.mp3)", async () => {
    const trackPath = resolve(process.cwd(), "public", "songs", "induzaag.mp3");
    if (!existsSync(trackPath)) return;

    const analysis = await analyzeAudioFile(trackPath, 200);
    expect(analysis.durationSec).toBeGreaterThan(60);
    expect(analysis.bpm).toBeGreaterThanOrEqual(150);
    expect(analysis.bpm).toBeLessThanOrEqual(235);
    expect(analysis.beatsSec.length).toBeGreaterThan(100);
    expect(analysis.drops.length).toBeGreaterThanOrEqual(1);
    expect(analysis.energyEnvelope.length).toBeGreaterThanOrEqual(60);
  });

  it("enqueues, claims, retries with backoff, and completes background jobs including analyze_track", async () => {
    await ensureSchemaInitialized();

    const testUserId = `test-m1-worker-${Date.now()}`;
    await db.insert(user).values({
      id: testUserId,
      name: "LIL SBD",
      email: `${testUserId}@lilsbd.com`,
      emailVerified: true,
    });

    // 1. Test retry backoff on failure
    let calls = 0;
    registerJobHandler("cleanup_media", async () => {
      calls++;
      if (calls === 1) {
        throw new Error("Simulated transient error");
      }
      return { cleaned: 2 };
    });

    const retryJob = await enqueueJob({
      userId: testUserId,
      jobType: "cleanup_media",
      maxAttempts: 3,
      runAfter: new Date(Date.now() - 10_000),
    });

    // Drain any prior unrelated queued jobs first if present
    let result = await processNextJob();
    while (result && result.id !== retryJob.id) {
      result = await processNextJob();
    }
    expect(result?.id).toBe(retryJob.id);
    expect(result?.status).toBe("queued"); // Re-queued for retry 1/3
    expect(result?.attempts).toBe(1);
    expect(result?.error).toContain("Simulated transient error");

    // Fast-forward runAfter and re-run -> should succeed on attempt 2
    await db
      .update(backgroundJobs)
      .set({ runAfter: new Date(Date.now() - 1_000) })
      .where(eq(backgroundJobs.id, retryJob.id));

    const secondRun = await processNextJob();
    expect(secondRun?.id).toBe(retryJob.id);
    expect(secondRun?.status).toBe("succeeded");
    expect(secondRun?.progress).toBe(100);
    expect(secondRun?.result).toEqual({ cleaned: 2 });

    // 2. Test full analyze_track job updating artist_catalog_items.audio_analysis
    const trackPath = resolve(process.cwd(), "public", "songs", "induzaag.mp3");
    if (existsSync(trackPath)) {
      const catId = `cat-m1-${Date.now()}`;
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

      const analyzeJob = await enqueueJob({
        userId: testUserId,
        catalogItemId: catId,
        jobType: "analyze_track",
        payload: { catalogItemId: catId },
        runAfter: new Date(Date.now() - 1_000),
      });

      const finished = await processNextJob();
      expect(finished?.id).toBe(analyzeJob.id);
      expect(finished?.status).toBe("succeeded");

      const updatedCat = await db
        .select()
        .from(artistCatalogItems)
        .where(eq(artistCatalogItems.id, catId))
        .limit(1);
      expect(updatedCat[0]?.audioAnalysis).toBeTruthy();
      expect(updatedCat[0]?.audioAnalysis?.drops.length).toBeGreaterThanOrEqual(1);
    }
  });
});
