import { and, asc, desc, eq, lte, or } from "drizzle-orm";
import { db, ensureSchemaInitialized } from "#/db";
import {
  artistCatalogItems,
  type BackgroundJobRecord,
  type BackgroundJobType,
  backgroundJobs,
  type JsonRecord,
} from "#/db/schema";
import { analyzeCatalogItemAudio } from "./audio-analysis.server";

export interface JobContext {
  job: BackgroundJobRecord;
  setProgress: (progress: number, stageLabel: string) => Promise<void>;
}

export type JobHandler = (ctx: JobContext) => Promise<JsonRecord | void>;

const globalForWorker = globalThis as unknown as {
  __lilSbdJobHandlers?: Map<BackgroundJobType, JobHandler>;
  __lilSbdWorkerStarted?: boolean;
  __lilSbdWorkerBusy?: boolean;
  __lilSbdDefaultHandlersRegistered?: boolean;
};

function getHandlerMap(): Map<BackgroundJobType, JobHandler> {
  if (!globalForWorker.__lilSbdJobHandlers) {
    globalForWorker.__lilSbdJobHandlers = new Map();
  }
  return globalForWorker.__lilSbdJobHandlers;
}

export function registerJobHandler(jobType: BackgroundJobType, handler: JobHandler): void {
  getHandlerMap().set(jobType, handler);
}

/**
 * Registers built-in background job handlers (Milestone 1: analyze_track).
 * Later milestones register sync_and_direct, render_video, publish_post, cleanup_media here.
 */
export function ensureDefaultJobHandlersRegistered(): void {
  if (globalForWorker.__lilSbdDefaultHandlersRegistered) return;
  globalForWorker.__lilSbdDefaultHandlersRegistered = true;

  registerJobHandler("analyze_track", async ({ job, setProgress }) => {
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

    await setProgress(45, "Detecting BPM, beat grid & drops...");
    const analysis = await analyzeCatalogItemAudio(item);

    await setProgress(85, "Saving cached audio analysis...");
    const hookTimestamps = analysis.drops.map((d) => ({
      label: d.label,
      startSec: Math.round(d.startSec),
      endSec: Math.round(d.endSec),
    }));

    await db
      .update(artistCatalogItems)
      .set({
        bpm: Math.round(analysis.bpm),
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

export async function processNextJob(now = new Date()): Promise<BackgroundJobRecord | null> {
  ensureDefaultJobHandlersRegistered();
  const job = await claimNextJob(now);
  if (!job) return null;

  const handler = getHandlerMap().get(job.jobType);
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

    return updated ?? job;
  }
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

async function workerTick(): Promise<void> {
  if (globalForWorker.__lilSbdWorkerBusy) return;
  globalForWorker.__lilSbdWorkerBusy = true;
  try {
    // Process up to 3 jobs per tick so queue drains smoothly
    for (let i = 0; i < 3; i++) {
      const processed = await processNextJob();
      if (!processed) break;
    }
  } catch (err) {
    console.error("[BackgroundWorker] Tick error:", err);
  } finally {
    globalForWorker.__lilSbdWorkerBusy = false;
  }
}

export function ensureBackgroundWorkerRunning(): void {
  ensureDefaultJobHandlersRegistered();
  if (globalForWorker.__lilSbdWorkerStarted) return;
  if (process.env.VITEST) return;

  globalForWorker.__lilSbdWorkerStarted = true;
  const timer = setInterval(() => {
    void workerTick();
  }, 3_000);
  if (typeof timer.unref === "function") {
    timer.unref();
  }
}
