import { and, asc, eq, lte, ne, or } from "drizzle-orm";
import { db, ensureSchemaInitialized } from "#/db";
import {
  type ArtistProfileRecord,
  backgroundJobs,
  type PublishablePlatform,
  type SocialPostRecord,
  socialPosts,
} from "#/db/schema";
import { enqueueJob } from "./jobs.server";
import { isPublishablePlatform } from "./social-publisher.server";

export interface CadenceConfig {
  timezone: string;
  cadenceDays: number[]; // 0 = Sun .. 6 = Sat
  cadenceTime: string; // "HH:MM"
  avoidConsecutiveTrack: boolean;
}

const DEFAULT_CADENCE: CadenceConfig = {
  timezone: "Europe/Paris",
  cadenceDays: [1, 3, 5, 0],
  cadenceTime: "18:00",
  avoidConsecutiveTrack: true,
};

function parseCadenceTime(timeStr?: string | null): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec((timeStr || "").trim());
  if (!match) return { hour: 18, minute: 0 };
  const hour = Math.max(0, Math.min(23, Number.parseInt(match[1]!, 10)));
  const minute = Math.max(0, Math.min(59, Number.parseInt(match[2]!, 10)));
  return { hour, minute };
}

function getZonedDateParts(date: Date, timezone: string): {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
} {
  let safeTz = timezone || "Europe/Paris";
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: safeTz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    safeTz = "UTC";
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: safeTz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const rawHour = Number.parseInt(get("hour"), 10);
  return {
    year: Number.parseInt(get("year"), 10),
    month: Number.parseInt(get("month"), 10),
    day: Number.parseInt(get("day"), 10),
    weekday: weekdayMap[get("weekday")] ?? date.getUTCDay(),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: Number.parseInt(get("minute"), 10),
  };
}

/**
 * Converts a local wall-clock timestamp (year-month-day hour:minute) in `timezone`
 * to an exact UTC `Date`, accurately handling DST offsets.
 */
export function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  // Start with a UTC guess matching the requested wall-clock components
  const targetMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = new Date(targetMs);

  // Two refinement passes converge even across DST boundaries
  for (let i = 0; i < 2; i++) {
    const actual = getZonedDateParts(guess, timezone);
    const actualAsUtcMs = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      0,
      0,
    );
    const diffMs = targetMs - actualAsUtcMs;
    if (diffMs === 0) break;
    guess = new Date(guess.getTime() + diffMs);
  }

  return guess;
}

export function extractCadenceConfig(profile?: Partial<ArtistProfileRecord> | null): CadenceConfig {
  const days =
    profile?.cadenceDays && profile.cadenceDays.length > 0
      ? Array.from(new Set(profile.cadenceDays.filter((d) => d >= 0 && d <= 6)))
      : DEFAULT_CADENCE.cadenceDays;

  return {
    timezone: profile?.timezone?.trim() || DEFAULT_CADENCE.timezone,
    cadenceDays: days.length > 0 ? days : DEFAULT_CADENCE.cadenceDays,
    cadenceTime: profile?.cadenceTime?.trim() || DEFAULT_CADENCE.cadenceTime,
    avoidConsecutiveTrack: profile?.avoidConsecutiveTrack ?? DEFAULT_CADENCE.avoidConsecutiveTrack,
  };
}

/**
 * Generates the next `count` cadence slots strictly after `fromDate + 5 minutes`.
 */
export function generateCadenceSlots(params: {
  cadence: CadenceConfig;
  fromDate?: Date;
  count?: number;
}): Date[] {
  const { cadence } = params;
  const fromDate = params.fromDate ?? new Date();
  const count = Math.max(1, params.count ?? 20);
  const { hour, minute } = parseCadenceTime(cadence.cadenceTime);
  const allowedDays = new Set(cadence.cadenceDays.length > 0 ? cadence.cadenceDays : [1, 3, 5, 0]);
  const minEpoch = fromDate.getTime() + 5 * 60_000;

  const startParts = getZonedDateParts(fromDate, cadence.timezone);
  const slots: Date[] = [];

  for (let dayOffset = 0; dayOffset < 365 && slots.length < count; dayOffset++) {
    const calendarDate = new Date(
      Date.UTC(startParts.year, startParts.month - 1, startParts.day + dayOffset, 12, 0, 0),
    );
    const y = calendarDate.getUTCFullYear();
    const m = calendarDate.getUTCMonth() + 1;
    const d = calendarDate.getUTCDate();
    const candidate = zonedWallClockToUtc(y, m, d, hour, minute, cadence.timezone);
    const candidateParts = getZonedDateParts(candidate, cadence.timezone);

    if (allowedDays.has(candidateParts.weekday) && candidate.getTime() >= minEpoch) {
      slots.push(candidate);
    }
  }

  return slots;
}

/**
 * Picks the earliest open cadence slot that doesn't collide (within ±6h) with any
 * existing unposted post. If `avoidConsecutiveTrack` is enabled, prefers a slot
 * whose immediate predecessor isn't the same track when choosing among near-term slots.
 */
