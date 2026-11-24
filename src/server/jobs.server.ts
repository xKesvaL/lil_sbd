import { existsSync, unlinkSync } from "node:fs";
import { and, asc, desc, eq, lte, or } from "drizzle-orm";
import { db, ensureSchemaInitialized } from "#/db";
import {
  artistCatalogItems,
  artistProfiles,
  type BackgroundJobRecord,
  type BackgroundJobType,
  backgroundJobs,
  type EditPreset,
  type JsonRecord,
  type PlatformDeliveries,
  type PublishablePlatform,
  socialPosts,
  socialRawClips,
} from "#/db/schema";
import {
  analyzeAudioFile,
  analyzeCatalogItemAudio,
  resolveCatalogAudioFile,
} from "./audio-analysis.server";
import { syncRawClipFileToMasterFile } from "./audio-sync.server";
import {
  enqueueDueAutopilotPosts,
  evaluateFullAutopilotSafetyNet,
  findNextAvailableSlot,
} from "./autopilot-scheduler.server";
import {
  notifyClipHeldForReview,
  notifyPublishFailed,
  notifyTikTokInboxReady,
  scanAndNotifyExpiringTokens,
} from "./discord-alerts.server";
import { directClipWithGemini } from "./gemini-director.server";
import { runMediaLifecycleCleanup } from "./media-cleanup.server";
import {
  assemblePostCaption,
  isPublishablePlatform,
  publishSocialPostToPlatforms,
} from "./social-publisher.server";
import {
  buildMultiTakeEditRecipe,
  buildSingleTakeEditRecipe,
  renderMultiTakeVideo,
  renderSingleTakeVideo,
} from "./video-editor.server";

export interface JobContext {
  job: BackgroundJobRecord;
  setProgress: (progress: number, stageLabel: string) => Promise<void>;
}

export type JobHandler = (ctx: JobContext) => Promise<JsonRecord | void>;

const globalForWorker = globalThis as unknown as {
  __lilSbdJobHandlers?: Map<BackgroundJobType, JobHandler>;
  __lilSbdCustomJobHandlers?: Map<BackgroundJobType, JobHandler>;
  __lilSbdWorkerStarted?: boolean;
  __lilSbdWorkerTimerV2?: ReturnType<typeof setInterval>;
  __lilSbdWorkerBusy?: boolean;
  __lilSbdWorkerTick?: () => Promise<void>;
};

// Module-scoped default handlers so Vite HMR always uses the latest freshly imported closures
const defaultJobHandlers = new Map<BackgroundJobType, JobHandler>();
let moduleDefaultsInitialized = false;

function getCustomHandlerMap(): Map<BackgroundJobType, JobHandler> {
  if (!globalForWorker.__lilSbdCustomJobHandlers) {
    globalForWorker.__lilSbdCustomJobHandlers = new Map();
  }
  return globalForWorker.__lilSbdCustomJobHandlers;
}

function syncLegacyHandlerMap(): void {
  if (!globalForWorker.__lilSbdJobHandlers) {
    globalForWorker.__lilSbdJobHandlers = new Map();
  }
  const custom = getCustomHandlerMap();
  for (const [k, v] of defaultJobHandlers.entries()) {
    globalForWorker.__lilSbdJobHandlers.set(k, custom.get(k) ?? v);
  }
  for (const [k, v] of custom.entries()) {
    globalForWorker.__lilSbdJobHandlers.set(k, v);
  }
}

function resolveJobHandler(jobType: BackgroundJobType): JobHandler | undefined {
  ensureDefaultJobHandlersRegistered();
  return getCustomHandlerMap().get(jobType) ?? defaultJobHandlers.get(jobType);
}

export function registerJobHandler(jobType: BackgroundJobType, handler: JobHandler): void {
  ensureDefaultJobHandlersRegistered();
  getCustomHandlerMap().set(jobType, handler);
  syncLegacyHandlerMap();
}

/**
 * Registers built-in background job handlers across all studio pipelines.
 * Stored module-locally so HMR reloads never retain stale handler closures.
 */
