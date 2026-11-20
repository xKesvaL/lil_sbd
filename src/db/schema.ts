import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// ============================================================================
// 1. Better Auth Core Tables (Multi-User / Multi-Producer Ready)
// ============================================================================

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================================
// 2. Domain Types for Social Growth Studio
// ============================================================================

export type SocialPlatform =
  | "instagram_reels"
  | "instagram_carousel"
  | "instagram_story"
  | "tiktok"
  | "youtube_shorts";

export type PostStatus = "idea" | "filming" | "editing" | "ready" | "posted";

export type ContentPillar =
  | "drop_showcase"
  | "sound_design_tutorial"
  | "behind_the_scenes"
  | "meme_relatable"
  | "course_funnel"
  | "release_promo";

export type CatalogItemType = "track" | "ep" | "course_lesson" | "lead_magnet";

export type CampaignType = "single_release" | "ep_rollout" | "course_promo" | "evergreen_growth";

export type IdeaCategory =
  | "kick_sound_design"
  | "drop_reaction"
  | "gym_hard_edit"
  | "producer_hot_take"
  | "course_teaser"
  | "release_story";

export type IdeaDifficulty = "quick_5min" | "daw_capture" | "high_effort";

export type PerformanceRating = "viral" | "above_average" | "average" | "underperformed";

export interface HookTimestamp {
  label: string;
  startSec: number;
  endSec: number;
}

export interface StreamingLinks {
  spotify?: string;
  soundcloud?: string;
  youtubeMusic?: string;
  appleMusic?: string;
  courseUrl?: string;
  customUrl?: string;
}

export interface ShotListItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface PreFlightChecklist {
  highResExport: boolean;
  coverFrameSelected: boolean;
  audioSynced: boolean;
  linkInBioUpdated: boolean;
}

export interface HookVariants {
  curiosity?: string;
  contrarian?: string;
  tutorial?: string;
  pov?: string;
  showcase?: string;
}

export type PublishablePlatform = "instagram_reels" | "tiktok" | "youtube_shorts";

export type DeliveryStatus =
  | "idle"
  | "scheduled"
  | "publishing"
  | "published"
  | "inbox_ready"
  | "failed";

export interface PlatformDeliveryState {
  status: DeliveryStatus;
  externalPostId?: string;
  externalUrl?: string;
  error?: string;
  updatedAt?: string;
}

export type PlatformDeliveries = Partial<Record<SocialPlatform, PlatformDeliveryState>>;

export interface SocialConnectionMetadata {
  tiktokPostMode?: "inbox" | "direct";
  tiktokPrivacyLevel?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
  youtubePrivacy?: "public" | "unlisted" | "private";
  igPageId?: string;
}

export type EditMode = "single_take" | "multi_take" | "manual";

export type ReviewStatus = "processing" | "needs_review" | "approved" | "published" | "failed";

export type EditPreset = "subtle" | "punchy" | "hard";

export type BackgroundJobType =
  | "analyze_track"
  | "sync_and_direct"
  | "render_video"
  | "publish_post"
  | "cleanup_media";

export type BackgroundJobStatus = "queued" | "running" | "succeeded" | "failed";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonRecord = { [key: string]: JsonValue };

export type TrackSectionKind = "drop" | "highlight" | "kick_switch" | "kickroll";

export interface TrackDropSection {
  id?: string;
  kind?: TrackSectionKind;
  label: string;
  startSec: number;
  endSec: number;
  dropImpactSec: number;
  peakEnergy: number;
  bpm?: number;
  isManual?: boolean;
}

export interface TrackAudioAnalysis {
  version: number;
  durationSec: number;
  sampleRate: number;
  bpm: number;
  bpmRange?: [number, number];
  bpmLocked?: boolean;
  beatConfidence: number;
  firstBeatSec: number;
  beatsSec: number[];
  barsSec: number[];
  drops: TrackDropSection[];
  energyEnvelope: number[];
  envelopeStepSec: number;
  analyzedAt: string;
}

export interface EditRecipeSegment {
  clipId: string;
  sourceStartSec: number;
  sourceEndSec: number;
  masterStartSec: number;
}

export interface EditRecipeFxEvent {
  timeSec: number;
  type: "punch_zoom" | "micro_shake" | "drop_flash";
  intensity: number;
}

export interface PostEditRecipe {
  mode: EditMode;
  preset: EditPreset;
  masterStartSec: number;
  masterEndSec: number;
  audioHeadroomDb: number;
  burnHookOverlay: boolean;
  hookOverlayText?: string;
  segments: EditRecipeSegment[];
  fxEvents: EditRecipeFxEvent[];
  aiDirector?: {
    source: "gemini" | "deterministic_fallback";
    model?: string;
    sceneSummary?: string;
    directorNotes?: string;
    fallbackReason?: string;
    directedAt: string;
  };
}

// ============================================================================
// 3. Producer Profile, Connected Accounts & Multi-Tenant Catalog
// ============================================================================

