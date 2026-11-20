import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type {
  CampaignType,
  ContentPillar,
  IdeaCategory,
  IdeaDifficulty,
  PerformanceRating,
  PlatformDeliveries,
  PostStatus,
  PublishablePlatform,
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
// 3. Producer Profile, Connected Social Accounts & Catalog Mutations
// ============================================================================

const updateProfileSchema = z.object({
  stageName: z.string().min(1),
  genre: z.string().min(1),
  tagline: z.string(),
  primaryLanguage: z.enum(["en", "fr", "bilingual"]),
  defaultBioLink: z.string(),
  weeklyPostTarget: z.number().int().min(1).max(21),
  targetPlatforms: z
    .array(z.enum(["instagram_reels", "tiktok", "youtube_shorts"]))
    .optional(),
  timezone: z.string().optional(),
  cadenceDays: z.array(z.number().int().min(0).max(6)).optional(),
  cadenceTime: z.string().optional(),
  avoidConsecutiveTrack: z.boolean().optional(),
  defaultEditPreset: z.enum(["subtle", "punchy", "hard"]).optional(),
  burnHookOverlay: z.boolean().optional(),
  audioHeadroomDb: z.number().min(-6).max(0).optional(),
  rawRetentionDays: z.number().int().min(1).max(90).optional(),
  renderedRetentionDays: z.number().int().min(7).max(3650).optional(),
  storageCapGb: z.number().int().min(1).max(500).optional(),
  geminiModel: z.string().optional(),
});

export const updateArtistProfileServerFn = createServerFn({ method: "POST" })
  .validator(updateProfileSchema)
  .handler(async ({ data }) => {
    const { updateArtistProfileImpl } = await import("./socials.server");
    return updateArtistProfileImpl({
      ...data,
      targetPlatforms: data.targetPlatforms as SocialPlatform[] | undefined,
    });
  });

export const createAutopilotDraftServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      catalogItemId: z.string().nullable().optional(),
      title: z.string().optional(),
      videoUrl: z.string().min(1),
      videoFileName: z.string().nullable().optional(),
      videoSizeBytes: z.number().int().nullable().optional(),
      caption: z.string().optional(),
      hashtags: z.array(z.string()).optional(),
      platforms: z.array(z.enum(["instagram_reels", "tiktok", "youtube_shorts"])).optional(),
      editMode: z.enum(["single_take", "multi_take", "manual"]).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { createAutopilotDraftImpl } = await import("./socials.server");
    return createAutopilotDraftImpl({
      ...data,
      platforms: data.platforms as PublishablePlatform[] | undefined,
    });
  });

export const approveReviewPostServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      postId: z.string(),
      scheduledFor: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { approveReviewPostImpl } = await import("./socials.server");
    return approveReviewPostImpl(data);
  });

export const updateReviewPostServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      postId: z.string(),
      title: z.string().optional(),
      caption: z.string().optional(),
      onScreenHook: z.string().optional(),
      hashtags: z.array(z.string()).optional(),
      platforms: z.array(z.enum(["instagram_reels", "tiktok", "youtube_shorts"])).optional(),
      catalogItemId: z.string().nullable().optional(),
      scheduledFor: z.string().nullable().optional(),
      reviewStatus: z.enum(["needs_review", "approved"]).optional(),
      autoPublish: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { updateReviewPostImpl } = await import("./socials.server");
    return updateReviewPostImpl({
      ...data,
      platforms: data.platforms as PublishablePlatform[] | undefined,
    });
  });

export const rebalanceAutopilotQueueServerFn = createServerFn({ method: "POST" }).handler(
  async () => {
    const { rebalanceAutopilotQueueImpl } = await import("./socials.server");
    return rebalanceAutopilotQueueImpl();
  },
);

export const retryFailedPublishServerFn = createServerFn({ method: "POST" })
  .validator(z.object({ postId: z.string() }))
  .handler(async ({ data }) => {
    const { retryFailedPublishImpl } = await import("./socials.server");
    return retryFailedPublishImpl(data);
  });

