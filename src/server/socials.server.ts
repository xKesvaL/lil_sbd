import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { db, ensureSchemaInitialized, getDatabaseMode } from "#/db";
import {
  artistCatalogItems,
  artistProfiles,
  type CampaignType,
  type CatalogItemType,
  type ContentPillar,
  type EditPreset,
  hashtagPresets,
  type IdeaCategory,
  type IdeaDifficulty,
  ideaTemplates,
  type PerformanceRating,
  type PlatformDeliveries,
  type PostStatus,
  type PublishablePlatform,
  releaseCampaigns,
  type SocialConnectionMetadata,
  type SocialPlatform,
  socialConnections,
  socialPosts,
  socialRawClips,
  type TrackDropSection,
  type TrackSectionKind,
} from "#/db/schema";
import { auth, getConfiguredAuthInfo } from "#/lib/auth";
import { CAMPAIGN_ROLLOUT_BLUEPRINTS } from "#/lib/social-blueprints";
import { songs } from "#/lib/songs";
import {
  computeRebalancedQueue,
  enqueueDueAutopilotPosts,
  findNextAvailableSlot,
} from "./autopilot-scheduler.server";
import { isValidDiscordWebhookUrl, sendTestDiscordAlert } from "./discord-alerts.server";
import { rerollCopyWithGemini, resolveGeminiConfig } from "./gemini-director.server";
import {
  enqueueJob,
  ensureBackgroundWorkerRunning,
  listActiveJobsForUser,
  listUserJobs,
  processJobById,
  triggerWorkerTickSoon,
} from "./jobs.server";
import {
  getSystemReadinessDiagnostics,
  runMediaLifecycleCleanup,
} from "./media-cleanup.server";
import { getLocalStorageStats } from "./media-storage.server";
import {
  evaluateTokenHealth,
  isPublishablePlatform,
  publishSocialPostToPlatforms,
  testSocialConnection,
} from "./social-publisher.server";

export async function requireSessionImpl() {
  await ensureSchemaInitialized();
  const { getRequestHeaders } = await import("@tanstack/react-start/server");
  const headers = getRequestHeaders();
  const session = await auth.api.getSession({
    headers: new Headers(headers as unknown as HeadersInit),
  });
  if (!session?.user) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function ensureArtistProfile(userId: string, userName?: string) {
  await ensureSchemaInitialized();
  const existingProfile = await db
    .select()
    .from(artistProfiles)
    .where(eq(artistProfiles.userId, userId))
    .limit(1);

  if (existingProfile.length === 0) {
    await db.insert(artistProfiles).values({
      id: `profile-${userId}`,
      userId,
      stageName: userName?.trim() || "LIL SBD",
      genre: "Uptempo Hardcore / Hard Dance",
      tagline: "Zaag-driven uptempo hardcore that still feels like music.",
      primaryLanguage: "bilingual",
      defaultBioLink: "https://lilsbd.com",
      weeklyPostTarget: 5,
      targetPlatforms: ["instagram_reels", "tiktok", "youtube_shorts"],
    });
  }
}

function interpolateTemplateText(
  template: string,
  vars: {
    trackTitle: string;
    bpm: number;
    stageName: string;
    genre: string;
  },
): string {
  return template
    .replaceAll("{track_title}", vars.trackTitle)
    .replaceAll("{title}", vars.trackTitle)
    .replaceAll("{bpm}", String(vars.bpm))
    .replaceAll("{stage_name}", vars.stageName)
    .replaceAll("{genre}", vars.genre);
}

export async function getAuthSessionImpl() {
  await ensureSchemaInitialized();
  const { getRequestHeaders } = await import("@tanstack/react-start/server");
  const headers = getRequestHeaders();
  const session = await auth.api.getSession({
    headers: new Headers(headers as unknown as HeadersInit),
  });

  return {
    user: session?.user ?? null,
    authConfig: getConfiguredAuthInfo(),
    databaseMode: getDatabaseMode(),
  };
}

export async function getStudioDashboardImpl() {
  const session = await requireSessionImpl();
  const userId = session.user.id;

  ensureBackgroundWorkerRunning();
  await ensureArtistProfile(userId, session.user.name);
  await enqueueDueAutopilotPosts();

  const [
    profileRows,
    catalog,
    campaigns,
    posts,
    templates,
    presets,
    rawConnections,
    recentJobs,
    rawClips,
  ] = await Promise.all([
    db.select().from(artistProfiles).where(eq(artistProfiles.userId, userId)).limit(1),
    db
      .select()
      .from(artistCatalogItems)
      .where(eq(artistCatalogItems.userId, userId))
      .orderBy(desc(artistCatalogItems.releaseDate)),
    db
      .select()
      .from(releaseCampaigns)
      .where(eq(releaseCampaigns.userId, userId))
      .orderBy(desc(releaseCampaigns.releaseDate)),
    db
      .select()
      .from(socialPosts)
      .where(eq(socialPosts.userId, userId))
      .orderBy(asc(socialPosts.sortOrder), desc(socialPosts.createdAt)),
    db
      .select()
      .from(ideaTemplates)
      .where(or(isNull(ideaTemplates.userId), eq(ideaTemplates.userId, userId)))
      .orderBy(desc(ideaTemplates.createdAt)),
    db
      .select()
      .from(hashtagPresets)
      .where(or(isNull(hashtagPresets.userId), eq(hashtagPresets.userId, userId)))
      .orderBy(asc(hashtagPresets.name)),
    db
      .select()
      .from(socialConnections)
      .where(eq(socialConnections.userId, userId))
      .orderBy(asc(socialConnections.platform)),
    listUserJobs(userId, 20),
    db
      .select()
      .from(socialRawClips)
      .where(eq(socialRawClips.userId, userId))
      .orderBy(asc(socialRawClips.orderIndex)),
  ]);

  const connections = rawConnections.map((c) => {
    const health = evaluateTokenHealth(c);
    return {
      id: c.id,
      platform: c.platform,
      accountName: c.accountName,
      externalAccountId: c.externalAccountId,
      hasRefreshToken: Boolean(c.refreshToken),
      tokenExpiresAt: c.tokenExpiresAt,
      tokenHealth: health.tokenHealth,
      daysUntilExpiry: health.daysUntilExpiry,
      metadata: c.metadata,
      updatedAt: c.updatedAt,
    };
  });

  const nextAvailableSlot = findNextAvailableSlot({
    profile: profileRows[0],
    existingPosts: posts,
  });

  const oauthEnvConfigured = {
    instagram_reels: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
    tiktok: Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET),
    youtube_shorts: Boolean(
      (process.env.GOOGLE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID) &&
        (process.env.GOOGLE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET),
    ),
  };

  const geminiCfg = resolveGeminiConfig(profileRows[0]?.geminiModel);

  return {
    user: session.user,
    profile: profileRows[0]!,
    catalog,
    campaigns,
    posts,
    templates,
    hashtagPresets: presets,
    connections,
    oauthEnvConfigured,
    databaseMode: getDatabaseMode(),
    storageStats: getLocalStorageStats(),
    recentJobs,
    rawClips,
    nextAvailableSlot: nextAvailableSlot.toISOString(),
    geminiStatus: {
      configured: Boolean(geminiCfg.apiKey),
      model: geminiCfg.model,
    },
    diagnostics: getSystemReadinessDiagnostics(
      Boolean(geminiCfg.apiKey),
      geminiCfg.model,
      isValidDiscordWebhookUrl(profileRows[0]?.discordWebhookUrl ?? ""),
    ),
  };
}