export function ensureDefaultJobHandlersRegistered(): void {
  if (moduleDefaultsInitialized) return;
  moduleDefaultsInitialized = true;

  defaultJobHandlers.set("analyze_track", async ({ job, setProgress }) => {
    const catalogItemId =
      job.catalogItemId || (job.payload?.catalogItemId as string | undefined);
    if (!catalogItemId) {
      throw new Error("Missing catalogItemId for analyze_track job");
    }

    await setProgress(15, "Loading track audio...");
    const rows = await db
      .select()
      .from(artistCatalogItems)
      .where(
        and(
          eq(artistCatalogItems.id, catalogItemId),
          eq(artistCatalogItems.userId, job.userId),
        ),
      )
      .limit(1);

    const item = rows[0];
    if (!item) {
      throw new Error(`Catalog track not found: ${catalogItemId}`);
    }

    await setProgress(45, "Detecting BPM, beat grid, drops & kick switches...");
    const analysis = await analyzeCatalogItemAudio(item);

    // Preserve any user-created manual markers when re-analyzing
    const manualMarkers = (item.audioAnalysis?.drops ?? []).filter((d) => d.isManual);
    if (manualMarkers.length > 0) {
      const merged = [...analysis.drops];
      for (const m of manualMarkers) {
        if (!merged.some((d) => Math.abs(d.dropImpactSec - m.dropImpactSec) < 0.75)) {
          merged.push(m);
        }
      }
      merged.sort((a, b) => a.dropImpactSec - b.dropImpactSec);
      analysis.drops = merged;
    }

    await setProgress(85, "Saving cached audio analysis...");
    const hookTimestamps = analysis.drops.map((d) => ({
      label: d.label,
      startSec: Math.round(d.startSec),
      endSec: Math.round(d.endSec),
    }));

    await db
      .update(artistCatalogItems)
      .set({
        bpm: item.audioAnalysis?.bpmLocked && item.bpm ? item.bpm : Math.round(analysis.bpm),
        audioAnalysis: analysis,
        hookTimestamps: hookTimestamps.length > 0 ? hookTimestamps : item.hookTimestamps,
        updatedAt: new Date(),
      })
      .where(eq(artistCatalogItems.id, item.id));

    await setProgress(100, "Track analysis complete");
    return {
      catalogItemId: item.id,
      bpm: analysis.bpm,
      durationSec: analysis.durationSec,
      dropCount: analysis.drops.length,
      beatCount: analysis.beatsSec.length,
    };
  });

  defaultJobHandlers.set("publish_post", async ({ job, setProgress }) => {
    const postId = job.postId || (job.payload?.postId as string | undefined);
    if (!postId) {
      throw new Error("Missing postId for publish_post job");
    }

    await setProgress(15, "Loading post & platform connections...");
    const postRows = await db
      .select()
      .from(socialPosts)
      .where(and(eq(socialPosts.id, postId), eq(socialPosts.userId, job.userId)))
      .limit(1);

    const post = postRows[0];
    if (!post) {
      throw new Error(`Post not found: ${postId}`);
    }

    const rawRequested = Array.isArray(job.payload?.platforms)
      ? (job.payload.platforms as string[]).filter((p): p is PublishablePlatform =>
          isPublishablePlatform(p as PublishablePlatform),
        )
      : (post.platforms ?? []).filter(isPublishablePlatform);

    // Only attempt platforms not already published/inbox_ready so retries never double-post
    const pendingPlatforms = rawRequested.filter((p) => {
      const st = post.platformDeliveries?.[p]?.status;
      return st !== "published" && st !== "inbox_ready";
    });

    if (pendingPlatforms.length === 0) {
      await setProgress(100, "Already published to all target platforms");
      return { postId, allSucceeded: true, anySucceeded: true, skipped: true };
    }

    // Mark platforms as publishing so UI reflects live upload state
    const publishingDeliveries = { ...(post.platformDeliveries ?? {}) };
    for (const p of pendingPlatforms) {
      publishingDeliveries[p] = {
        status: "publishing",
        updatedAt: new Date().toISOString(),
      };
    }
    await db
      .update(socialPosts)
      .set({ platformDeliveries: publishingDeliveries, updatedAt: new Date() })
      .where(eq(socialPosts.id, post.id));

    await setProgress(45, `Uploading to ${pendingPlatforms.join(", ")}...`);
    const result = await publishSocialPostToPlatforms(post.id, job.userId, pendingPlatforms);

    if (
      pendingPlatforms.includes("tiktok") &&
      result.deliveries.tiktok?.status === "inbox_ready"
    ) {
      await notifyTikTokInboxReady({
        userId: job.userId,
        postTitle: post.title,
        captionPreview: assemblePostCaption(post),
      });
    }

    if (!result.allSucceeded) {
      const errors = pendingPlatforms
        .map((p) =>
          result.deliveries[p]?.error ? `${p}: ${result.deliveries[p]?.error}` : null,
        )
        .filter(Boolean);
      throw new Error(errors.join(" | ") || "One or more platforms failed to publish");
    }

    await setProgress(100, "Published to all target platforms");
    return {
      postId: post.id,
      allSucceeded: result.allSucceeded,
      anySucceeded: result.anySucceeded,
      skipped: false,
    };
  });

  defaultJobHandlers.set("render_video", async ({ job, setProgress }) => {
    const postId = job.postId || (job.payload?.postId as string | undefined);
    if (!postId) {
      throw new Error("Missing postId for render_video job");
    }

    await setProgress(8, "Loading clip & track metadata...");
    const [postRows, profileRows, rawClips] = await Promise.all([
      db
        .select()
        .from(socialPosts)
        .where(and(eq(socialPosts.id, postId), eq(socialPosts.userId, job.userId)))
        .limit(1),
      db
        .select()
        .from(artistProfiles)
        .where(eq(artistProfiles.userId, job.userId))
        .limit(1),
      db
        .select()
        .from(socialRawClips)
        .where(eq(socialRawClips.postId, postId))
        .orderBy(asc(socialRawClips.orderIndex)),
    ]);

    const post = postRows[0];
    if (!post) throw new Error(`Post not found: ${postId}`);
    const primaryClip = rawClips[0];
    if (!primaryClip) throw new Error("No raw clip found for auto-editing.");
    if (!post.catalogItemId) {
      throw new Error("Select a track before running beat-synced auto-editing.");
    }

    const trackRows = await db
      .select()
      .from(artistCatalogItems)
      .where(
        and(
          eq(artistCatalogItems.id, post.catalogItemId),
          eq(artistCatalogItems.userId, job.userId),
        ),
      )
      .limit(1);
    const track = trackRows[0];
    if (!track) throw new Error("Linked catalog track not found.");

    const profile = profileRows[0];
    const masterFile = await resolveCatalogAudioFile(track);

    try {
      // 1. Ensure track audio analysis exists (cached once per track)
      let trackAnalysis = track.audioAnalysis;
      if (!trackAnalysis) {
        await setProgress(20, `Analyzing beats & drops for ${track.title}...`);
        trackAnalysis = await analyzeAudioFile(masterFile.localPath, track.bpm);
        await db
          .update(artistCatalogItems)
          .set({
            bpm: Math.round(trackAnalysis.bpm),
            audioAnalysis: trackAnalysis,
            updatedAt: new Date(),
          })
          .where(eq(artistCatalogItems.id, track.id));
      }

      // 2. Acoustic auto-sync for EVERY raw clip (single-take or 2–5 take mashup)
      const forceResync = Boolean(job.payload?.forceResync);
      const overrideOffsetSec =
        typeof job.payload?.overrideOffsetSec === "number"
          ? job.payload.overrideOffsetSec
          : undefined;

      const syncedClips: Array<{
        id: string;
        storageKey: string;
        durationSec: number;
        detectedOffsetSec: number;
        syncConfidence: number;
      }> = [];

      for (let i = 0; i < rawClips.length; i++) {
        const clip = rawClips[i]!;
        let detectedOffsetSec = clip.detectedOffsetSec;
        let syncConfidence = clip.syncConfidence;

        if (i === 0 && overrideOffsetSec !== undefined) {
          detectedOffsetSec = overrideOffsetSec;
          syncConfidence = 1;
          await db
            .update(socialRawClips)
            .set({ detectedOffsetSec, syncConfidence })
            .where(eq(socialRawClips.id, clip.id));
        } else if (detectedOffsetSec === null || detectedOffsetSec === undefined || forceResync) {
          const syncPct = Math.round(28 + ((i + 1) / Math.max(1, rawClips.length)) * 16);
          await setProgress(
            syncPct,
            rawClips.length > 1
              ? `Auto-syncing take ${i + 1}/${rawClips.length} to master track...`
              : "Auto-syncing phone audio to master track...",
          );
          const sync = await syncRawClipFileToMasterFile({
            rawClipStorageKeyOrPath: clip.storageKey,
            masterAudioLocalPath: masterFile.localPath,
            trackAnalysis,
          });
          detectedOffsetSec = sync.offsetSec;
          syncConfidence = sync.confidence;
          await db
            .update(socialRawClips)
            .set({ detectedOffsetSec, syncConfidence })
            .where(eq(socialRawClips.id, clip.id));
        }

        syncedClips.push({
          id: clip.id,
          storageKey: clip.storageKey,
          durationSec: clip.durationSec ?? 18,
          detectedOffsetSec: detectedOffsetSec ?? 0,
          syncConfidence: syncConfidence ?? 0,
        });
      }

      const primarySynced = syncedClips[0]!;
      const isMultiTake = syncedClips.length > 1;

      // 3. Token-Efficient Gemini AI Director (360p @ 2fps proxy + DSP JSON -> trim, FX & copy)
      const skipAiDirector = Boolean(job.payload?.skipAiDirector);
      const variationSeed =
        typeof job.payload?.variationSeed === "number" ? job.payload.variationSeed : undefined;

      let aiDirectionResult: Awaited<ReturnType<typeof directClipWithGemini>> | null = null;
      if (!skipAiDirector) {
        await setProgress(48, "AI Director analyzing clip & writing copy...");
        aiDirectionResult = await directClipWithGemini({
          rawClipStorageKeyOrPath: primarySynced.storageKey,
          clipDurationSec: primarySynced.durationSec,
          detectedOffsetSec: primarySynced.detectedOffsetSec,
          syncConfidence: primarySynced.syncConfidence,
          trackAnalysis,
          trackContext: {
            title: track.title,
            bpm: Math.round(trackAnalysis.bpm || track.bpm || 200),
            albumOrChapter: track.albumOrChapter,
            releaseDate: track.releaseDate,
            stageName: profile?.stageName || "LIL SBD",
            defaultBioLink: profile?.defaultBioLink || "https://lilsbd.com",
            streamingUrl: track.streamingLinks?.spotify || track.streamingLinks?.soundcloud || null,
          },
          preferredPreset:
            (job.payload?.preset as EditPreset | undefined) ||
            profile?.defaultEditPreset ||
            "punchy",
          profileGeminiModel: profile?.geminiModel,
          variationSeed,
          previousTitle: post.title,
          takeCount: syncedClips.length,
        });
      }

      // 4. Build beat-synced single-take OR multi-take beat-cut edit recipe
      await setProgress(
        58,
        isMultiTake
          ? `Planning multi-take beat cuts across ${syncedClips.length} angles...`
          : "Planning beat-synced zooms & drop FX...",
      );
      const preset =
        (job.payload?.preset as EditPreset | undefined) ||
        aiDirectionResult?.direction.recommendedPreset ||
        post.editRecipe?.preset ||
        profile?.defaultEditPreset ||
        "punchy";

      const headroomDb =
        typeof job.payload?.audioHeadroomDb === "number"
          ? job.payload.audioHeadroomDb
          : (post.editRecipe?.audioHeadroomDb ?? profile?.audioHeadroomDb ?? -1.5);

      const burnHookOverlay =
        typeof job.payload?.burnHookOverlay === "boolean"
          ? job.payload.burnHookOverlay
          : (post.editRecipe?.burnHookOverlay ?? profile?.burnHookOverlay ?? false);

      const hookOverlayText =
        typeof job.payload?.hookOverlayText === "string" && job.payload.hookOverlayText.trim()
          ? job.payload.hookOverlayText
          : (aiDirectionResult?.direction.hookOverlayText ||
            post.editRecipe?.hookOverlayText ||
            post.onScreenHookEn ||
            "");

      const overrideMasterStartSec =
        typeof job.payload?.overrideMasterStartSec === "number"
          ? job.payload.overrideMasterStartSec
          : aiDirectionResult?.direction.recommendedMasterStartSec;
      const overrideDurationSec =
        typeof job.payload?.overrideDurationSec === "number"
          ? job.payload.overrideDurationSec
          : aiDirectionResult?.direction.recommendedDurationSec;

      const recipe = isMultiTake
        ? buildMultiTakeEditRecipe({
            takes: syncedClips.map((c) => ({
              clipId: c.id,
              durationSec: c.durationSec,
              detectedOffsetSec: c.detectedOffsetSec,
              syncConfidence: c.syncConfidence,
            })),
            trackAnalysis,
            preset,
            audioHeadroomDb: headroomDb,
            burnHookOverlay,
            hookOverlayText,
            overrideMasterStartSec,
            overrideDurationSec,
            preferredTakeOrder: aiDirectionResult?.direction.preferredTakeOrder,
            variationSeed: variationSeed ?? 0,
          })
        : buildSingleTakeEditRecipe({
            clipId: primarySynced.id,
            clipDurationSec: primarySynced.durationSec,
            detectedOffsetSec: primarySynced.detectedOffsetSec,
            trackAnalysis,
            preset,
            audioHeadroomDb: headroomDb,
            burnHookOverlay,
            hookOverlayText,
            overrideMasterStartSec,
            overrideDurationSec,
          });

      if (aiDirectionResult) {
        recipe.aiDirector = {
          source: aiDirectionResult.source,
          model: aiDirectionResult.model,
          sceneSummary: aiDirectionResult.direction.sceneSummary,
          directorNotes: aiDirectionResult.direction.directorNotes,
          fallbackReason: aiDirectionResult.fallbackReason,
          directedAt: new Date().toISOString(),
        };
      } else if (post.editRecipe?.aiDirector) {
        recipe.aiDirector = post.editRecipe.aiDirector;
      }

      // 5. Native FFmpeg vertical render + thumbnail
      await setProgress(
        72,
        isMultiTake
          ? `Rendering ${syncedClips.length}-angle beat-cut mashup (${recipe.segments.length} cuts)...`
          : `Rendering ${preset} 1080×1920 edit via FFmpeg...`,
      );
      const renderWidth =
        typeof job.payload?.renderWidth === "number" ? job.payload.renderWidth : 1080;
      const renderHeight =
        typeof job.payload?.renderHeight === "number" ? job.payload.renderHeight : 1920;
      const renderFps =
        typeof job.payload?.renderFps === "number" ? job.payload.renderFps : 30;

      const clipsById = new Map(syncedClips.map((c) => [c.id, c.storageKey]));
      const rendered = isMultiTake
        ? await renderMultiTakeVideo({
            clipsById,
            masterAudioLocalPath: masterFile.localPath,
            recipe,
            outputTitleSlug: `${track.slug || track.title}-${post.id.slice(-5)}`,
            width: renderWidth,
            height: renderHeight,
            fps: renderFps,
          })
        : await renderSingleTakeVideo({
            rawClipStorageKeyOrPath: primarySynced.storageKey,
            masterAudioLocalPath: masterFile.localPath,
            recipe,
            outputTitleSlug: `${track.slug || track.title}-${post.id.slice(-5)}`,
            width: renderWidth,
            height: renderHeight,
            fps: renderFps,
          });

      await setProgress(94, "Evaluating Autopilot safety net & finalizing...");
      const nextTitle = aiDirectionResult?.direction.title || post.title;
      const nextCaption = aiDirectionResult?.direction.caption || post.captionEn;
      const nextHashtags =
        aiDirectionResult?.direction.hashtags?.length
          ? aiDirectionResult.direction.hashtags
          : post.hashtags;

      const fullAutopilotRequested =
        !skipAiDirector &&
        (typeof job.payload?.fullAutopilot === "boolean"
          ? job.payload.fullAutopilot
          : Boolean(profile?.fullAutopilot));

      const autopilotEval = evaluateFullAutopilotSafetyNet({
        fullAutopilotRequested,
        syncConfidences: syncedClips.map((c) => c.syncConfidence),
        aiSource: aiDirectionResult?.source ?? "skipped",
        aiFallbackReason: aiDirectionResult?.fallbackReason,
      });

      recipe.autopilotEvaluation = {
        ...autopilotEval,
        evaluatedAt: new Date().toISOString(),
      };

      let nextScheduledFor = post.scheduledFor;
      let nextDeliveries: PlatformDeliveries = { ...(post.platformDeliveries ?? {}) };

      if (autopilotEval.approved) {
        if (
          !nextScheduledFor ||
          Number.isNaN(new Date(nextScheduledFor).getTime()) ||
          new Date(nextScheduledFor).getTime() < Date.now() + 60_000
        ) {
          const allUserPosts = await db
            .select()
            .from(socialPosts)
            .where(eq(socialPosts.userId, job.userId));
          nextScheduledFor = findNextAvailableSlot({
            profile,
            existingPosts: allUserPosts,
            catalogItemId: post.catalogItemId,
            excludePostId: post.id,
          });
        }
        for (const p of (post.platforms ?? []).filter(isPublishablePlatform)) {
          const cur = nextDeliveries[p]?.status;
          if (!cur || cur === "idle" || cur === "failed") {
            nextDeliveries[p] = {
              status: "scheduled",
              updatedAt: new Date().toISOString(),
            };
          }
        }
      }

      await db
        .update(socialPosts)
        .set({
          title: nextTitle,
          captionEn: nextCaption,
          captionFr: nextCaption,
          hashtags: nextHashtags,
          videoUrl: rendered.videoUrl,
          videoFileName: rendered.videoFileName,
          videoSizeBytes: rendered.videoSizeBytes,
          thumbnailUrl: rendered.thumbnailUrl,
          editMode: isMultiTake ? "multi_take" : "single_take",
          editRecipe: recipe,
          reviewStatus: autopilotEval.approved ? "approved" : "needs_review",
          autoPublish: autopilotEval.approved,
          scheduledFor: nextScheduledFor,
          platformDeliveries: nextDeliveries,
          status: "ready",
          onScreenHookEn: hookOverlayText || post.onScreenHookEn,
          onScreenHookFr: hookOverlayText || post.onScreenHookFr,
          updatedAt: new Date(),
        })
        .where(eq(socialPosts.id, post.id));

      await setProgress(
        100,
        autopilotEval.approved
          ? "Auto-approved & queued for Autopilot!"
          : autopilotEval.holdReason
            ? "Held in Review Inbox (safety check)"
            : "Ready for 1-tap review!",
      );

      if (autopilotEval.requested && !autopilotEval.approved && autopilotEval.holdReason) {
        await notifyClipHeldForReview({
          userId: job.userId,
          postTitle: nextTitle,
          trackTitle: track.title,
          reason: autopilotEval.holdReason,
        });
      }

      return {
        postId: post.id,
        videoUrl: rendered.videoUrl,
        thumbnailUrl: rendered.thumbnailUrl,
        detectedOffsetSec: primarySynced.detectedOffsetSec,
        syncConfidence: primarySynced.syncConfidence,
        durationSec: rendered.durationSec,
        takeCount: syncedClips.length,
        cutCount: recipe.segments.length,
        aiSource: aiDirectionResult?.source ?? "skipped",
        autoApproved: autopilotEval.approved,
        holdReason: autopilotEval.holdReason ?? null,
      };
    } finally {
      if (masterFile.isTemporary && existsSync(masterFile.localPath)) {
        try {
          unlinkSync(masterFile.localPath);
        } catch {
          // Ignore scratch cleanup errors
        }
      }
    }
  });

  defaultJobHandlers.set("cleanup_media", async ({ job, setProgress }) => {
    await setProgress(25, "Scanning expired raw takes, renders & scratch...");
    const result = await runMediaLifecycleCleanup({
      userId: job.payload?.allUsers ? undefined : job.userId,
    });
    await setProgress(100, "Media lifecycle cleanup complete");
    return {
      scratchFilesDeleted: result.scratchFilesDeleted,
      rawClipsDeleted: result.rawClipsDeleted,
      renderedVideosDeleted: result.renderedVideosDeleted,
      bytesFreed: result.bytesFreed,
    };
  });

  // Immediately overwrite legacy globalThis handler map so any pre-HMR dev interval uses fresh v2 code
  syncLegacyHandlerMap();
}