const rawClipInputSchema = z.object({
  storageKey: z.string().min(1),
  fileName: z.string().min(1),
  sizeBytes: z.number().int().min(0),
  durationSec: z.number().nullable().optional(),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
  fps: z.number().nullable().optional(),
});

export const createAutoEditPostServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      catalogItemId: z.string().min(1),
      rawClip: rawClipInputSchema.optional(),
      rawClips: z.array(rawClipInputSchema).min(1).max(6).optional(),
      preset: z.enum(["subtle", "punchy", "hard"]).optional(),
      platforms: z.array(z.enum(["instagram_reels", "tiktok", "youtube_shorts"])).optional(),
      burnHookOverlay: z.boolean().optional(),
      hookOverlayText: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { createAutoEditPostImpl } = await import("./socials.server");
    return createAutoEditPostImpl({
      ...data,
      platforms: data.platforms as PublishablePlatform[] | undefined,
    });
  });

export const rerenderPostServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      postId: z.string().min(1),
      preset: z.enum(["subtle", "punchy", "hard"]).optional(),
      overrideOffsetSec: z.number().optional(),
      overrideMasterStartSec: z.number().optional(),
      overrideDurationSec: z.number().min(3).max(45).optional(),
      audioHeadroomDb: z.number().min(-6).max(0).optional(),
      burnHookOverlay: z.boolean().optional(),
      hookOverlayText: z.string().optional(),
      forceResync: z.boolean().optional(),
      variationSeed: z.number().int().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { rerenderPostImpl } = await import("./socials.server");
    return rerenderPostImpl(data);
  });

export const rerollPostCopyServerFn = createServerFn({ method: "POST" })
  .validator(z.object({ postId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { rerollPostCopyImpl } = await import("./socials.server");
    return rerollPostCopyImpl(data);
  });

export const rerollPostEditServerFn = createServerFn({ method: "POST" })
  .validator(z.object({ postId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { rerollPostEditImpl } = await import("./socials.server");
    return rerollPostEditImpl(data);
  });

export const runMediaCleanupNowServerFn = createServerFn({ method: "POST" }).handler(async () => {
  const { runMediaCleanupNowImpl } = await import("./socials.server");
  return runMediaCleanupNowImpl();
});

const upsertSocialConnectionSchema = z.object({
  platform: z.enum(["instagram_reels", "tiktok", "youtube_shorts"]),
  accountName: z.string().min(1),
  externalAccountId: z.string().min(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  metadata: z
    .object({
      tiktokPostMode: z.enum(["inbox", "direct"]).optional(),
      tiktokPrivacyLevel: z
        .enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"])
        .optional(),
      youtubePrivacy: z.enum(["public", "unlisted", "private"]).optional(),
      igPageId: z.string().optional(),
    })
    .optional(),
});

export const upsertSocialConnectionServerFn = createServerFn({ method: "POST" })
  .validator(upsertSocialConnectionSchema)
  .handler(async ({ data }) => {
    const { upsertSocialConnectionImpl } = await import("./socials.server");
    return upsertSocialConnectionImpl({
      ...data,
      platform: data.platform as PublishablePlatform,
    });
  });

export const disconnectSocialAccountServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      platform: z.enum(["instagram_reels", "tiktok", "youtube_shorts"]),
    }),
  )
  .handler(async ({ data }) => {
    const { disconnectSocialAccountImpl } = await import("./socials.server");
    return disconnectSocialAccountImpl({
      platform: data.platform as PublishablePlatform,
    });
  });

export const testSocialConnectionServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      platform: z.enum(["instagram_reels", "tiktok", "youtube_shorts"]),
    }),
  )
  .handler(async ({ data }) => {
    const { testSocialConnectionImpl } = await import("./socials.server");
    return testSocialConnectionImpl({
      platform: data.platform as PublishablePlatform,
    });
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
  masterAudioPath: z.string().optional(),
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
  .validator(upsertCatalogItemSchema)
  .handler(async ({ data }) => {
    const { upsertCatalogItemImpl } = await import("./socials.server");
    return upsertCatalogItemImpl(data);
  });

export const analyzeCatalogTrackServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      catalogItemId: z.string(),
      runImmediately: z.boolean().default(true),
    }),
  )
  .handler(async ({ data }) => {
    const { analyzeCatalogTrackImpl } = await import("./socials.server");
    return analyzeCatalogTrackImpl(data);
  });

