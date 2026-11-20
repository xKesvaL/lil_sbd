import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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

// ============================================================================
// 3. Producer Profile & Multi-Tenant Catalog
// ============================================================================

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
    .default(["instagram_reels", "tiktok", "youtube_shorts", "instagram_carousel", "instagram_story"]),
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
// 5. Social Posts (Kanban Pipeline, Calendar, Publishing Copilot & Analytics)
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

  // Creative & Filming Execution
  onScreenHookEn: text("on_screen_hook_en").notNull().default(""),
  onScreenHookFr: text("on_screen_hook_fr").notNull().default(""),
  hookVariantsEn: jsonb("hook_variants_en").$type<HookVariants>().notNull().default({}),
  hookVariantsFr: jsonb("hook_variants_fr").$type<HookVariants>().notNull().default({}),
  shotList: jsonb("shot_list").$type<ShotListItem[]>().notNull().default([]),
  audioTimestamp: text("audio_timestamp").default("0:42 - 0:58 (Main Drop)"),

  // Publishing Copilot Copy
  captionEn: text("caption_en").notNull().default(""),
  captionFr: text("caption_fr").notNull().default(""),
  ctaEn: text("cta_en").notNull().default("Link in bio for the full track & free HDM course."),
  ctaFr: text("cta_fr").notNull().default("Lien en bio pour le son complet et le cours HDM gratuit."),
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

export type ArtistProfileRecord = typeof artistProfiles.$inferSelect;
export type ArtistCatalogItemRecord = typeof artistCatalogItems.$inferSelect;
export type ReleaseCampaignRecord = typeof releaseCampaigns.$inferSelect;
export type IdeaTemplateRecord = typeof ideaTemplates.$inferSelect;
export type SocialPostRecord = typeof socialPosts.$inferSelect;
export type HashtagPresetRecord = typeof hashtagPresets.$inferSelect;