export const socialConnections = pgTable("social_connections", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  platform: text("platform").$type<PublishablePlatform>().notNull(),
  accountName: text("account_name").notNull(),
  externalAccountId: text("external_account_id").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  scopes: text("scopes"),
  metadata: jsonb("metadata").$type<SocialConnectionMetadata>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const artistProfiles = pgTable("artist_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  stageName: text("stage_name").notNull().default("LIL SBD"),
  genre: text("genre").notNull().default("Uptempo Hardcore / Hard Dance"),
  tagline: text("tagline").notNull().default("Zaag-driven uptempo hardcore that still feels like music."),
  primaryLanguage: text("primary_language").notNull().default("bilingual"), // "en" | "fr" | "bilingual"
  defaultBioLink: text("default_bio_link").notNull().default("https://lilsbd.com"),
  weeklyPostTarget: integer("weekly_post_target").notNull().default(5),
  targetPlatforms: jsonb("target_platforms")
    .$type<SocialPlatform[]>()
    .notNull()
    .default(["instagram_reels", "tiktok", "youtube_shorts"]),
  // Autopilot Cadence, Audio/Edit Defaults & Storage Retention
  timezone: text("timezone").notNull().default("Europe/Paris"),
  cadenceDays: jsonb("cadence_days").$type<number[]>().notNull().default([1, 3, 5, 0]),
  cadenceTime: text("cadence_time").notNull().default("18:00"),
  avoidConsecutiveTrack: boolean("avoid_consecutive_track").notNull().default(true),
  defaultEditPreset: text("default_edit_preset").$type<EditPreset>().notNull().default("punchy"),
  burnHookOverlay: boolean("burn_hook_overlay").notNull().default(false),
  audioHeadroomDb: doublePrecision("audio_headroom_db").notNull().default(-1.5),
  rawRetentionDays: integer("raw_retention_days").notNull().default(7),
  renderedRetentionDays: integer("rendered_retention_days").notNull().default(90),
  storageCapGb: integer("storage_cap_gb").notNull().default(8),
  geminiModel: text("gemini_model").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const artistCatalogItems = pgTable("artist_catalog_items", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  type: text("type").$type<CatalogItemType>().notNull().default("track"),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  albumOrChapter: text("album_or_chapter"),
  releaseDate: timestamp("release_date").notNull(),
  artworkUrl: text("artwork_url"),
  audioPreviewUrl: text("audio_preview_url"),
  masterAudioPath: text("master_audio_path"),
  audioAnalysis: jsonb("audio_analysis").$type<TrackAudioAnalysis | null>(),
  bpm: integer("bpm").default(200),
  keySignature: text("key_signature").default("F Minor"),
  genreTag: text("genre_tag").default("Uptempo Hardcore"),
  description: text("description"),
  streamingLinks: jsonb("streaming_links").$type<StreamingLinks>().notNull().default({}),
  hookTimestamps: jsonb("hook_timestamps").$type<HookTimestamp[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================================
// 4. Release Campaigns & Idea Vault Templates
// ============================================================================

export const releaseCampaigns = pgTable("release_campaigns", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  catalogItemId: text("catalog_item_id").references(() => artistCatalogItems.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  campaignType: text("campaign_type").$type<CampaignType>().notNull().default("single_release"),
  status: text("status")
    .$type<"planning" | "active" | "completed">()
    .notNull()
    .default("active"),
  startDate: timestamp("start_date").notNull(),
  releaseDate: timestamp("release_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const ideaTemplates = pgTable("idea_templates", {
  id: text("id").primaryKey(),
  // null userId = global system template available to all producers; non-null = user's private template
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  isSystem: boolean("is_system").notNull().default(false),
  category: text("category").$type<IdeaCategory>().notNull(),
  pillar: text("pillar").$type<ContentPillar>().notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  difficulty: text("difficulty").$type<IdeaDifficulty>().notNull().default("daw_capture"),
  recommendedPlatforms: jsonb("recommended_platforms")
    .$type<SocialPlatform[]>()
    .notNull()
    .default(["instagram_reels", "tiktok", "youtube_shorts"]),
  hookFormulaEn: text("hook_formula_en").notNull(),
  hookFormulaFr: text("hook_formula_fr").notNull(),
  hookVariantsEn: jsonb("hook_variants_en").$type<HookVariants>().notNull().default({}),
  hookVariantsFr: jsonb("hook_variants_fr").$type<HookVariants>().notNull().default({}),
  captionTemplateEn: text("caption_template_en").notNull(),
  captionTemplateFr: text("caption_template_fr").notNull(),
  defaultCtaEn: text("default_cta_en").notNull(),
  defaultCtaFr: text("default_cta_fr").notNull(),
  defaultShotList: jsonb("default_shot_list").$type<string[]>().notNull().default([]),
  suggestedHashtags: jsonb("suggested_hashtags").$type<string[]>().notNull().default([]),
  whyItWorks: text("why_it_works").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================================
// 5. Social Posts (Pipeline, Calendar, Direct Auto-Publish & Analytics)
// ============================================================================

export const socialPosts = pgTable("social_posts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").references(() => releaseCampaigns.id, {
    onDelete: "set null",
  }),
  catalogItemId: text("catalog_item_id").references(() => artistCatalogItems.id, {
    onDelete: "set null",
  }),
  templateId: text("template_id").references(() => ideaTemplates.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  status: text("status").$type<PostStatus>().notNull().default("idea"),
  platforms: jsonb("platforms")
    .$type<SocialPlatform[]>()
    .notNull()
    .default(["instagram_reels", "tiktok", "youtube_shorts"]),
  pillar: text("pillar").$type<ContentPillar>().notNull().default("drop_showcase"),
  scheduledFor: timestamp("scheduled_for"),
  postedAt: timestamp("posted_at"),
  sortOrder: integer("sort_order").notNull().default(0),

  // Video Asset & Direct Scheduling
  videoUrl: text("video_url"),
  videoFileName: text("video_file_name"),
  videoSizeBytes: integer("video_size_bytes"),
  thumbnailUrl: text("thumbnail_url"),
  editMode: text("edit_mode").$type<EditMode>().notNull().default("manual"),
  reviewStatus: text("review_status").$type<ReviewStatus>().notNull().default("approved"),
  editRecipe: jsonb("edit_recipe").$type<PostEditRecipe | null>(),
  rawCleanedAt: timestamp("raw_cleaned_at"),
  autoPublish: boolean("auto_publish").notNull().default(false),
  platformDeliveries: jsonb("platform_deliveries")
    .$type<PlatformDeliveries>()
    .notNull()
    .default({}),

  // Creative & Filming Execution
  onScreenHookEn: text("on_screen_hook_en").notNull().default(""),
  onScreenHookFr: text("on_screen_hook_fr").notNull().default(""),
  hookVariantsEn: jsonb("hook_variants_en").$type<HookVariants>().notNull().default({}),
  hookVariantsFr: jsonb("hook_variants_fr").$type<HookVariants>().notNull().default({}),
  shotList: jsonb("shot_list").$type<ShotListItem[]>().notNull().default([]),
  audioTimestamp: text("audio_timestamp").default("0:42 - 0:58 (Main Drop)"),

  // Publishing Copy
  captionEn: text("caption_en").notNull().default(""),
  captionFr: text("caption_fr").notNull().default(""),
  ctaEn: text("cta_en").notNull().default(""),
  ctaFr: text("cta_fr").notNull().default(""),
  hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
  preFlightChecklist: jsonb("pre_flight_checklist")
    .$type<PreFlightChecklist>()
    .notNull()
    .default({
      highResExport: false,
      coverFrameSelected: false,
      audioSynced: false,
      linkInBioUpdated: false,
    }),

  // Post-Publishing Performance Log
  publishedUrl: text("published_url"),
  views: integer("views").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  saves: integer("saves").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  performanceRating: text("performance_rating").$type<PerformanceRating>(),
  retrospectiveNotes: text("retrospective_notes"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================================
// 6. Hashtag Presets
// ============================================================================

export const hashtagPresets = pgTable("hashtag_presets", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  isSystem: boolean("is_system").notNull().default(false),
  name: text("name").notNull(),
  platform: text("platform")
    .$type<"all" | "instagram" | "tiktok" | "youtube_shorts">()
    .notNull()
    .default("all"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================================
// 7. Raw Uploaded Clips & Persistent Background Job Queue
// ============================================================================

export const socialRawClips = pgTable("social_raw_clips", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  postId: text("post_id")
    .notNull()
    .references(() => socialPosts.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  fileName: text("file_name").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  durationSec: doublePrecision("duration_sec"),
  width: integer("width"),
  height: integer("height"),
  fps: doublePrecision("fps"),
  detectedOffsetSec: doublePrecision("detected_offset_sec"),
  syncConfidence: doublePrecision("sync_confidence"),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const backgroundJobs = pgTable("background_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  postId: text("post_id").references(() => socialPosts.id, { onDelete: "cascade" }),
  catalogItemId: text("catalog_item_id").references(() => artistCatalogItems.id, {
    onDelete: "cascade",
  }),
  jobType: text("job_type").$type<BackgroundJobType>().notNull(),
  status: text("status").$type<BackgroundJobStatus>().notNull().default("queued"),
  progress: integer("progress").notNull().default(0),
  stageLabel: text("stage_label").notNull().default("Queued"),
  payload: jsonb("payload").$type<JsonRecord>().notNull().default({}),
  result: jsonb("result").$type<JsonRecord | null>(),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  runAfter: timestamp("run_after").notNull().defaultNow(),
  lockedAt: timestamp("locked_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ArtistProfileRecord = typeof artistProfiles.$inferSelect;
export type SocialConnectionRecord = typeof socialConnections.$inferSelect;
export type ArtistCatalogItemRecord = typeof artistCatalogItems.$inferSelect;
export type ReleaseCampaignRecord = typeof releaseCampaigns.$inferSelect;
export type IdeaTemplateRecord = typeof ideaTemplates.$inferSelect;
export type SocialPostRecord = typeof socialPosts.$inferSelect;
export type HashtagPresetRecord = typeof hashtagPresets.$inferSelect;
export type SocialRawClipRecord = typeof socialRawClips.$inferSelect;
export type BackgroundJobRecord = typeof backgroundJobs.$inferSelect;