export const analyzeAllCatalogTracksServerFn = createServerFn({ method: "POST" })
  .validator(
    z
      .object({
        forceReanalyze: z.boolean().optional(),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const { analyzeAllCatalogTracksImpl } = await import("./socials.server");
    return analyzeAllCatalogTracksImpl(data);
  });

export const updateTrackAudioMetadataServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      catalogItemId: z.string().min(1),
      bpm: z.number().int().min(60).max(350).optional(),
      bpmLocked: z.boolean().optional(),
      addMarker: z
        .object({
          kind: z.enum(["drop", "highlight", "kick_switch", "kickroll"]),
          dropImpactSec: z.number().min(0).max(3600),
          label: z.string().max(48).optional(),
        })
        .optional(),
      removeMarkerIndex: z.number().int().min(0).optional(),
      removeMarkerId: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { updateTrackAudioMetadataImpl } = await import("./socials.server");
    return updateTrackAudioMetadataImpl(data);
  });

export const getBackgroundJobsServerFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getBackgroundJobsImpl } = await import("./socials.server");
  return getBackgroundJobsImpl();
});

export const deleteCatalogItemServerFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { deleteCatalogItemImpl } = await import("./socials.server");
    return deleteCatalogItemImpl(data);
  });

// ============================================================================
// 4. Social Post CRUD, Auto-Scheduling & Direct Publishing
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
  videoUrl: z.string().nullable().optional(),
  videoFileName: z.string().nullable().optional(),
  videoSizeBytes: z.number().int().nullable().optional(),
  autoPublish: z.boolean().default(false),
  platformDeliveries: z.record(z.string(), z.any()).optional(),
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
  .validator(upsertSocialPostSchema)
  .handler(async ({ data }) => {
    const { upsertSocialPostImpl } = await import("./socials.server");
    return upsertSocialPostImpl({
      ...data,
      status: data.status as PostStatus,
      platforms: data.platforms as SocialPlatform[],
      pillar: data.pillar as ContentPillar,
      platformDeliveries: data.platformDeliveries as PlatformDeliveries | undefined,
      performanceRating: (data.performanceRating as PerformanceRating | null) ?? null,
    });
  });

export const publishPostNowServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      postId: z.string(),
      platforms: z
        .array(z.enum(["instagram_reels", "tiktok", "youtube_shorts"]))
        .optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { publishPostNowImpl } = await import("./socials.server");
    return publishPostNowImpl({
      postId: data.postId,
      platforms: data.platforms as PublishablePlatform[] | undefined,
    });
  });

export const updatePostStatusServerFn = createServerFn({ method: "POST" })
  .validator(
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
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { deleteSocialPostImpl } = await import("./socials.server");
    return deleteSocialPostImpl(data);
  });

// ============================================================================
// 5. Idea Vault Instantiation & Custom Producer Templates
// ============================================================================

export const instantiateIdeaTemplateServerFn = createServerFn({ method: "POST" })
  .validator(
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
  .validator(
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
      defaultCtaEn: z.string().default(""),
      defaultCtaFr: z.string().default(""),
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
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { deleteCustomIdeaTemplateImpl } = await import("./socials.server");
    return deleteCustomIdeaTemplateImpl(data);
  });

// ============================================================================
// 6. Release Campaign Auto-Generator
// ============================================================================

export const generateReleaseCampaignServerFn = createServerFn({ method: "POST" })
  .validator(
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
  .validator(z.object({ id: z.string(), deletePosts: z.boolean().default(false) }))
  .handler(async ({ data }) => {
    const { deleteCampaignImpl } = await import("./socials.server");
    return deleteCampaignImpl(data);
  });

// ============================================================================
// 7. Hashtag Preset Management
// ============================================================================

export const createHashtagPresetServerFn = createServerFn({ method: "POST" })
  .validator(
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
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { deleteHashtagPresetImpl } = await import("./socials.server");
    return deleteHashtagPresetImpl(data);
  });
