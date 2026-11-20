import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type {
  CampaignType,
  ContentPillar,
  IdeaCategory,
  IdeaDifficulty,
  PerformanceRating,
  PostStatus,
  SocialPlatform,
} from "#/db/schema";

// ============================================================================
// 1. Auth & Session Status
// ============================================================================

export const getAuthSessionServerFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getAuthSessionImpl } = await import("./socials.server");
  return getAuthSessionImpl();
});

// ============================================================================
// 2. Full Studio Dashboard Loader
// ============================================================================

export const getStudioDashboardServerFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getStudioDashboardImpl } = await import("./socials.server");
  return getStudioDashboardImpl();
});

// ============================================================================
// 3. Producer Profile & Catalog Mutations
// ============================================================================

const updateProfileSchema = z.object({
  stageName: z.string().min(1),
  genre: z.string().min(1),
  tagline: z.string(),
  primaryLanguage: z.enum(["en", "fr", "bilingual"]),
  defaultBioLink: z.string(),
  weeklyPostTarget: z.number().int().min(1).max(21),
});

export const updateArtistProfileServerFn = createServerFn({ method: "POST" })
  .inputValidator(updateProfileSchema)
  .handler(async ({ data }) => {
    const { updateArtistProfileImpl } = await import("./socials.server");
    return updateArtistProfileImpl(data);
  });

export const syncLilSbdCatalogServerFn = createServerFn({ method: "POST" }).handler(async () => {
  const { syncLilSbdCatalogImpl } = await import("./socials.server");
  return syncLilSbdCatalogImpl();
});

const upsertCatalogItemSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["track", "ep", "course_lesson", "lead_magnet"]),
  title: z.string().min(1),
  albumOrChapter: z.string().optional(),
  releaseDate: z.string(),
  artworkUrl: z.string().optional(),
  audioPreviewUrl: z.string().optional(),
  bpm: z.number().int().min(60).max(350).default(200),
  keySignature: z.string().default("F Minor"),
  genreTag: z.string().default("Uptempo Hardcore"),
  description: z.string().optional(),
  streamingLinks: z
    .object({
      spotify: z.string().optional(),
      soundcloud: z.string().optional(),
      youtubeMusic: z.string().optional(),
      appleMusic: z.string().optional(),
      courseUrl: z.string().optional(),
      customUrl: z.string().optional(),
    })
    .default({}),
});

export const upsertCatalogItemServerFn = createServerFn({ method: "POST" })
  .inputValidator(upsertCatalogItemSchema)
  .handler(async ({ data }) => {
    const { upsertCatalogItemImpl } = await import("./socials.server");
    return upsertCatalogItemImpl(data);
  });

export const deleteCatalogItemServerFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { deleteCatalogItemImpl } = await import("./socials.server");
    return deleteCatalogItemImpl(data);
  });

// ============================================================================
// 4. Social Post CRUD & Kanban / Copilot Operations
// ============================================================================

const upsertSocialPostSchema = z.object({
  id: z.string().optional(),
  campaignId: z.string().nullable().optional(),
  catalogItemId: z.string().nullable().optional(),
  templateId: z.string().nullable().optional(),
  title: z.string().min(1),
  status: z.enum(["idea", "filming", "editing", "ready", "posted"]),
  platforms: z.array(
    z.enum([
      "instagram_reels",
      "instagram_carousel",
      "instagram_story",
      "tiktok",
      "youtube_shorts",
    ]),
  ),
  pillar: z.enum([
    "drop_showcase",
    "sound_design_tutorial",
    "behind_the_scenes",
    "meme_relatable",
    "course_funnel",
    "release_promo",
  ]),
  scheduledFor: z.string().nullable().optional(),
  onScreenHookEn: z.string().default(""),
  onScreenHookFr: z.string().default(""),
  hookVariantsEn: z
    .object({
      curiosity: z.string().optional(),
      contrarian: z.string().optional(),
      tutorial: z.string().optional(),
      pov: z.string().optional(),
      showcase: z.string().optional(),
    })
    .optional(),
  hookVariantsFr: z
    .object({
      curiosity: z.string().optional(),
      contrarian: z.string().optional(),
      tutorial: z.string().optional(),
      pov: z.string().optional(),
      showcase: z.string().optional(),
    })
    .optional(),
  shotList: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        completed: z.boolean(),
      }),
    )
    .default([]),
  audioTimestamp: z.string().nullable().optional(),
  captionEn: z.string().default(""),
  captionFr: z.string().default(""),
  ctaEn: z.string().default(""),
  ctaFr: z.string().default(""),
  hashtags: z.array(z.string()).default([]),
  preFlightChecklist: z
    .object({
      highResExport: z.boolean(),
      coverFrameSelected: z.boolean(),
      audioSynced: z.boolean(),
      linkInBioUpdated: z.boolean(),
    })
    .optional(),
  publishedUrl: z.string().nullable().optional(),
  views: z.number().int().min(0).default(0),
  likes: z.number().int().min(0).default(0),
  saves: z.number().int().min(0).default(0),
  shares: z.number().int().min(0).default(0),
  comments: z.number().int().min(0).default(0),
  performanceRating: z
    .enum(["viral", "above_average", "average", "underperformed"])
    .nullable()
    .optional(),
  retrospectiveNotes: z.string().nullable().optional(),
});

