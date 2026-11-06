import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { db, ensureSchemaInitialized, getDatabaseMode } from "#/db";
import {
  artistCatalogItems,
  artistProfiles,
  type CampaignType,
  type CatalogItemType,
  type ContentPillar,
  hashtagPresets,
  type IdeaCategory,
  type IdeaDifficulty,
  ideaTemplates,
  type PerformanceRating,
  type PostStatus,
  releaseCampaigns,
  type SocialPlatform,
  socialPosts,
} from "#/db/schema";
import {
  CAMPAIGN_ROLLOUT_BLUEPRINTS,
  ensureUserWorkspaceSeeded,
  syncLilSbdCatalogForUser,
} from "#/db/seed-data";
import { auth, getConfiguredAuthInfo } from "#/lib/auth";

export async function requireSessionImpl() {
  await ensureSchemaInitialized();
  const headers = getRequestHeaders();
  const session = await auth.api.getSession({
    headers: new Headers(headers as Record<string, string>),
  });
  if (!session?.user) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
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
  const headers = getRequestHeaders();
  const session = await auth.api.getSession({
    headers: new Headers(headers as Record<string, string>),
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

  await ensureUserWorkspaceSeeded(userId, session.user.name);

  const [profileRows, catalog, campaigns, posts, templates, presets] = await Promise.all([
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
      .orderBy(desc(ideaTemplates.isSystem), desc(ideaTemplates.createdAt)),
    db
      .select()
      .from(hashtagPresets)
      .where(or(isNull(hashtagPresets.userId), eq(hashtagPresets.userId, userId)))
      .orderBy(desc(hashtagPresets.isSystem), asc(hashtagPresets.name)),
  ]);

  return {
    user: session.user,
    profile: profileRows[0]!,
    catalog,
    campaigns,
    posts,
    templates,
    hashtagPresets: presets,
    databaseMode: getDatabaseMode(),
  };
}

export async function updateArtistProfileImpl(data: {
  stageName: string;
  genre: string;
  tagline: string;
  primaryLanguage: "en" | "fr" | "bilingual";
  defaultBioLink: string;
  weeklyPostTarget: number;
}) {
  const session = await requireSessionImpl();
  const userId = session.user.id;

  await db
    .update(artistProfiles)
    .set({
      stageName: data.stageName,
      genre: data.genre,
      tagline: data.tagline,
      primaryLanguage: data.primaryLanguage,
      defaultBioLink: data.defaultBioLink,
      weeklyPostTarget: data.weeklyPostTarget,
      updatedAt: new Date(),
    })
    .where(eq(artistProfiles.userId, userId));

  return { ok: true };
}

export async function syncLilSbdCatalogImpl() {
  const session = await requireSessionImpl();
  return syncLilSbdCatalogForUser(session.user.id);
}

export async function upsertCatalogItemImpl(data: {
  id?: string;
  type: "track" | "ep" | "course_lesson" | "lead_magnet";
  title: string;
  albumOrChapter?: string;
  releaseDate: string;
  artworkUrl?: string;
  audioPreviewUrl?: string;
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
  return { id };
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

  if (data.id) {
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

  const interpolateRecord = (rec: Record<string, string | undefined>) => {
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(rec)) {
      if (v) result[k] = interpolateTemplateText(v, vars);
    }
    return result;
  };

  const postId = `post-${userId}-${Date.now()}`;
  const postTitle = catalogItem ? `${catalogItem.title} — ${tpl.title}` : tpl.title;

  await db.insert(socialPosts).values({
    id: postId,
    userId,
    catalogItemId: catalogItem?.id ?? null,
    templateId: tpl.id,
    title: postTitle,
    status: data.status as PostStatus,
    platforms: tpl.recommendedPlatforms,
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
    captionEn: interpolateTemplateText(tpl.captionTemplateEn, vars),
    captionFr: interpolateTemplateText(tpl.captionTemplateFr, vars),
    ctaEn: interpolateTemplateText(tpl.defaultCtaEn, vars),
    ctaFr: interpolateTemplateText(tpl.defaultCtaFr, vars),
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
        eq(ideaTemplates.userId, session.user.id),
        eq(ideaTemplates.isSystem, false),
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

    await db.insert(socialPosts).values({
      id: `post-${campaignId}-${i + 1}`,
      userId,
      campaignId,
      catalogItemId: catalogItem?.id ?? null,
      title: stepTitle,
      status: i === 0 ? "filming" : "idea",
      platforms: step.platforms,
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
      captionEn: interpolateTemplateText(step.captionEn, vars),
      captionFr: interpolateTemplateText(step.captionFr, vars),
      ctaEn: interpolateTemplateText(step.ctaEn, vars),
      ctaFr: interpolateTemplateText(step.ctaFr, vars),
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