export function findNextAvailableSlot(params: {
  profile?: Partial<ArtistProfileRecord> | null;
  existingPosts: Array<
    Pick<SocialPostRecord, "id" | "status" | "scheduledFor" | "catalogItemId" | "reviewStatus">
  >;
  catalogItemId?: string | null;
  excludePostId?: string;
  now?: Date;
}): Date {
  const cadence = extractCadenceConfig(params.profile);
  const now = params.now ?? new Date();
  const activePosts = params.existingPosts
    .filter(
      (p) =>
        p.id !== params.excludePostId &&
        p.status !== "posted" &&
        p.scheduledFor &&
        new Date(p.scheduledFor).getTime() >= now.getTime() - 6 * 3600_000,
    )
    .sort((a, b) => new Date(a.scheduledFor!).getTime() - new Date(b.scheduledFor!).getTime());

  const collisionWindowMs = 6 * 3600_000;
  const candidateSlots = generateCadenceSlots({
    cadence,
    fromDate: now,
    count: Math.max(24, activePosts.length + 12),
  });

  const openSlots = candidateSlots.filter(
    (slot) =>
      !activePosts.some(
        (p) => Math.abs(new Date(p.scheduledFor!).getTime() - slot.getTime()) < collisionWindowMs,
      ),
  );

  if (openSlots.length === 0) {
    return candidateSlots[0] ?? new Date(now.getTime() + 24 * 3600_000);
  }

  // Respect track rotation if the immediately preceding post uses the exact same track
  if (cadence.avoidConsecutiveTrack && params.catalogItemId && openSlots.length > 1) {
    const firstSlot = openSlots[0]!;
    const prevPost = [...activePosts]
      .reverse()
      .find((p) => new Date(p.scheduledFor!).getTime() < firstSlot.getTime());
    if (prevPost?.catalogItemId && prevPost.catalogItemId === params.catalogItemId) {
      // Only skip ahead if there's actually another post already occupying or no other posts to interleave;
      // otherwise taking slot 0 is fine until another track is added and rebalanced.
      const nextPost = activePosts.find(
        (p) => new Date(p.scheduledFor!).getTime() > firstSlot.getTime(),
      );
      if (nextPost && nextPost.catalogItemId !== params.catalogItemId) {
        return openSlots[1]!;
      }
    }
  }

  return openSlots[0]!;
}

/**
 * Re-packs all queued/approved posts cleanly onto upcoming cadence slots while
 * interleaving tracks when `avoidConsecutiveTrack` is true.
 */
export function computeRebalancedQueue(params: {
  profile?: Partial<ArtistProfileRecord> | null;
  posts: Array<
    Pick<SocialPostRecord, "id" | "catalogItemId" | "scheduledFor" | "createdAt">
  >;
  lastPublishedTrackId?: string | null;
  now?: Date;
}): Array<{ postId: string; scheduledFor: Date }> {
  const { posts } = params;
  if (posts.length === 0) return [];

  const cadence = extractCadenceConfig(params.profile);
  const slots = generateCadenceSlots({
    cadence,
    fromDate: params.now ?? new Date(),
    count: posts.length + 4,
  });

  // Sort initially by existing scheduled date (or createdAt) to preserve relative intent
  const pool = [...posts].sort((a, b) => {
    const da = a.scheduledFor
      ? new Date(a.scheduledFor).getTime()
      : new Date(a.createdAt).getTime();
    const dbTime = b.scheduledFor
      ? new Date(b.scheduledFor).getTime()
      : new Date(b.createdAt).getTime();
    return da - dbTime;
  });

  const ordered: typeof pool = [];
  let prevTrackId: string | null = params.lastPublishedTrackId ?? null;

  while (pool.length > 0) {
    let pickIdx = 0;
    if (cadence.avoidConsecutiveTrack && prevTrackId) {
      const differentTrackIdx = pool.findIndex(
        (p) => !p.catalogItemId || p.catalogItemId !== prevTrackId,
      );
      if (differentTrackIdx !== -1) {
        pickIdx = differentTrackIdx;
      }
    }
    const [picked] = pool.splice(pickIdx, 1);
    if (picked) {
      ordered.push(picked);
      prevTrackId = picked.catalogItemId ?? null;
    }
  }

  return ordered.map((post, idx) => ({
    postId: post.id,
    scheduledFor: slots[idx] ?? new Date(Date.now() + (idx + 1) * 86_400_000),
  }));
}

/**
 * Scans for approved, auto-publish posts whose scheduledFor <= now and enqueues
 * a persistent `publish_post` background job (deduplicated so a post is never double-enqueued).
 */
export async function enqueueDueAutopilotPosts(now = new Date()): Promise<number> {
  await ensureSchemaInitialized();

  const duePosts = await db
    .select()
    .from(socialPosts)
    .where(
      and(
        eq(socialPosts.autoPublish, true),
        eq(socialPosts.reviewStatus, "approved"),
        ne(socialPosts.status, "posted"),
        lte(socialPosts.scheduledFor, now),
      ),
    )
    .orderBy(asc(socialPosts.scheduledFor));

  let enqueued = 0;

  for (const post of duePosts) {
    if (!post.videoUrl) continue;

    const pendingPlatforms: PublishablePlatform[] = (post.platforms ?? [])
      .filter(isPublishablePlatform)
      .filter((p) => {
        const st = post.platformDeliveries?.[p]?.status;
        return st !== "published" && st !== "inbox_ready" && st !== "failed";
      });

    if (pendingPlatforms.length === 0) continue;

    // Deduplicate: skip if a publish_post job is already queued or running for this post
    const existingJobs = await db
      .select({ id: backgroundJobs.id })
      .from(backgroundJobs)
      .where(
        and(
          eq(backgroundJobs.postId, post.id),
          eq(backgroundJobs.jobType, "publish_post"),
          or(eq(backgroundJobs.status, "queued"), eq(backgroundJobs.status, "running")),
        ),
      )
      .limit(1);

    if (existingJobs.length > 0) continue;

    await enqueueJob({
      userId: post.userId,
      postId: post.id,
      jobType: "publish_post",
      stageLabel: `Queued auto-publish for "${post.title}"`,
      payload: {
        postId: post.id,
        platforms: pendingPlatforms,
      },
      maxAttempts: 3,
    });
    enqueued++;
  }

  return enqueued;
}