export async function enqueueJob(params: {
  userId: string;
  jobType: BackgroundJobType;
  postId?: string | null;
  catalogItemId?: string | null;
  payload?: JsonRecord;
  runAfter?: Date;
  maxAttempts?: number;
  stageLabel?: string;
}): Promise<BackgroundJobRecord> {
  await ensureSchemaInitialized();
  const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();

  const [created] = await db
    .insert(backgroundJobs)
    .values({
      id,
      userId: params.userId,
      postId: params.postId ?? null,
      catalogItemId: params.catalogItemId ?? null,
      jobType: params.jobType,
      status: "queued",
      progress: 0,
      stageLabel: params.stageLabel ?? "Queued",
      payload: params.payload ?? {},
      attempts: 0,
      maxAttempts: params.maxAttempts ?? 3,
      runAfter: params.runAfter ?? now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created!;
}

export async function updateJobProgress(
  jobId: string,
  progress: number,
  stageLabel: string,
): Promise<void> {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  await db
    .update(backgroundJobs)
    .set({
      progress: clamped,
      stageLabel,
      updatedAt: new Date(),
    })
    .where(eq(backgroundJobs.id, jobId));
}

/**
 * Reclaims jobs stuck in "running" for > 15 minutes (e.g. after a Coolify redeploy/crash)
 * and atomically claims the next due queued job.
 */
export async function claimNextJob(now = new Date()): Promise<BackgroundJobRecord | null> {
  await ensureSchemaInitialized();
  const staleCutoff = new Date(now.getTime() - 15 * 60_000);

  // Reclaim stale running jobs so container restarts never leave orphaned jobs
  await db
    .update(backgroundJobs)
    .set({
      status: "queued",
      lockedAt: null,
      stageLabel: "Retrying after restart",
      updatedAt: now,
    })
    .where(
      and(eq(backgroundJobs.status, "running"), lte(backgroundJobs.lockedAt, staleCutoff)),
    );

  const candidates = await db
    .select()
    .from(backgroundJobs)
    .where(and(eq(backgroundJobs.status, "queued"), lte(backgroundJobs.runAfter, now)))
    .orderBy(asc(backgroundJobs.runAfter), asc(backgroundJobs.createdAt))
    .limit(1);

  const next = candidates[0];
  if (!next) return null;

  // Optimistic atomic claim (only succeeds if still queued)
  const claimed = await db
    .update(backgroundJobs)
    .set({
      status: "running",
      attempts: next.attempts + 1,
      lockedAt: now,
      startedAt: next.startedAt ?? now,
      stageLabel: "Starting...",
      updatedAt: now,
    })
    .where(and(eq(backgroundJobs.id, next.id), eq(backgroundJobs.status, "queued")))
    .returning();

  return claimed[0] ?? null;
}

async function executeClaimedJob(job: BackgroundJobRecord): Promise<BackgroundJobRecord> {
  const handler = resolveJobHandler(job.jobType);
  if (!handler) {
    const [failed] = await db
      .update(backgroundJobs)
      .set({
        status: "failed",
        error: `No handler registered for jobType "${job.jobType}"`,
        stageLabel: "Failed",
        lockedAt: null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(backgroundJobs.id, job.id))
      .returning();
    return failed ?? job;
  }

  try {
    const result = await handler({
      job,
      setProgress: (progress, stageLabel) => updateJobProgress(job.id, progress, stageLabel),
    });

    const [done] = await db
      .update(backgroundJobs)
      .set({
        status: "succeeded",
        progress: 100,
        stageLabel: "Done",
        result: result ?? { ok: true },
        error: null,
        lockedAt: null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(backgroundJobs.id, job.id))
      .returning();

    return done ?? job;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const shouldRetry = job.attempts < job.maxAttempts;
    // Exponential retry backoff: 30s -> 120s -> 480s
    const backoffMs = 30_000 * 4 ** Math.max(0, job.attempts - 1);
    const nextRunAfter = new Date(Date.now() + backoffMs);

    const [updated] = await db
      .update(backgroundJobs)
      .set({
        status: shouldRetry ? "queued" : "failed",
        error: message,
        stageLabel: shouldRetry
          ? `Retry ${job.attempts}/${job.maxAttempts} scheduled`
          : "Failed",
        runAfter: shouldRetry ? nextRunAfter : job.runAfter,
        lockedAt: null,
        completedAt: shouldRetry ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(backgroundJobs.id, job.id))
      .returning();

    // If a render_video job exhausts retries, flip post reviewStatus to "failed" and ping Discord
    if (!shouldRetry && job.jobType === "render_video" && job.postId) {
      const [failedPost] = await db
        .update(socialPosts)
        .set({ reviewStatus: "failed", updatedAt: new Date() })
        .where(eq(socialPosts.id, job.postId))
        .returning({ title: socialPosts.title });

      await notifyClipHeldForReview({
        userId: job.userId,
        postTitle: failedPost?.title || job.stageLabel || "Auto-edit clip",
        reason: `Auto-edit failed after ${job.maxAttempts} attempt(s): ${message}`,
      });
    }

    // If a publish_post job exhausts retries, alert Discord so the user can retry or reconnect
    if (!shouldRetry && job.jobType === "publish_post" && job.postId) {
      const [failedPost] = await db
        .select({ title: socialPosts.title, platforms: socialPosts.platforms })
        .from(socialPosts)
        .where(eq(socialPosts.id, job.postId))
        .limit(1);

      const platforms = Array.isArray(job.payload?.platforms)
        ? (job.payload.platforms as string[]).filter((p): p is PublishablePlatform =>
            isPublishablePlatform(p as PublishablePlatform),
          )
        : (failedPost?.platforms ?? []).filter(isPublishablePlatform);

      await notifyPublishFailed({
        userId: job.userId,
        postTitle: failedPost?.title || "Scheduled post",
        errorSummary: message,
        platforms,
      });
    }

    return updated ?? job;
  }
}

export async function processJobById(jobId: string): Promise<BackgroundJobRecord | null> {
  await ensureSchemaInitialized();
  ensureDefaultJobHandlersRegistered();
  const now = new Date();
  const rows = await db
    .select()
    .from(backgroundJobs)
    .where(and(eq(backgroundJobs.id, jobId), eq(backgroundJobs.status, "queued")))
    .limit(1);
  const target = rows[0];
  if (!target) return null;

  const claimed = await db
    .update(backgroundJobs)
    .set({
      status: "running",
      attempts: target.attempts + 1,
      lockedAt: now,
      startedAt: target.startedAt ?? now,
      stageLabel: "Starting...",
      updatedAt: now,
    })
    .where(and(eq(backgroundJobs.id, target.id), eq(backgroundJobs.status, "queued")))
    .returning();

  const job = claimed[0];
  if (!job) return null;
  return executeClaimedJob(job);
}

export async function processNextJob(now = new Date()): Promise<BackgroundJobRecord | null> {
  ensureDefaultJobHandlersRegistered();
  const job = await claimNextJob(now);
  if (!job) return null;
  return executeClaimedJob(job);
}

export async function listUserJobs(userId: string, limit = 25): Promise<BackgroundJobRecord[]> {
  await ensureSchemaInitialized();
  return db
    .select()
    .from(backgroundJobs)
    .where(eq(backgroundJobs.userId, userId))
    .orderBy(desc(backgroundJobs.createdAt))
    .limit(limit);
}

export async function listActiveJobsForUser(userId: string): Promise<BackgroundJobRecord[]> {
  await ensureSchemaInitialized();
  return db
    .select()
    .from(backgroundJobs)
    .where(
      and(
        eq(backgroundJobs.userId, userId),
        or(eq(backgroundJobs.status, "queued"), eq(backgroundJobs.status, "running")),
      ),
    )
    .orderBy(asc(backgroundJobs.createdAt));
}

let lastAutopilotScanMs = 0;
let lastMediaCleanupMs = 0;
let lastTokenHealthScanMs = 0;

export interface WorkerTickSummary {
  enqueuedAutopilotPosts: number;
  jobsProcessed: number;
  tokenAlertsSent: number;
  skippedBusy: boolean;
}

export async function runWorkerTickNow(options?: {
  forceAutopilotScan?: boolean;
  forceTokenCheck?: boolean;
  maxJobs?: number;
}): Promise<WorkerTickSummary> {
  if (globalForWorker.__lilSbdWorkerBusy) {
    return {
      enqueuedAutopilotPosts: 0,
      jobsProcessed: 0,
      tokenAlertsSent: 0,
      skippedBusy: true,
    };
  }
  globalForWorker.__lilSbdWorkerBusy = true;
  let enqueuedAutopilotPosts = 0;
  let jobsProcessed = 0;
  let tokenAlertsSent = 0;

  try {
    const nowMs = Date.now();
    const nowDate = new Date(nowMs);

    // Check due autopilot posts every 30s (or immediately when triggered by /api/socials/cron)
    if (options?.forceAutopilotScan || nowMs - lastAutopilotScanMs >= 30_000) {
      lastAutopilotScanMs = nowMs;
      enqueuedAutopilotPosts = await enqueueDueAutopilotPosts(nowDate);
    }

    // Scan expiring/expired platform tokens every 6h (deduplicated per-token every 24h)
    if (options?.forceTokenCheck || nowMs - lastTokenHealthScanMs >= 6 * 3600_000) {
      lastTokenHealthScanMs = nowMs;
      tokenAlertsSent = await scanAndNotifyExpiringTokens(nowDate);
    }

    // Run conveyor-belt media lifecycle cleanup every 12 hours
    if (nowMs - lastMediaCleanupMs >= 12 * 3600_000) {
      lastMediaCleanupMs = nowMs;
      await runMediaLifecycleCleanup({ now: nowDate });
    }

    // Process up to maxJobs (default 3) per tick so queue drains smoothly
    const maxJobs = Math.max(1, Math.min(10, options?.maxJobs ?? 3));
    for (let i = 0; i < maxJobs; i++) {
      const processed = await processNextJob();
      if (!processed) break;
      jobsProcessed++;
    }
  } catch (err) {
    console.error("[BackgroundWorker] Tick error:", err);
  } finally {
    globalForWorker.__lilSbdWorkerBusy = false;
  }

  return {
    enqueuedAutopilotPosts,
    jobsProcessed,
    tokenAlertsSent,
    skippedBusy: false,
  };
}

async function workerTick(): Promise<void> {
  await runWorkerTickNow();
}

// Always point globalThis.__lilSbdWorkerTick and legacy handler map to this module's latest code (HMR-safe!)
ensureDefaultJobHandlersRegistered();
globalForWorker.__lilSbdWorkerTick = workerTick;

export function triggerWorkerTickSoon(): void {
  if (process.env.VITEST) return;
  setTimeout(() => {
    void globalForWorker.__lilSbdWorkerTick?.();
  }, 50);
}

export function ensureBackgroundWorkerRunning(): void {
  ensureDefaultJobHandlersRegistered();
  globalForWorker.__lilSbdWorkerTick = workerTick;
  if (process.env.VITEST) return;
  if (globalForWorker.__lilSbdWorkerTimerV2) return;

  globalForWorker.__lilSbdWorkerStarted = true;
  const timer = setInterval(() => {
    void globalForWorker.__lilSbdWorkerTick?.();
  }, 3_000);
  if (typeof timer.unref === "function") {
    timer.unref();
  }
  globalForWorker.__lilSbdWorkerTimerV2 = timer;
}