export const upsertSocialPostServerFn = createServerFn({ method: "POST" })
  .inputValidator(upsertSocialPostSchema)
  .handler(async ({ data }) => {
    const { upsertSocialPostImpl } = await import("./socials.server");
    return upsertSocialPostImpl({
      ...data,
      status: data.status as PostStatus,
      platforms: data.platforms as SocialPlatform[],
      pillar: data.pillar as ContentPillar,
      performanceRating: (data.performanceRating as PerformanceRating | null) ?? null,
    });
  });

export const updatePostStatusServerFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
      status: z.enum(["idea", "filming", "editing", "ready", "posted"]),
      scheduledFor: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { updatePostStatusImpl } = await import("./socials.server");
    return updatePostStatusImpl({
      ...data,
      status: data.status as PostStatus,
    });
  });

export const deleteSocialPostServerFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { deleteSocialPostImpl } = await import("./socials.server");
    return deleteSocialPostImpl(data);
  });

// ============================================================================
// 5. Idea Vault Instantiation & Custom Producer Templates
// ============================================================================

export const instantiateIdeaTemplateServerFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      templateId: z.string(),
      catalogItemId: z.string().nullable().optional(),
      scheduledFor: z.string().optional(),
      status: z.enum(["idea", "filming", "editing", "ready"]).default("idea"),
    }),
  )
  .handler(async ({ data }) => {
    const { instantiateIdeaTemplateImpl } = await import("./socials.server");
    return instantiateIdeaTemplateImpl(data);
  });

export const createCustomIdeaTemplateServerFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string().optional(),
      title: z.string().min(1),
      description: z.string().min(1),
      category: z.enum([
        "kick_sound_design",
        "drop_reaction",
        "gym_hard_edit",
        "producer_hot_take",
        "course_teaser",
        "release_story",
      ]),
      pillar: z.enum([
        "drop_showcase",
        "sound_design_tutorial",
        "behind_the_scenes",
        "meme_relatable",
        "course_funnel",
        "release_promo",
      ]),
      difficulty: z.enum(["quick_5min", "daw_capture", "high_effort"]).default("daw_capture"),
      recommendedPlatforms: z
        .array(
          z.enum([
            "instagram_reels",
            "instagram_carousel",
            "instagram_story",
            "tiktok",
            "youtube_shorts",
          ]),
        )
        .default(["instagram_reels", "tiktok", "youtube_shorts"]),
      hookFormulaEn: z.string().min(1),
      hookFormulaFr: z.string().default(""),
      captionTemplateEn: z.string().default(""),
      captionTemplateFr: z.string().default(""),
      defaultCtaEn: z.string().default("Link in bio."),
      defaultCtaFr: z.string().default("Lien en bio."),
      defaultShotList: z.array(z.string()).default([]),
      suggestedHashtags: z.array(z.string()).default([]),
      whyItWorks: z.string().default("Custom producer template."),
    }),
  )
  .handler(async ({ data }) => {
    const { createCustomIdeaTemplateImpl } = await import("./socials.server");
    return createCustomIdeaTemplateImpl({
      ...data,
      category: data.category as IdeaCategory,
      pillar: data.pillar as ContentPillar,
      difficulty: data.difficulty as IdeaDifficulty,
      recommendedPlatforms: data.recommendedPlatforms as SocialPlatform[],
    });
  });

export const deleteCustomIdeaTemplateServerFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { deleteCustomIdeaTemplateImpl } = await import("./socials.server");
    return deleteCustomIdeaTemplateImpl(data);
  });

// ============================================================================
// 6. Release Campaign Auto-Generator
// ============================================================================

export const generateReleaseCampaignServerFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      catalogItemId: z.string().nullable().optional(),
      campaignType: z.enum(["single_release", "ep_rollout", "course_promo", "evergreen_growth"]),
      title: z.string().min(1),
      releaseDate: z.string(),
      notes: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { generateReleaseCampaignImpl } = await import("./socials.server");
    return generateReleaseCampaignImpl({
      ...data,
      campaignType: data.campaignType as CampaignType,
    });
  });

export const deleteCampaignServerFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string(), deletePosts: z.boolean().default(false) }))
  .handler(async ({ data }) => {
    const { deleteCampaignImpl } = await import("./socials.server");
    return deleteCampaignImpl(data);
  });

// ============================================================================
// 7. Hashtag Preset Management
// ============================================================================

export const createHashtagPresetServerFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1),
      platform: z.enum(["all", "instagram", "tiktok", "youtube_shorts"]).default("all"),
      tags: z.array(z.string()).min(1),
    }),
  )
  .handler(async ({ data }) => {
    const { createHashtagPresetImpl } = await import("./socials.server");
    return createHashtagPresetImpl(data);
  });

export const deleteHashtagPresetServerFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { deleteHashtagPresetImpl } = await import("./socials.server");
    return deleteHashtagPresetImpl(data);
  });