export async function updateArtistProfileImpl(data: {
  stageName: string;
  genre: string;
  tagline: string;
  primaryLanguage: "en" | "fr" | "bilingual";
  defaultBioLink: string;
  weeklyPostTarget: number;
  targetPlatforms?: SocialPlatform[];
  timezone?: string;
  cadenceDays?: number[];
  cadenceTime?: string;
  avoidConsecutiveTrack?: boolean;
  fullAutopilot?: boolean;
  defaultEditPreset?: "subtle" | "punchy" | "hard";
  burnHookOverlay?: boolean;
  audioHeadroomDb?: number;
  rawRetentionDays?: number;
  renderedRetentionDays?: number;
  storageCapGb?: number;
  geminiModel?: string;
  discordWebhookUrl?: string;
}) {
  const session = await requireSessionImpl();
  const userId = session.user.id;

  if (data.discordWebhookUrl !== undefined && data.discordWebhookUrl.trim() !== "") {
    if (!isValidDiscordWebhookUrl(data.discordWebhookUrl)) {
      throw new Error(
        "Discord webhook URL must start with https://discord.com/api/webhooks/...",
      );
    }
  }

  await db
    .update(artistProfiles)
    .set({
      stageName: data.stageName,
      genre: data.genre,
      tagline: data.tagline,
      primaryLanguage: data.primaryLanguage,
      defaultBioLink: data.defaultBioLink,
      weeklyPostTarget: data.weeklyPostTarget,
      ...(data.targetPlatforms ? { targetPlatforms: data.targetPlatforms } : {}),
      ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
      ...(data.cadenceDays !== undefined ? { cadenceDays: data.cadenceDays } : {}),
      ...(data.cadenceTime !== undefined ? { cadenceTime: data.cadenceTime } : {}),
      ...(data.avoidConsecutiveTrack !== undefined
        ? { avoidConsecutiveTrack: data.avoidConsecutiveTrack }
        : {}),
      ...(data.fullAutopilot !== undefined ? { fullAutopilot: data.fullAutopilot } : {}),
      ...(data.defaultEditPreset !== undefined
        ? { defaultEditPreset: data.defaultEditPreset }
        : {}),
      ...(data.burnHookOverlay !== undefined ? { burnHookOverlay: data.burnHookOverlay } : {}),
      ...(data.audioHeadroomDb !== undefined ? { audioHeadroomDb: data.audioHeadroomDb } : {}),
      ...(data.rawRetentionDays !== undefined ? { rawRetentionDays: data.rawRetentionDays } : {}),
      ...(data.renderedRetentionDays !== undefined
        ? { renderedRetentionDays: data.renderedRetentionDays }
        : {}),
      ...(data.storageCapGb !== undefined ? { storageCapGb: data.storageCapGb } : {}),
      ...(data.geminiModel !== undefined ? { geminiModel: data.geminiModel } : {}),
      ...(data.discordWebhookUrl !== undefined
        ? { discordWebhookUrl: data.discordWebhookUrl.trim() }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(artistProfiles.userId, userId));

  return { ok: true };
}

export async function testDiscordWebhookImpl(data: { webhookUrl?: string }) {
  const session = await requireSessionImpl();
  const userId = session.user.id;

  const profileRows = await db
    .select()
    .from(artistProfiles)
    .where(eq(artistProfiles.userId, userId))
    .limit(1);
  const profile = profileRows[0];

  const targetUrl = (data.webhookUrl ?? profile?.discordWebhookUrl ?? "").trim();
  if (!targetUrl) {
    return { ok: false, error: "Paste a Discord webhook URL first." };
  }

  return sendTestDiscordAlert(targetUrl, profile?.stageName || "LIL SBD");
}

export async function createAutopilotDraftImpl(data: {
  catalogItemId?: string | null;
  title?: string;
  videoUrl: string;
  videoFileName?: string | null;
  videoSizeBytes?: number | null;
  caption?: string;
  hashtags?: string[];
  platforms?: PublishablePlatform[];
  editMode?: "single_take" | "multi_take" | "manual";
}) {
  const session = await requireSessionImpl();
  const userId = session.user.id;

  const [profileRows, existingPosts, trackRows] = await Promise.all([
    db.select().from(artistProfiles).where(eq(artistProfiles.userId, userId)).limit(1),
    db.select().from(socialPosts).where(eq(socialPosts.userId, userId)),
    data.catalogItemId
      ? db
          .select()
          .from(artistCatalogItems)
          .where(
            and(
              eq(artistCatalogItems.id, data.catalogItemId),
              eq(artistCatalogItems.userId, userId),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
  ]);

  const profile = profileRows[0];
  const track = trackRows[0] ?? null;

  const nextSlot = findNextAvailableSlot({
    profile,
    existingPosts,
    catalogItemId: track?.id ?? null,
  });

  const defaultPlatforms = (profile?.targetPlatforms ?? ["youtube_shorts", "instagram_reels", "tiktok"]).filter(
    isPublishablePlatform,
  );
  const chosenPlatforms: PublishablePlatform[] =
    data.platforms && data.platforms.length > 0
      ? data.platforms
      : defaultPlatforms.length > 0
        ? defaultPlatforms
        : ["youtube_shorts", "instagram_reels", "tiktok"];

  const resolvedTitle =
    data.title?.trim() ||
    (track ? `${track.title} — Drop Clip` : data.videoFileName?.replace(/\.[^/.]+$/, "") || "New Clip");

  const defaultCaption =
    data.caption?.trim() ||
    (track
      ? `${track.title} (${track.bpm ?? 200} BPM). Out everywhere — ${profile?.defaultBioLink || "https://lilsbd.com"}`
      : `New uptempo drop — ${profile?.defaultBioLink || "https://lilsbd.com"}`);

  const defaultHashtags =
    data.hashtags && data.hashtags.length > 0
      ? data.hashtags
      : ["#uptempohardcore", "#zaagkick", "#harddance", "#lilsbd"];

  const id = `post-${userId}-${Date.now()}`;
  await db.insert(socialPosts).values({
    id,
    userId,
    catalogItemId: track?.id ?? null,
    title: resolvedTitle,
    status: "ready",
    reviewStatus: "needs_review",
    editMode: data.editMode ?? "manual",
    platforms: chosenPlatforms,
    pillar: "drop_showcase",
    scheduledFor: nextSlot,
    videoUrl: data.videoUrl,
    videoFileName: data.videoFileName ?? null,
    videoSizeBytes: data.videoSizeBytes ?? null,
    autoPublish: false,
    platformDeliveries: {},
    onScreenHookEn: "",
    onScreenHookFr: "",
    captionEn: defaultCaption,
    captionFr: defaultCaption,
    ctaEn: "",
    ctaFr: "",
    hashtags: defaultHashtags,
    shotList: [],
  });

  return { id, scheduledFor: nextSlot.toISOString() };
}

export async function approveReviewPostImpl(data: {
  postId: string;
  scheduledFor?: string | null;
}) {
  const session = await requireSessionImpl();
  const userId = session.user.id;

  const [profileRows, allPosts] = await Promise.all([
    db.select().from(artistProfiles).where(eq(artistProfiles.userId, userId)).limit(1),
    db.select().from(socialPosts).where(eq(socialPosts.userId, userId)),
  ]);

  const post = allPosts.find((p) => p.id === data.postId);
  if (!post) throw new Error("Post not found");
  if (!post.videoUrl) throw new Error("Attach a video before approving for Autopilot");

  let targetSlot = data.scheduledFor
    ? new Date(data.scheduledFor)
    : post.scheduledFor
      ? new Date(post.scheduledFor)
      : null;

  if (!targetSlot || Number.isNaN(targetSlot.getTime()) || targetSlot.getTime() < Date.now() + 60_000) {
    targetSlot = findNextAvailableSlot({
      profile: profileRows[0],
      existingPosts: allPosts,
      catalogItemId: post.catalogItemId,
      excludePostId: post.id,
    });
  }

  const nextDeliveries: PlatformDeliveries = { ...(post.platformDeliveries ?? {}) };
  for (const p of (post.platforms ?? []).filter(isPublishablePlatform)) {
    const cur = nextDeliveries[p]?.status;
    if (!cur || cur === "idle" || cur === "failed") {
      nextDeliveries[p] = { status: "scheduled", updatedAt: new Date().toISOString() };
    }
  }

  await db
    .update(socialPosts)
    .set({
      status: "ready",
      reviewStatus: "approved",
      autoPublish: true,
      scheduledFor: targetSlot,
      platformDeliveries: nextDeliveries,
      updatedAt: new Date(),
    })
    .where(and(eq(socialPosts.id, post.id), eq(socialPosts.userId, userId)));

  return { ok: true, scheduledFor: targetSlot.toISOString() };
}

export async function updateReviewPostImpl(data: {
  postId: string;
  title?: string;
  caption?: string;
  onScreenHook?: string;
  hashtags?: string[];
  platforms?: PublishablePlatform[];
  catalogItemId?: string | null;
  scheduledFor?: string | null;
  reviewStatus?: "needs_review" | "approved";
  autoPublish?: boolean;
}) {
  const session = await requireSessionImpl();
  const userId = session.user.id;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.title !== undefined) updates.title = data.title.trim() || "Untitled Clip";
  if (data.caption !== undefined) {
    updates.captionEn = data.caption;
    updates.captionFr = data.caption;
  }
  if (data.onScreenHook !== undefined) {
    updates.onScreenHookEn = data.onScreenHook;
    updates.onScreenHookFr = data.onScreenHook;
  }
  if (data.hashtags !== undefined) updates.hashtags = data.hashtags;
  if (data.platforms !== undefined && data.platforms.length > 0) updates.platforms = data.platforms;
  if (data.catalogItemId !== undefined) updates.catalogItemId = data.catalogItemId;
  if (data.scheduledFor !== undefined) {
    updates.scheduledFor = data.scheduledFor ? new Date(data.scheduledFor) : null;
  }
  if (data.reviewStatus !== undefined) {
    updates.reviewStatus = data.reviewStatus;
    if (data.reviewStatus === "needs_review") {
      updates.autoPublish = false;
    }
  }
  if (data.autoPublish !== undefined) updates.autoPublish = data.autoPublish;

  await db
    .update(socialPosts)
    .set(updates)
    .where(and(eq(socialPosts.id, data.postId), eq(socialPosts.userId, userId)));

  return { ok: true };
}

export async function rebalanceAutopilotQueueImpl() {
  const session = await requireSessionImpl();
  const userId = session.user.id;

  const [profileRows, allPosts] = await Promise.all([
    db.select().from(artistProfiles).where(eq(artistProfiles.userId, userId)).limit(1),
    db.select().from(socialPosts).where(eq(socialPosts.userId, userId)),
  ]);

  const approvedUpcoming = allPosts.filter(
    (p) => p.status !== "posted" && p.reviewStatus === "approved" && p.autoPublish,
  );
  const lastPublished = allPosts
    .filter((p) => p.status === "posted" && p.postedAt)
    .sort((a, b) => new Date(b.postedAt!).getTime() - new Date(a.postedAt!).getTime())[0];

  const rebalanced = computeRebalancedQueue({
    profile: profileRows[0],
    posts: approvedUpcoming,
    lastPublishedTrackId: lastPublished?.catalogItemId ?? null,
  });

  for (const entry of rebalanced) {
    await db
      .update(socialPosts)
      .set({ scheduledFor: entry.scheduledFor, updatedAt: new Date() })
      .where(and(eq(socialPosts.id, entry.postId), eq(socialPosts.userId, userId)));
  }

  return { rebalancedCount: rebalanced.length };
}

export async function retryFailedPublishImpl(data: { postId: string }) {
  const session = await requireSessionImpl();
  const userId = session.user.id;

  const rows = await db
    .select()
    .from(socialPosts)
    .where(and(eq(socialPosts.id, data.postId), eq(socialPosts.userId, userId)))
    .limit(1);
  const post = rows[0];
  if (!post) throw new Error("Post not found");

  const pendingPlatforms = (post.platforms ?? [])
    .filter(isPublishablePlatform)
    .filter((p) => {
      const st = post.platformDeliveries?.[p]?.status;
      return st !== "published" && st !== "inbox_ready";
    });

  if (pendingPlatforms.length === 0) {
    return { ok: true, message: "Already published to all selected platforms." };
  }

  const job = await enqueueJob({
    userId,
    postId: post.id,
    jobType: "publish_post",
    stageLabel: `Retrying publish for "${post.title}"`,
    payload: { postId: post.id, platforms: pendingPlatforms },
    maxAttempts: 3,
  });
  ensureBackgroundWorkerRunning();
  return { ok: true, jobId: job.id };
}

type RawClipInput = {
  storageKey: string;
  fileName: string;
  sizeBytes: number;
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
};

export async function createAutoEditPostImpl(data: {
  catalogItemId: string;
  rawClip?: RawClipInput;
  rawClips?: RawClipInput[];
  preset?: EditPreset;
  platforms?: PublishablePlatform[];
  burnHookOverlay?: boolean;
  hookOverlayText?: string;
  fullAutopilot?: boolean;
}) {
  const session = await requireSessionImpl();
  const userId = session.user.id;

  const clipsToAttach: RawClipInput[] =
    data.rawClips && data.rawClips.length > 0
      ? data.rawClips.slice(0, 6)
      : data.rawClip
        ? [data.rawClip]
        : [];
  if (clipsToAttach.length === 0) {
    throw new Error("Upload at least one raw clip to auto-edit.");
  }

  const [profileRows, existingPosts, trackRows] = await Promise.all([
    db.select().from(artistProfiles).where(eq(artistProfiles.userId, userId)).limit(1),
    db.select().from(socialPosts).where(eq(socialPosts.userId, userId)),
    db
      .select()
      .from(artistCatalogItems)
      .where(
        and(
          eq(artistCatalogItems.id, data.catalogItemId),
          eq(artistCatalogItems.userId, userId),
        ),
      )
      .limit(1),
  ]);

  const profile = profileRows[0];
  const track = trackRows[0];
  if (!track) {
    throw new Error("Select a valid track with master audio for auto-editing.");
  }

  const nextSlot = findNextAvailableSlot({
    profile,
    existingPosts,
    catalogItemId: track.id,
  });

  const chosenPlatforms: PublishablePlatform[] =
    data.platforms && data.platforms.length > 0
      ? data.platforms
      : (profile?.targetPlatforms ?? ["youtube_shorts", "instagram_reels", "tiktok"]).filter(
          isPublishablePlatform,
        );

  const isMultiTake = clipsToAttach.length > 1;
  const preset: EditPreset = data.preset ?? profile?.defaultEditPreset ?? "punchy";
  const postId = `post-${userId}-${Date.now()}`;
  const defaultCaption = `${track.title} (${track.bpm ?? 200} BPM). Full track everywhere — ${profile?.defaultBioLink || "https://lilsbd.com"}`;

  await db.insert(socialPosts).values({
    id: postId,
    userId,
    catalogItemId: track.id,
    title: isMultiTake
      ? `${track.title} — ${clipsToAttach.length}-Angle Mashup`
      : `${track.title} — Drop Clip`,
    status: "editing",
    reviewStatus: "processing",
    editMode: isMultiTake ? "multi_take" : "single_take",
    platforms:
      chosenPlatforms.length > 0
        ? chosenPlatforms
        : ["youtube_shorts", "instagram_reels", "tiktok"],
    pillar: "drop_showcase",
    scheduledFor: nextSlot,
    autoPublish: false,
    platformDeliveries: {},
    onScreenHookEn: data.hookOverlayText?.trim() || "",
    onScreenHookFr: data.hookOverlayText?.trim() || "",
    captionEn: defaultCaption,
    captionFr: defaultCaption,
    ctaEn: "",
    ctaFr: "",
    hashtags: ["#uptempohardcore", "#zaagkick", "#harddance", "#lilsbd"],
    shotList: [],
  });

  for (let i = 0; i < clipsToAttach.length; i++) {
    const clip = clipsToAttach[i]!;
    await db.insert(socialRawClips).values({
      id: `raw-${userId}-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      userId,
      postId,
      storageKey: clip.storageKey,
      fileName: clip.fileName,
      sizeBytes: clip.sizeBytes,
      durationSec: clip.durationSec ?? null,
      width: clip.width ?? null,
      height: clip.height ?? null,
      fps: clip.fps ?? null,
      orderIndex: i,
    });
  }

  const job = await enqueueJob({
    userId,
    postId,
    catalogItemId: track.id,
    jobType: "render_video",
    stageLabel: isMultiTake
      ? `Queued ${clipsToAttach.length}-angle beat-cut mashup (${preset}) for ${track.title}`
      : `Queued auto-edit (${preset}) for ${track.title}`,
    payload: {
      postId,
      preset,
      burnHookOverlay: data.burnHookOverlay ?? profile?.burnHookOverlay ?? false,
      hookOverlayText: data.hookOverlayText?.trim() || "",
      fullAutopilot: data.fullAutopilot ?? profile?.fullAutopilot ?? false,
    },
    maxAttempts: 2,
  });

  ensureBackgroundWorkerRunning();

  return {
    postId,
    jobId: job.id,
    scheduledFor: nextSlot.toISOString(),
  };
}

export async function rerenderPostImpl(data: {
  postId: string;
  preset?: EditPreset;
  overrideOffsetSec?: number;
  overrideMasterStartSec?: number;
  overrideDurationSec?: number;
  audioHeadroomDb?: number;
  burnHookOverlay?: boolean;
  hookOverlayText?: string;
  forceResync?: boolean;
  variationSeed?: number;
}) {
  const session = await requireSessionImpl();
  const userId = session.user.id;

  const postRows = await db
    .select()
    .from(socialPosts)
    .where(and(eq(socialPosts.id, data.postId), eq(socialPosts.userId, userId)))
    .limit(1);
  const post = postRows[0];
  if (!post) throw new Error("Post not found");

  await db
    .update(socialPosts)
    .set({
      reviewStatus: "processing",
      status: "editing",
      autoPublish: false,
      updatedAt: new Date(),
    })
    .where(eq(socialPosts.id, post.id));

  const payload: Record<string, string | number | boolean | null> = {
    postId: post.id,
    // Keep manual tweaks/preset switches/cut shuffles fast and preserve user's edited copy
    skipAiDirector: true,
  };
  if (data.preset !== undefined) payload.preset = data.preset;
  if (data.overrideOffsetSec !== undefined) payload.overrideOffsetSec = data.overrideOffsetSec;
  if (data.overrideMasterStartSec !== undefined)
    payload.overrideMasterStartSec = data.overrideMasterStartSec;
  if (data.overrideDurationSec !== undefined)
    payload.overrideDurationSec = data.overrideDurationSec;
  if (data.audioHeadroomDb !== undefined) payload.audioHeadroomDb = data.audioHeadroomDb;
  if (data.burnHookOverlay !== undefined) payload.burnHookOverlay = data.burnHookOverlay;
  if (data.hookOverlayText !== undefined) payload.hookOverlayText = data.hookOverlayText;
  if (data.forceResync !== undefined) payload.forceResync = data.forceResync;
  if (data.variationSeed !== undefined) payload.variationSeed = data.variationSeed;

  const job = await enqueueJob({
    userId,
    postId: post.id,
    catalogItemId: post.catalogItemId,
    jobType: "render_video",
    stageLabel:
      data.variationSeed !== undefined
        ? "Shuffling multi-take angle cuts..."
        : `Re-rendering (${data.preset ?? post.editRecipe?.preset ?? "punchy"})...`,
    payload,
    maxAttempts: 2,
  });

  ensureBackgroundWorkerRunning();
  return { ok: true, jobId: job.id };
}

export async function rerollPostCopyImpl(data: { postId: string }) {
  const session = await requireSessionImpl();
  const userId = session.user.id;

  const [postRows, profileRows] = await Promise.all([
    db
      .select()
      .from(socialPosts)
      .where(and(eq(socialPosts.id, data.postId), eq(socialPosts.userId, userId)))
      .limit(1),
    db.select().from(artistProfiles).where(eq(artistProfiles.userId, userId)).limit(1),
  ]);

  const post = postRows[0];
  if (!post) throw new Error("Post not found");
  const profile = profileRows[0];

  const trackRows = post.catalogItemId
    ? await db
        .select()
        .from(artistCatalogItems)
        .where(eq(artistCatalogItems.id, post.catalogItemId))
        .limit(1)
    : [];
  const track = trackRows[0];

  const result = await rerollCopyWithGemini({
    trackContext: {
      title: track?.title || post.title,
      bpm: Math.round(track?.audioAnalysis?.bpm || track?.bpm || 200),
      albumOrChapter: track?.albumOrChapter,
      releaseDate: track?.releaseDate,
      stageName: profile?.stageName || "LIL SBD",
      defaultBioLink: profile?.defaultBioLink || "https://lilsbd.com",
      streamingUrl: track?.streamingLinks?.spotify || track?.streamingLinks?.soundcloud || null,
    },
    sceneSummary: post.editRecipe?.aiDirector?.sceneSummary,
    previousCaption: post.captionEn,
    profileGeminiModel: profile?.geminiModel,
    variationSeed: Math.floor(Date.now() / 1000) % 997,
  });

  await db
    .update(socialPosts)
    .set({
      title: result.copy.title,
      captionEn: result.copy.caption,
      captionFr: result.copy.caption,
      onScreenHookEn: result.copy.hookOverlayText,
      onScreenHookFr: result.copy.hookOverlayText,
      hashtags: result.copy.hashtags,
      updatedAt: new Date(),
    })
    .where(eq(socialPosts.id, post.id));

  return {
    ok: true,
    source: result.source,
    model: result.model,
    copy: result.copy,
  };
}

export async function rerollPostEditImpl(data: { postId: string }) {
  const session = await requireSessionImpl();
  const userId = session.user.id;

  const postRows = await db
    .select()
    .from(socialPosts)
    .where(and(eq(socialPosts.id, data.postId), eq(socialPosts.userId, userId)))
    .limit(1);
  const post = postRows[0];
  if (!post) throw new Error("Post not found");

  await db
    .update(socialPosts)
    .set({
      reviewStatus: "processing",
      status: "editing",
      autoPublish: false,
      updatedAt: new Date(),
    })
    .where(eq(socialPosts.id, post.id));

  const variationSeed = Math.floor(Math.random() * 10_000) + 1;
  const job = await enqueueJob({
    userId,
    postId: post.id,
    catalogItemId: post.catalogItemId,
    jobType: "render_video",
    stageLabel: "AI Director picking an alternate cut & copy...",
    payload: {
      postId: post.id,
      skipAiDirector: false,
      variationSeed,
    },
    maxAttempts: 2,
  });

  ensureBackgroundWorkerRunning();
  return { ok: true, jobId: job.id };
}

export async function runMediaCleanupNowImpl() {
  const session = await requireSessionImpl();
  const summary = await runMediaLifecycleCleanup({ userId: session.user.id });
  return { ok: true, summary };
}

export async function upsertSocialConnectionImpl(data: {
  platform: PublishablePlatform;
  accountName: string;
  externalAccountId: string;
  accessToken: string;
  refreshToken?: string;
  metadata?: SocialConnectionMetadata;
}) {
  const session = await requireSessionImpl();
  const userId = session.user.id;

  const existing = await db
    .select()
    .from(socialConnections)
    .where(
      and(
        eq(socialConnections.userId, userId),
        eq(socialConnections.platform, data.platform),
      ),
    )
    .limit(1);

  let tokenToSave =
    data.accessToken === "__KEEP_EXISTING__" && existing[0]
      ? existing[0].accessToken
      : data.accessToken.trim();

  const refreshToSave =
    data.refreshToken === "__KEEP_EXISTING__" && existing[0]
      ? existing[0].refreshToken
      : data.refreshToken?.trim() || existing[0]?.refreshToken || null;

  let resolvedAccountId = data.externalAccountId.trim();
  let resolvedAccountName = data.accountName.trim();
  let tokenExpiresAt: Date | null = existing[0]?.tokenExpiresAt ?? null;

  // Dev-mode ergonomics: auto-exchange short-lived Meta token & auto-discover Account ID if "auto"
  if (data.platform === "instagram_reels" && data.accessToken !== "__KEEP_EXISTING__") {
    const appId = process.env.META_APP_ID?.trim() || process.env.INSTAGRAM_APP_ID?.trim();
    const appSecret =
      process.env.META_APP_SECRET?.trim() || process.env.INSTAGRAM_APP_SECRET?.trim();
    if (appId && appSecret) {
      try {
        const longUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
        longUrl.searchParams.set("grant_type", "fb_exchange_token");
        longUrl.searchParams.set("client_id", appId);
        longUrl.searchParams.set("client_secret", appSecret);
        longUrl.searchParams.set("fb_exchange_token", tokenToSave);
        const longRes = await fetch(longUrl);
        const longJson = (await longRes.json()) as {
          access_token?: string;
          expires_in?: number;
        };
        if (longRes.ok && longJson.access_token) {
          tokenToSave = longJson.access_token;
          if (longJson.expires_in) {
            tokenExpiresAt = new Date(Date.now() + longJson.expires_in * 1000);
          }
        }
      } catch {
        // Keep original token if exchange fails
      }
    }

    if (!resolvedAccountId || resolvedAccountId.toLowerCase() === "auto") {
      const pagesUrl = new URL("https://graph.facebook.com/v21.0/me/accounts");
      pagesUrl.searchParams.set(
        "fields",
        "id,name,instagram_business_account{id,username,name}",
      );
      pagesUrl.searchParams.set("access_token", tokenToSave);
      const pagesRes = await fetch(pagesUrl);
      const pagesJson = (await pagesRes.json()) as {
        data?: Array<{
          instagram_business_account?: {
            id: string;
            username?: string;
            name?: string;
          };
        }>;
        error?: { message?: string };
      };
      const igBiz = pagesJson.data?.find((p) => p.instagram_business_account)
        ?.instagram_business_account;
      if (!igBiz?.id) {
        throw new Error(
          pagesJson.error?.message ||
            "Could not auto-detect an Instagram Creator/Business account linked to your Facebook Page. Ensure instagram_basic + pages_show_list scopes are checked, or enter your IG Business Account ID manually.",
        );
      }
      resolvedAccountId = igBiz.id;
      if (igBiz.username) {
        resolvedAccountName = `@${igBiz.username}`;
      }
    }
  } else if (
    data.platform === "tiktok" &&
    (!resolvedAccountId || resolvedAccountId.toLowerCase() === "auto")
  ) {
    try {
      const userRes = await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name",
        { headers: { Authorization: `Bearer ${tokenToSave}` } },
      );
      const userJson = (await userRes.json()) as {
        data?: { user?: { open_id?: string; display_name?: string } };
      };
      resolvedAccountId = userJson.data?.user?.open_id || "tiktok-user";
      if (userJson.data?.user?.display_name) {
        resolvedAccountName = userJson.data.user.display_name;
      }
    } catch {
      resolvedAccountId = "tiktok-user";
    }
  } else if (
    data.platform === "youtube_shorts" &&
    (!resolvedAccountId ||
      resolvedAccountId.toLowerCase() === "auto" ||
      resolvedAccountId.toLowerCase() === "mine")
  ) {
    try {
      const chRes = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: { Authorization: `Bearer ${tokenToSave}` } },
      );
      const chJson = (await chRes.json()) as {
        items?: Array<{ id?: string; snippet?: { title?: string } }>;
      };
      const ch = chJson.items?.[0];
      resolvedAccountId = ch?.id || "mine";
      if (ch?.snippet?.title) {
        resolvedAccountName = ch.snippet.title;
      }
    } catch {
      resolvedAccountId = "mine";
    }
  }

  await db
    .delete(socialConnections)
    .where(
      and(
        eq(socialConnections.userId, userId),
        eq(socialConnections.platform, data.platform),
      ),
    );

  const id = `conn-${userId}-${data.platform}`;
  await db.insert(socialConnections).values({
    id,
    userId,
    platform: data.platform,
    accountName: resolvedAccountName || data.platform,
    externalAccountId: resolvedAccountId || "auto",
    accessToken: tokenToSave,
    refreshToken: refreshToSave,
    tokenExpiresAt,
    metadata: data.metadata ?? existing[0]?.metadata ?? {},
    updatedAt: new Date(),
  });

  return { id };
}

export async function disconnectSocialAccountImpl(data: { platform: PublishablePlatform }) {
  const session = await requireSessionImpl();
  await db
    .delete(socialConnections)
    .where(
      and(
        eq(socialConnections.userId, session.user.id),
        eq(socialConnections.platform, data.platform),
      ),
    );
  return { ok: true };
}

export async function testSocialConnectionImpl(data: { platform: PublishablePlatform }) {
  const session = await requireSessionImpl();
  const rows = await db
    .select()
    .from(socialConnections)
    .where(
      and(
        eq(socialConnections.userId, session.user.id),
        eq(socialConnections.platform, data.platform),
      ),
    )
    .limit(1);

  const conn = rows[0];
  if (!conn) {
    return {
      ok: false,
      accountLabel: "",
      message: "Account is not connected yet.",
    };
  }

  const res = await testSocialConnection(conn);
  if (res.ok && res.accountLabel && res.accountLabel !== conn.accountName) {
    await db
      .update(socialConnections)
      .set({ accountName: res.accountLabel, updatedAt: new Date() })
      .where(eq(socialConnections.id, conn.id));
  }
  return res;
}

export async function syncLilSbdCatalogImpl() {
  const session = await requireSessionImpl();
  const userId = session.user.id;
  let syncedCount = 0;

  for (const song of songs) {
    const existing = await db
      .select({ id: artistCatalogItems.id })
      .from(artistCatalogItems)
      .where(and(eq(artistCatalogItems.userId, userId), eq(artistCatalogItems.slug, song.slug)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(artistCatalogItems).values({
        id: `cat-sync-${userId}-${song.slug}`,
        userId,
        type: "track",
        slug: song.slug,
        title: song.title,
        albumOrChapter: song.album ?? "Single",
        releaseDate: song.releaseDate,
        artworkUrl: song.artworkUrl ?? "/covers/DEAD-OPS.png",
        audioPreviewUrl: song.urlMP3,
        masterAudioPath: song.urlWAV || song.urlMP3,
        bpm: song.slug === "ascension" || song.slug === "lock-the-doors" ? 205 : 200,
        keySignature: "F Minor",
        genreTag: "Uptempo Hardcore",
        description: `${song.title} by ${song.artists.join(" & ")}${song.album ? ` (${song.album})` : ""}`,
        streamingLinks: {
          spotify: "spotify" in song.links ? song.links.spotify : undefined,
          soundcloud: song.links.soundcloud,
          youtubeMusic: "youtubeMusic" in song.links ? song.links.youtubeMusic : undefined,
          appleMusic: "appleMusic" in song.links ? song.links.appleMusic : undefined,
        },
        hookTimestamps: [],
      });
      syncedCount++;
    }
  }

  return { syncedCount };
}

export async function upsertCatalogItemImpl(data: {
  id?: string;
  type: "track" | "ep" | "course_lesson" | "lead_magnet";
  title: string;
  albumOrChapter?: string;
  releaseDate: string;
  artworkUrl?: string;
  audioPreviewUrl?: string;
  masterAudioPath?: string;
  bpm: number;
  keySignature: string;
  genreTag: string;
  description?: string;
  streamingLinks: {
    spotify?: string;
    soundcloud?: string;
    youtubeMusic?: string;
    appleMusic?: string;
    courseUrl?: string;
    customUrl?: string;
  };
}) {
  const session = await requireSessionImpl();
  const userId = session.user.id;
  const slug = data.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  if (data.id) {
    await db
      .update(artistCatalogItems)
      .set({
        type: data.type as CatalogItemType,
        slug,
        title: data.title,
        albumOrChapter: data.albumOrChapter ?? null,
        releaseDate: new Date(data.releaseDate),
        artworkUrl: data.artworkUrl || "/covers/DEAD-OPS.png",
        audioPreviewUrl: data.audioPreviewUrl || null,
        ...(data.masterAudioPath !== undefined
          ? { masterAudioPath: data.masterAudioPath || null }
          : {}),
        bpm: data.bpm,
        keySignature: data.keySignature,
        genreTag: data.genreTag,
        description: data.description ?? null,
        streamingLinks: data.streamingLinks,
        updatedAt: new Date(),
      })
      .where(and(eq(artistCatalogItems.id, data.id), eq(artistCatalogItems.userId, userId)));
    return { id: data.id };
  }

  const id = `cat-${userId}-${Date.now()}`;
  await db.insert(artistCatalogItems).values({
    id,
    userId,
    type: data.type as CatalogItemType,
    slug,
    title: data.title,
    albumOrChapter: data.albumOrChapter ?? null,
    releaseDate: new Date(data.releaseDate),
    artworkUrl: data.artworkUrl || "/covers/DEAD-OPS.png",
    audioPreviewUrl: data.audioPreviewUrl || null,
    masterAudioPath: data.masterAudioPath || null,
    bpm: data.bpm,
    keySignature: data.keySignature,
    genreTag: data.genreTag,
    description: data.description ?? null,
    streamingLinks: data.streamingLinks,
    hookTimestamps: [
      { label: "1st Drop", startSec: 40, endSec: 56 },
      { label: "2nd Kick Switch", startSec: 72, endSec: 88 },
    ],
  });

  if (data.masterAudioPath || data.audioPreviewUrl) {
    await enqueueJob({
      userId,
      catalogItemId: id,
      jobType: "analyze_track",
      stageLabel: `Queued audio analysis for ${data.title}`,
      payload: { catalogItemId: id },
    });
    ensureBackgroundWorkerRunning();
  }

  return { id };
}

export async function analyzeCatalogTrackImpl(data: { catalogItemId: string; runImmediately?: boolean }) {
  const session = await requireSessionImpl();
  const userId = session.user.id;

  const rows = await db
    .select()
    .from(artistCatalogItems)
    .where(
      and(eq(artistCatalogItems.id, data.catalogItemId), eq(artistCatalogItems.userId, userId)),
    )
    .limit(1);

  const item = rows[0];
  if (!item) {
    throw new Error("Track not found in catalog");
  }

  const job = await enqueueJob({
    userId,
    catalogItemId: item.id,
    jobType: "analyze_track",
    stageLabel: `Queued audio analysis for ${item.title}`,
    payload: { catalogItemId: item.id },
  });

  if (data.runImmediately) {
    const processed = await processJobById(job.id);
    if (processed && (processed.status === "failed" || processed.error)) {
      throw new Error(processed.error || `Audio analysis failed for ${item.title}`);
    }
    const updatedRows = await db
      .select()
      .from(artistCatalogItems)
      .where(eq(artistCatalogItems.id, item.id))
      .limit(1);
    return {
      job: processed ?? job,
      analysis: updatedRows[0]?.audioAnalysis ?? null,
    };
  }

  ensureBackgroundWorkerRunning();
  triggerWorkerTickSoon();
  return { job, analysis: item.audioAnalysis ?? null };
}

export async function analyzeAllCatalogTracksImpl(data?: { forceReanalyze?: boolean }) {
  const session = await requireSessionImpl();
  const userId = session.user.id;
  const [items, activeJobs] = await Promise.all([
    db.select().from(artistCatalogItems).where(eq(artistCatalogItems.userId, userId)),
    listActiveJobsForUser(userId),
  ]);

  const activeTrackIds = new Set(
    activeJobs
      .filter((j) => j.jobType === "analyze_track" && j.catalogItemId)
      .map((j) => j.catalogItemId!),
  );

  let queuedCount = 0;
  for (const item of items) {
    const hasAudio = Boolean(item.masterAudioPath || item.audioPreviewUrl);
    const needsAnalysis =
      data?.forceReanalyze || !item.audioAnalysis || (item.audioAnalysis.version ?? 1) < 2;
    if (hasAudio && needsAnalysis && !activeTrackIds.has(item.id)) {
      await enqueueJob({
        userId,
        catalogItemId: item.id,
        jobType: "analyze_track",
        stageLabel: `Queued Audio Brain v2 analysis for ${item.title}`,
        payload: { catalogItemId: item.id },
      });
      queuedCount++;
    }
  }

  ensureBackgroundWorkerRunning();
  if (queuedCount > 0) {
    triggerWorkerTickSoon();
  }
  return { queuedCount };
}

export async function updateTrackAudioMetadataImpl(data: {
  catalogItemId: string;
  bpm?: number;
  bpmLocked?: boolean;
  addMarker?: {
    kind: TrackSectionKind;
    dropImpactSec: number;
    label?: string;
  };
  removeMarkerIndex?: number;
  removeMarkerId?: string;
}) {
  const session = await requireSessionImpl();
  const userId = session.user.id;

  const rows = await db
    .select()
    .from(artistCatalogItems)
    .where(
      and(eq(artistCatalogItems.id, data.catalogItemId), eq(artistCatalogItems.userId, userId)),
    )
    .limit(1);

  const item = rows[0];
  if (!item) {
    throw new Error("Track not found in catalog");
  }

  const nextBpm =
    data.bpm !== undefined && Number.isFinite(data.bpm)
      ? Math.max(60, Math.min(350, Math.round(data.bpm)))
      : (item.bpm ?? 200);

  const existingAnalysis = item.audioAnalysis;
  let nextAnalysis = existingAnalysis ? { ...existingAnalysis } : null;

  if (nextAnalysis) {
    if (data.bpmLocked !== undefined) {
      nextAnalysis.bpmLocked = data.bpmLocked;
    }
    if (data.bpm !== undefined) {
      nextAnalysis.bpm = nextBpm;
      if (nextAnalysis.bpmLocked) {
        delete nextAnalysis.bpmRange;
      }
    }

    let nextDrops: TrackDropSection[] = [...(nextAnalysis.drops ?? [])];

    if (data.removeMarkerId) {
      nextDrops = nextDrops.filter((d) => d.id !== data.removeMarkerId);
    } else if (
      data.removeMarkerIndex !== undefined &&
      data.removeMarkerIndex >= 0 &&
      data.removeMarkerIndex < nextDrops.length
    ) {
      nextDrops.splice(data.removeMarkerIndex, 1);
    }

    if (data.addMarker) {
      const impact = Number(
        Math.max(0, Math.min(nextAnalysis.durationSec || 600, data.addMarker.dropImpactSec)).toFixed(
          2,
        ),
      );
      const kind: TrackSectionKind =
        data.addMarker.kind === "drop" ? "drop" : "highlight";
      const defaultLabel =
        kind === "highlight"
          ? "Highlight"
          : `Drop ${nextDrops.filter((d) => (d.kind ?? "drop") === "drop").length + 1}`;
      nextDrops.push({
        id: `manual-${kind}-${Date.now()}-${Math.round(impact * 10)}`,
        kind,
        label: data.addMarker.label?.trim() || defaultLabel,
        startSec: Number(Math.max(0, impact - (kind === "highlight" ? 2.5 : 3.5)).toFixed(2)),
        endSec: Number(
          Math.min(nextAnalysis.durationSec || impact + 16, impact + (kind === "highlight" ? 12 : 16)).toFixed(2),
        ),
        dropImpactSec: impact,
        peakEnergy: 1,
        bpm: nextBpm,
        isManual: true,
      });
      nextDrops.sort((a, b) => a.dropImpactSec - b.dropImpactSec);
    }

    nextAnalysis.drops = nextDrops;
  }

  await db
    .update(artistCatalogItems)
    .set({
      bpm: nextBpm,
      ...(nextAnalysis
        ? {
            audioAnalysis: nextAnalysis,
            hookTimestamps: nextAnalysis.drops.map((d) => ({
              label: d.label,
              startSec: Math.round(d.startSec),
              endSec: Math.round(d.endSec),
            })),
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(artistCatalogItems.id, item.id));

  return { ok: true, bpm: nextBpm, audioAnalysis: nextAnalysis };
}

export async function getBackgroundJobsImpl(limit = 25) {
  const session = await requireSessionImpl();
  return listUserJobs(session.user.id, limit);
}

export async function deleteCatalogItemImpl(data: { id: string }) {
  const session = await requireSessionImpl();
  await db
    .delete(artistCatalogItems)
    .where(
      and(eq(artistCatalogItems.id, data.id), eq(artistCatalogItems.userId, session.user.id)),
    );
  return { ok: true };
}

export async function upsertSocialPostImpl(data: {
  id?: string;
  campaignId?: string | null;
  catalogItemId?: string | null;
  templateId?: string | null;
  title: string;
  status: PostStatus;
  platforms: SocialPlatform[];
  pillar: ContentPillar;
  scheduledFor?: string | null;
  videoUrl?: string | null;
  videoFileName?: string | null;
  videoSizeBytes?: number | null;
  autoPublish?: boolean;
  platformDeliveries?: PlatformDeliveries;
  onScreenHookEn: string;
  onScreenHookFr: string;
  hookVariantsEn?: {
    curiosity?: string;
    contrarian?: string;
    tutorial?: string;
    pov?: string;
    showcase?: string;
  };
  hookVariantsFr?: {
    curiosity?: string;
    contrarian?: string;
    tutorial?: string;
    pov?: string;
    showcase?: string;
  };
  shotList: Array<{ id: string; text: string; completed: boolean }>;
  audioTimestamp?: string | null;
  captionEn: string;
  captionFr: string;
  ctaEn: string;
  ctaFr: string;
  hashtags: string[];
  preFlightChecklist?: {
    highResExport: boolean;
    coverFrameSelected: boolean;
    audioSynced: boolean;
    linkInBioUpdated: boolean;
  };
  publishedUrl?: string | null;
  views: number;
  likes: number;
  saves: number;
  shares: number;
  comments: number;
  performanceRating?: PerformanceRating | null;
  retrospectiveNotes?: string | null;
}) {
  const session = await requireSessionImpl();
  const userId = session.user.id;
  const scheduledDate = data.scheduledFor ? new Date(data.scheduledFor) : null;
  const postedDate = data.status === "posted" ? new Date() : null;
  const autoPublish = Boolean(data.autoPublish);

  // Build updated platform deliveries state when autoPublish is toggled
  const buildDeliveries = (existing: PlatformDeliveries = {}): PlatformDeliveries => {
    const next: PlatformDeliveries = { ...existing, ...(data.platformDeliveries ?? {}) };
    if (autoPublish) {
      for (const p of data.platforms) {
        if (isPublishablePlatform(p)) {
          const cur = next[p]?.status;
          if (!cur || cur === "idle") {
            next[p] = {
              status: "scheduled",
              updatedAt: new Date().toISOString(),
            };
          }
        }
      }
    }
    return next;
  };

  if (data.id) {
    const existingRows = await db
      .select({ platformDeliveries: socialPosts.platformDeliveries })
      .from(socialPosts)
      .where(and(eq(socialPosts.id, data.id), eq(socialPosts.userId, userId)))
      .limit(1);

    const mergedDeliveries = buildDeliveries(existingRows[0]?.platformDeliveries ?? {});

    await db
      .update(socialPosts)
      .set({
        campaignId: data.campaignId ?? null,
        catalogItemId: data.catalogItemId ?? null,
        templateId: data.templateId ?? null,
        title: data.title,
        status: data.status,
        platforms: data.platforms,
        pillar: data.pillar,
        scheduledFor: scheduledDate,
        ...(data.status === "posted" ? { postedAt: postedDate } : {}),
        videoUrl: data.videoUrl ?? null,
        videoFileName: data.videoFileName ?? null,
        videoSizeBytes: data.videoSizeBytes ?? null,
        autoPublish,
        platformDeliveries: mergedDeliveries,
        onScreenHookEn: data.onScreenHookEn,
        onScreenHookFr: data.onScreenHookFr,
        ...(data.hookVariantsEn ? { hookVariantsEn: data.hookVariantsEn } : {}),
        ...(data.hookVariantsFr ? { hookVariantsFr: data.hookVariantsFr } : {}),
        shotList: data.shotList,
        audioTimestamp: data.audioTimestamp ?? "0:42 - 0:58",
        captionEn: data.captionEn,
        captionFr: data.captionFr,
        ctaEn: data.ctaEn,
        ctaFr: data.ctaFr,
        hashtags: data.hashtags,
        ...(data.preFlightChecklist ? { preFlightChecklist: data.preFlightChecklist } : {}),
        publishedUrl: data.publishedUrl ?? null,
        views: data.views,
        likes: data.likes,
        saves: data.saves,
        shares: data.shares,
        comments: data.comments,
        performanceRating: data.performanceRating ?? null,
        retrospectiveNotes: data.retrospectiveNotes ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(socialPosts.id, data.id), eq(socialPosts.userId, userId)));

    return { id: data.id };
  }

  const id = `post-${userId}-${Date.now()}`;
  await db.insert(socialPosts).values({
    id,
    userId,
    campaignId: data.campaignId ?? null,
    catalogItemId: data.catalogItemId ?? null,
    templateId: data.templateId ?? null,
    title: data.title,
    status: data.status,
    platforms: data.platforms,
    pillar: data.pillar,
    scheduledFor: scheduledDate ?? new Date(),
    postedAt: postedDate,
    sortOrder: 0,
    videoUrl: data.videoUrl ?? null,
    videoFileName: data.videoFileName ?? null,
    videoSizeBytes: data.videoSizeBytes ?? null,
    autoPublish,
    platformDeliveries: buildDeliveries({}),
    onScreenHookEn: data.onScreenHookEn,
    onScreenHookFr: data.onScreenHookFr,
    hookVariantsEn: data.hookVariantsEn ?? {},
    hookVariantsFr: data.hookVariantsFr ?? {},
    shotList: data.shotList,
    audioTimestamp: data.audioTimestamp ?? "0:42 - 0:58",
    captionEn: data.captionEn,
    captionFr: data.captionFr,
    ctaEn: data.ctaEn,
    ctaFr: data.ctaFr,
    hashtags: data.hashtags,
    preFlightChecklist: data.preFlightChecklist ?? {
      highResExport: false,
      coverFrameSelected: false,
      audioSynced: false,
      linkInBioUpdated: false,
    },
    publishedUrl: data.publishedUrl ?? null,
    views: data.views,
    likes: data.likes,
    saves: data.saves,
    shares: data.shares,
    comments: data.comments,
    performanceRating: data.performanceRating ?? null,
    retrospectiveNotes: data.retrospectiveNotes ?? null,
  });

  return { id };
}

export async function publishPostNowImpl(data: {
  postId: string;
  platforms?: PublishablePlatform[];
}) {
  const session = await requireSessionImpl();
  return publishSocialPostToPlatforms(data.postId, session.user.id, data.platforms);
}

export async function updatePostStatusImpl(data: {
  id: string;
  status: PostStatus;
  scheduledFor?: string;
}) {
  const session = await requireSessionImpl();
  const userId = session.user.id;

  await db
    .update(socialPosts)
    .set({
      status: data.status,
      ...(data.status === "posted" ? { postedAt: new Date() } : {}),
      ...(data.scheduledFor ? { scheduledFor: new Date(data.scheduledFor) } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(socialPosts.id, data.id), eq(socialPosts.userId, userId)));

  return { ok: true };
}

export async function deleteSocialPostImpl(data: { id: string }) {
  const session = await requireSessionImpl();
  await db
    .delete(socialPosts)
    .where(and(eq(socialPosts.id, data.id), eq(socialPosts.userId, session.user.id)));
  return { ok: true };
}

export async function instantiateIdeaTemplateImpl(data: {
  templateId: string;
  catalogItemId?: string | null;
  scheduledFor?: string;
  status: "idea" | "filming" | "editing" | "ready";
}) {
  const session = await requireSessionImpl();
  const userId = session.user.id;

  const [tplRows, profileRows, catalogRows] = await Promise.all([
    db.select().from(ideaTemplates).where(eq(ideaTemplates.id, data.templateId)).limit(1),
    db.select().from(artistProfiles).where(eq(artistProfiles.userId, userId)).limit(1),
    data.catalogItemId
      ? db
          .select()
          .from(artistCatalogItems)
          .where(
            and(
              eq(artistCatalogItems.id, data.catalogItemId),
              eq(artistCatalogItems.userId, userId),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
  ]);

  const tpl = tplRows[0];
  if (!tpl) {
    throw new Error("Template not found");
  }

  const profile = profileRows[0];
  const catalogItem = catalogRows[0];

  const vars = {
    trackTitle: catalogItem?.title ?? "my new track",
    bpm: catalogItem?.bpm ?? 200,
    stageName: profile?.stageName ?? "LIL SBD",
    genre: catalogItem?.genreTag ?? profile?.genre ?? "Uptempo Hardcore",
  };

  const interpolateRecord = (rec: { [key: string]: string | undefined } | object) => {
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(rec)) {
      if (typeof v === "string" && v) result[k] = interpolateTemplateText(v, vars);
    }
    return result;
  };

  const postId = `post-${userId}-${Date.now()}`;
  const postTitle = catalogItem ? `${catalogItem.title} — ${tpl.title}` : tpl.title;
  const rawCaption = interpolateTemplateText(tpl.captionTemplateEn, vars);
  const rawCta = interpolateTemplateText(tpl.defaultCtaEn, vars);
  const combinedCaption =
    rawCta && !rawCaption.includes(rawCta)
      ? `${rawCaption}\n\n${rawCta}`.trim()
      : rawCaption;

  await db.insert(socialPosts).values({
    id: postId,
    userId,
    catalogItemId: catalogItem?.id ?? null,
    templateId: tpl.id,
    title: postTitle,
    status: data.status as PostStatus,
    platforms: tpl.recommendedPlatforms.filter(isPublishablePlatform),
    pillar: tpl.pillar,
    scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : new Date(),
    sortOrder: 0,
    onScreenHookEn: interpolateTemplateText(tpl.hookFormulaEn, vars),
    onScreenHookFr: interpolateTemplateText(tpl.hookFormulaFr, vars),
    hookVariantsEn: interpolateRecord(tpl.hookVariantsEn),
    hookVariantsFr: interpolateRecord(tpl.hookVariantsFr),
    shotList: tpl.defaultShotList.map((text, index) => ({
      id: `shot-${index + 1}`,
      text: interpolateTemplateText(text, vars),
      completed: false,
    })),
    audioTimestamp: "0:42 - 0:58 (Main Drop)",
    captionEn: combinedCaption,
    captionFr: combinedCaption,
    ctaEn: "",
    ctaFr: "",
    hashtags: tpl.suggestedHashtags,
    preFlightChecklist: {
      highResExport: false,
      coverFrameSelected: false,
      audioSynced: false,
      linkInBioUpdated: false,
    },
  });

  return { id: postId };
}

export async function createCustomIdeaTemplateImpl(data: {
  id?: string;
  title: string;
  description: string;
  category: IdeaCategory;
  pillar: ContentPillar;
  difficulty: IdeaDifficulty;
  recommendedPlatforms: SocialPlatform[];
  hookFormulaEn: string;
  hookFormulaFr: string;
  captionTemplateEn: string;
  captionTemplateFr: string;
  defaultCtaEn: string;
  defaultCtaFr: string;
  defaultShotList: string[];
  suggestedHashtags: string[];
  whyItWorks: string;
}) {
  const session = await requireSessionImpl();
  const userId = session.user.id;

  if (data.id) {
    await db
      .update(ideaTemplates)
      .set({
        category: data.category,
        pillar: data.pillar,
        title: data.title,
        description: data.description,
        difficulty: data.difficulty,
        recommendedPlatforms: data.recommendedPlatforms,
        hookFormulaEn: data.hookFormulaEn,
        hookFormulaFr: data.hookFormulaFr || data.hookFormulaEn,
        hookVariantsEn: { showcase: data.hookFormulaEn },
        hookVariantsFr: { showcase: data.hookFormulaFr || data.hookFormulaEn },
        captionTemplateEn: data.captionTemplateEn,
        captionTemplateFr: data.captionTemplateFr || data.captionTemplateEn,
        defaultCtaEn: data.defaultCtaEn,
        defaultCtaFr: data.defaultCtaFr || data.defaultCtaEn,
        defaultShotList: data.defaultShotList,
        suggestedHashtags: data.suggestedHashtags,
        whyItWorks: data.whyItWorks,
      })
      .where(
        and(
          eq(ideaTemplates.id, data.id),
          or(eq(ideaTemplates.userId, userId), isNull(ideaTemplates.userId)),
        ),
      );
    return { id: data.id };
  }

  const id = `tpl-${userId}-${Date.now()}`;

  await db.insert(ideaTemplates).values({
    id,
    userId,
    isSystem: false,
    category: data.category,
    pillar: data.pillar,
    title: data.title,
    description: data.description,
    difficulty: data.difficulty,
    recommendedPlatforms: data.recommendedPlatforms,
    hookFormulaEn: data.hookFormulaEn,
    hookFormulaFr: data.hookFormulaFr || data.hookFormulaEn,
    hookVariantsEn: { showcase: data.hookFormulaEn },
    hookVariantsFr: { showcase: data.hookFormulaFr || data.hookFormulaEn },
    captionTemplateEn: data.captionTemplateEn,
    captionTemplateFr: data.captionTemplateFr || data.captionTemplateEn,
    defaultCtaEn: data.defaultCtaEn,
    defaultCtaFr: data.defaultCtaFr,
    defaultShotList: data.defaultShotList,
    suggestedHashtags: data.suggestedHashtags,
    whyItWorks: data.whyItWorks,
  });

  return { id };
}

export async function deleteCustomIdeaTemplateImpl(data: { id: string }) {
  const session = await requireSessionImpl();
  await db
    .delete(ideaTemplates)
    .where(
      and(
        eq(ideaTemplates.id, data.id),
        or(eq(ideaTemplates.userId, session.user.id), isNull(ideaTemplates.userId)),
      ),
    );
  return { ok: true };
}

export async function generateReleaseCampaignImpl(data: {
  catalogItemId?: string | null;
  campaignType: CampaignType;
  title: string;
  releaseDate: string;
  notes?: string;
}) {
  const session = await requireSessionImpl();
  const userId = session.user.id;

  const [profileRows, catalogRows] = await Promise.all([
    db.select().from(artistProfiles).where(eq(artistProfiles.userId, userId)).limit(1),
    data.catalogItemId
      ? db
          .select()
          .from(artistCatalogItems)
          .where(
            and(
              eq(artistCatalogItems.id, data.catalogItemId),
              eq(artistCatalogItems.userId, userId),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
  ]);

  const profile = profileRows[0];
  const catalogItem = catalogRows[0];
  const blueprint = CAMPAIGN_ROLLOUT_BLUEPRINTS[data.campaignType];

  const anchorDate = new Date(data.releaseDate);
  const dayMs = 86_400_000;
  const minOffset = Math.min(...blueprint.steps.map((s) => s.dayOffset), 0);
  const maxOffset = Math.max(...blueprint.steps.map((s) => s.dayOffset), 7);

  const campaignId = `camp-${userId}-${Date.now()}`;

  await db.insert(releaseCampaigns).values({
    id: campaignId,
    userId,
    catalogItemId: catalogItem?.id ?? null,
    title: data.title,
    campaignType: data.campaignType,
    status: "active",
    startDate: new Date(anchorDate.getTime() + minOffset * dayMs),
    releaseDate: anchorDate,
    endDate: new Date(anchorDate.getTime() + maxOffset * dayMs),
    notes: data.notes ?? blueprint.description,
  });

  const vars = {
    trackTitle: catalogItem?.title ?? data.title,
    bpm: catalogItem?.bpm ?? 200,
    stageName: profile?.stageName ?? "LIL SBD",
    genre: catalogItem?.genreTag ?? profile?.genre ?? "Uptempo Hardcore",
  };

  for (let i = 0; i < blueprint.steps.length; i++) {
    const step = blueprint.steps[i]!;
    const scheduledFor = new Date(anchorDate.getTime() + step.dayOffset * dayMs);
    const stepTitle = interpolateTemplateText(
      `${vars.trackTitle} — ${step.titleSuffix}`,
      vars,
    );
    const rawCap = interpolateTemplateText(step.captionEn, vars);
    const rawCta = interpolateTemplateText(step.ctaEn, vars);
    const combinedCaption =
      rawCta && !rawCap.includes(rawCta) ? `${rawCap}\n\n${rawCta}`.trim() : rawCap;

    const filteredPlatforms = step.platforms.filter(isPublishablePlatform);

    await db.insert(socialPosts).values({
      id: `post-${campaignId}-${i + 1}`,
      userId,
      campaignId,
      catalogItemId: catalogItem?.id ?? null,
      title: stepTitle,
      status: i === 0 ? "filming" : "idea",
      platforms:
        filteredPlatforms.length > 0
          ? filteredPlatforms
          : ["instagram_reels", "tiktok", "youtube_shorts"],
      pillar: step.pillar,
      scheduledFor,
      sortOrder: i + 1,
      onScreenHookEn: interpolateTemplateText(step.onScreenHookEn, vars),
      onScreenHookFr: interpolateTemplateText(step.onScreenHookFr, vars),
      hookVariantsEn: {
        showcase: interpolateTemplateText(step.onScreenHookEn, vars),
        curiosity: `Wait for the switch on ${vars.trackTitle} (${vars.bpm} BPM)...`,
        tutorial: `Inside the session of ${vars.trackTitle}:`,
      },
      hookVariantsFr: {
        showcase: interpolateTemplateText(step.onScreenHookFr, vars),
        curiosity: `Attends le switch sur ${vars.trackTitle} (${vars.bpm} BPM)...`,
        tutorial: `Dans la session de ${vars.trackTitle} :`,
      },
      shotList: step.shotList.map((s, idx) => ({
        id: `s-${idx + 1}`,
        text: interpolateTemplateText(s, vars),
        completed: false,
      })),
      audioTimestamp: step.audioTimestamp,
      captionEn: combinedCaption,
      captionFr: combinedCaption,
      ctaEn: "",
      ctaFr: "",
      hashtags: [
        "#uptempohardcore",
        "#zaagkick",
        "#harddance",
        "#lilsbd",
        "#newmusic",
      ],
      preFlightChecklist: {
        highResExport: false,
        coverFrameSelected: false,
        audioSynced: false,
        linkInBioUpdated: false,
      },
    });
  }

  return { campaignId, generatedPostsCount: blueprint.steps.length };
}

export async function deleteCampaignImpl(data: { id: string; deletePosts: boolean }) {
  const session = await requireSessionImpl();
  const userId = session.user.id;

  if (data.deletePosts) {
    await db
      .delete(socialPosts)
      .where(and(eq(socialPosts.campaignId, data.id), eq(socialPosts.userId, userId)));
  }

  await db
    .delete(releaseCampaigns)
    .where(and(eq(releaseCampaigns.id, data.id), eq(releaseCampaigns.userId, userId)));

  return { ok: true };
}

export async function createHashtagPresetImpl(data: {
  name: string;
  platform: "all" | "instagram" | "tiktok" | "youtube_shorts";
  tags: string[];
}) {
  const session = await requireSessionImpl();
  const userId = session.user.id;
  const id = `tags-${userId}-${Date.now()}`;

  await db.insert(hashtagPresets).values({
    id,
    userId,
    isSystem: false,
    name: data.name,
    platform: data.platform,
    tags: data.tags.map((t) => (t.startsWith("#") ? t : `#${t}`)),
  });

  return { id };
}

export async function deleteHashtagPresetImpl(data: { id: string }) {
  const session = await requireSessionImpl();
  await db
    .delete(hashtagPresets)
    .where(
      and(
        eq(hashtagPresets.id, data.id),
        or(eq(hashtagPresets.userId, session.user.id), isNull(hashtagPresets.userId)),
      ),
    );
  return { ok: true };
}
