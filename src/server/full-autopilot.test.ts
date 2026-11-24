// @vitest-environment node
import { spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db, ensureSchemaInitialized } from "#/db";
import {
  artistCatalogItems,
  artistProfiles,
  socialPosts,
  socialRawClips,
  user,
} from "#/db/schema";
import { evaluateFullAutopilotSafetyNet } from "./autopilot-scheduler.server";
import { enqueueJob, processJobById } from "./jobs.server";
import {
  buildStorageKey,
  deleteMediaObject,
  getScratchDir,
  putMediaObject,
} from "./media-storage.server";

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

describe("Full Autopilot Mode & Smart Safety Net", () => {
  const originalGeminiKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalGeminiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    }
  });

  it("evaluates sync confidence & Gemini AI safety gates accurately", () => {
    // 1. Disabled -> stays in Review Inbox with no holdReason
    const disabled = evaluateFullAutopilotSafetyNet({
      fullAutopilotRequested: false,
      syncConfidences: [0.92],
      aiSource: "gemini",
    });
    expect(disabled.requested).toBe(false);
    expect(disabled.approved).toBe(false);
    expect(disabled.holdReason).toBeUndefined();

    // 2. Enabled + solid sync (>= 35%) + Gemini AI succeeded -> auto-approved!
    const approved = evaluateFullAutopilotSafetyNet({
      fullAutopilotRequested: true,
      syncConfidences: [0.78, 0.42],
      aiSource: "gemini",
    });
    expect(approved.requested).toBe(true);
    expect(approved.approved).toBe(true);
    expect(approved.minSyncConfidence).toBe(0.42);
    expect(approved.holdReason).toBeUndefined();

    // 3. Enabled + multi-take where one take fell back to drop-snap (< 35%) -> held!
    const lowSync = evaluateFullAutopilotSafetyNet({
      fullAutopilotRequested: true,
      syncConfidences: [0.85, 0.15],
      aiSource: "gemini",
    });
    expect(lowSync.approved).toBe(false);
    expect(lowSync.holdReason).toContain("Low audio sync");
    expect(lowSync.holdReason).toContain("15%");

    // 4. Enabled + solid sync + Gemini fell back to template copy -> held!
    const aiFallback = evaluateFullAutopilotSafetyNet({
      fullAutopilotRequested: true,
      syncConfidences: [0.88],
      aiSource: "deterministic_fallback",
      aiFallbackReason: "HTTP 429 quota exceeded",
    });
    expect(aiFallback.approved).toBe(false);
    expect(aiFallback.holdReason).toContain("Gemini AI fell back");
    expect(aiFallback.holdReason).toContain("429");

    // 5. Enabled + BOTH low sync and Gemini fallback -> combined hold reason
    const bothFailed = evaluateFullAutopilotSafetyNet({
      fullAutopilotRequested: true,
      syncConfidences: [0.15],
      aiSource: "deterministic_fallback",
      aiFallbackReason: "GEMINI_API_KEY not configured",
    });
    expect(bothFailed.approved).toBe(false);
    expect(bothFailed.holdReason).toContain("Low audio sync");
    expect(bothFailed.holdReason).toContain("Gemini AI fell back");
  });

  it(
    "auto-approves & schedules when Full Autopilot passes, and holds in Review when Gemini falls back",
    async () => {
      const trackPath = resolve(process.cwd(), "public", "songs", "induzaag.mp3");
      if (!existsSync(trackPath)) return;

      await ensureSchemaInitialized();
      const testUserId = `test-autopilot-${Date.now()}`;
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
        fullAutopilot: true,
        cadenceDays: [0, 1, 2, 3, 4, 5, 6],
        cadenceTime: "18:00",
        timezone: "Europe/Paris",
      });

      const catId = `cat-ap-${Date.now()}`;
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

      const scratchRaw = join(getScratchDir(), `ap-synth-raw-${Date.now()}.mp4`);
      const rawKey = buildStorageKey("raw", "ap-dance-take.mp4");
      const cleanupKeys: string[] = [rawKey];

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
          "6",
          "-i",
          trackPath,
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-c:a",
          "aac",
          "-shortest",
          scratchRaw,
        ]);

        await putMediaObject(rawKey, scratchRaw, "video/mp4");

        // --- Case A: Full Autopilot ON + Gemini mocked OK -> Auto-Approved & Scheduled ---
        process.env.GEMINI_API_KEY = "test-fake-gemini-key";
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          activeDancingStartSec: 0.2,
                          activeDancingEndSec: 5.8,
                          recommendedMasterStartSec: 42.2,
                          recommendedDurationSec: 5.4,
                          recommendedPreset: "punchy",
                          sceneSummary: "Studio vertical take synced to INDUZAAG drop.",
                          directorNotes: "Clean buildup into zaag drop.",
                          title: "INDUZAAG (200 BPM) — LIL SBD",
                          caption: "Testing INDUZAAG in the studio. Out everywhere — https://lilsbd.com",
                          hookOverlayText: "INDUZAAG · 200 BPM",
                          hashtags: ["#uptempohardcore", "#zaagkick", "#lilsbd"],
                        }),
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );

        const passPostId = `post-ap-pass-${Date.now()}`;
        await db.insert(socialPosts).values({
          id: passPostId,
          userId: testUserId,
          catalogItemId: catId,
          title: "INDUZAAG — Drop Clip",
          status: "editing",
          reviewStatus: "processing",
          editMode: "single_take",
          platforms: ["youtube_shorts", "instagram_reels"],
          autoPublish: false,
        });
        await db.insert(socialRawClips).values({
          id: `raw-ap-pass-${Date.now()}`,
          userId: testUserId,
          postId: passPostId,
          storageKey: rawKey,
          fileName: "ap-dance-take.mp4",
          sizeBytes: 100_000,
          durationSec: 6,
          orderIndex: 0,
        });

        const passJob = await enqueueJob({
          userId: testUserId,
          postId: passPostId,
          catalogItemId: catId,
          jobType: "render_video",
          payload: {
            postId: passPostId,
            preset: "punchy",
            fullAutopilot: true,
            renderWidth: 360,
            renderHeight: 640,
            renderFps: 24,
          },
        });

        const donePass = await processJobById(passJob.id);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(donePass?.status).toBe("succeeded");
        expect(donePass?.result?.autoApproved).toBe(true);

        const [approvedPost] = await db
          .select()
          .from(socialPosts)
          .where(eq(socialPosts.id, passPostId))
          .limit(1);

        expect(approvedPost?.reviewStatus).toBe("approved");
        expect(approvedPost?.autoPublish).toBe(true);
        expect(approvedPost?.scheduledFor).toBeTruthy();
        expect(approvedPost?.platformDeliveries?.youtube_shorts?.status).toBe("scheduled");
        expect(approvedPost?.platformDeliveries?.instagram_reels?.status).toBe("scheduled");
        expect(approvedPost?.editRecipe?.autopilotEvaluation?.approved).toBe(true);
        if (approvedPost?.videoUrl) cleanupKeys.push(approvedPost.videoUrl);
        if (approvedPost?.thumbnailUrl) cleanupKeys.push(approvedPost.thumbnailUrl);

        // --- Case B: Full Autopilot ON + No GEMINI_API_KEY (fallback) -> Held in Review ---
        delete process.env.GEMINI_API_KEY;
        const heldPostId = `post-ap-held-${Date.now()}`;
        await db.insert(socialPosts).values({
          id: heldPostId,
          userId: testUserId,
          catalogItemId: catId,
          title: "INDUZAAG — Held Clip",
          status: "editing",
          reviewStatus: "processing",
          editMode: "single_take",
          platforms: ["youtube_shorts"],
          autoPublish: false,
        });
        await db.insert(socialRawClips).values({
          id: `raw-ap-held-${Date.now()}`,
          userId: testUserId,
          postId: heldPostId,
          storageKey: rawKey,
          fileName: "ap-dance-take.mp4",
          sizeBytes: 100_000,
          durationSec: 6,
          orderIndex: 0,
        });

        const heldJob = await enqueueJob({
          userId: testUserId,
          postId: heldPostId,
          catalogItemId: catId,
          jobType: "render_video",
          payload: {
            postId: heldPostId,
            preset: "punchy",
            fullAutopilot: true,
            renderWidth: 360,
            renderHeight: 640,
            renderFps: 24,
          },
        });

        const doneHeld = await processJobById(heldJob.id);
        expect(doneHeld?.status).toBe("succeeded");
        expect(doneHeld?.result?.autoApproved).toBe(false);

        const [heldPost] = await db
          .select()
          .from(socialPosts)
          .where(eq(socialPosts.id, heldPostId))
          .limit(1);

        expect(heldPost?.reviewStatus).toBe("needs_review");
        expect(heldPost?.autoPublish).toBe(false);
        expect(heldPost?.editRecipe?.autopilotEvaluation?.requested).toBe(true);
        expect(heldPost?.editRecipe?.autopilotEvaluation?.approved).toBe(false);
        expect(heldPost?.editRecipe?.autopilotEvaluation?.holdReason).toContain(
          "Gemini AI fell back",
        );
        if (heldPost?.videoUrl) cleanupKeys.push(heldPost.videoUrl);
        if (heldPost?.thumbnailUrl) cleanupKeys.push(heldPost.thumbnailUrl);
      } finally {
        if (existsSync(scratchRaw)) unlinkSync(scratchRaw);
        for (const k of cleanupKeys) {
          await deleteMediaObject(k).catch(() => {});
        }
      }
    },
    30_000,
  );
});
