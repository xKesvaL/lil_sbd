import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DrizzleDb = ReturnType<typeof drizzlePostgres<typeof schema>>;

const globalForDb = globalThis as unknown as {
  __lilSbdDb?: DrizzleDb;
  __lilSbdSchemaInitPromise?: Promise<void>;
};

function hasRemoteDatabaseUrl(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return false;
  if (url === "postgresql://user:password@localhost:5432/lil_sbd") return false;
  return true;
}

function createDatabaseConnection(): DrizzleDb {
  // Always isolate Vitest runs in memory so tests never touch remote/dev Postgres or lock .data/pglite
  if (process.env.VITEST && process.env.TEST_USE_REMOTE_DB !== "true") {
    const pglite = new PGlite();
    return drizzlePglite(pglite, { schema }) as unknown as DrizzleDb;
  }

  if (hasRemoteDatabaseUrl()) {
    const client = postgres(process.env.DATABASE_URL!, {
      prepare: false,
      max: 10,
    });
    return drizzlePostgres(client, { schema });
  }

  const dataDir = process.env.SOCIAL_DATA_DIR?.trim() || ".data";
  const pgliteDir = join(dataDir, "pglite");
  mkdirSync(pgliteDir, { recursive: true });
  const pglite = new PGlite(pgliteDir);
  return drizzlePglite(pglite, { schema }) as unknown as DrizzleDb;
}

export const db: DrizzleDb = globalForDb.__lilSbdDb ?? createDatabaseConnection();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__lilSbdDb = db;
}

const BOOTSTRAP_DDL = `
CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "email_verified" boolean DEFAULT false NOT NULL,
  "image" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" timestamp NOT NULL,
  "token" text NOT NULL UNIQUE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamp,
  "refresh_token_expires_at" timestamp,
  "scope" text,
  "password" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "artist_profiles" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL UNIQUE REFERENCES "user"("id") ON DELETE CASCADE,
  "stage_name" text DEFAULT 'LIL SBD' NOT NULL,
  "genre" text DEFAULT 'Uptempo Hardcore / Hard Dance' NOT NULL,
  "tagline" text DEFAULT 'Zaag-driven uptempo hardcore that still feels like music.' NOT NULL,
  "primary_language" text DEFAULT 'bilingual' NOT NULL,
  "default_bio_link" text DEFAULT 'https://lilsbd.com' NOT NULL,
  "weekly_post_target" integer DEFAULT 5 NOT NULL,
  "target_platforms" jsonb DEFAULT '["instagram_reels","tiktok","youtube_shorts","instagram_carousel","instagram_story"]'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "artist_catalog_items" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "type" text DEFAULT 'track' NOT NULL,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "album_or_chapter" text,
  "release_date" timestamp NOT NULL,
  "artwork_url" text,
  "audio_preview_url" text,
  "bpm" integer DEFAULT 200,
  "key_signature" text DEFAULT 'F Minor',
  "genre_tag" text DEFAULT 'Uptempo Hardcore',
  "description" text,
  "streaming_links" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "hook_timestamps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "release_campaigns" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "catalog_item_id" text REFERENCES "artist_catalog_items"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "campaign_type" text DEFAULT 'single_release' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "start_date" timestamp NOT NULL,
  "release_date" timestamp NOT NULL,
  "end_date" timestamp NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "idea_templates" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text REFERENCES "user"("id") ON DELETE CASCADE,
  "is_system" boolean DEFAULT false NOT NULL,
  "category" text NOT NULL,
  "pillar" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "difficulty" text DEFAULT 'daw_capture' NOT NULL,
  "recommended_platforms" jsonb DEFAULT '["instagram_reels","tiktok","youtube_shorts"]'::jsonb NOT NULL,
  "hook_formula_en" text NOT NULL,
  "hook_formula_fr" text NOT NULL,
  "hook_variants_en" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "hook_variants_fr" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "caption_template_en" text NOT NULL,
  "caption_template_fr" text NOT NULL,
  "default_cta_en" text NOT NULL,
  "default_cta_fr" text NOT NULL,
  "default_shot_list" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "suggested_hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "why_it_works" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "social_connections" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "platform" text NOT NULL,
  "account_name" text NOT NULL,
  "external_account_id" text NOT NULL,
  "access_token" text NOT NULL,
  "refresh_token" text,
  "token_expires_at" timestamp,
  "scopes" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "social_posts" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "campaign_id" text REFERENCES "release_campaigns"("id") ON DELETE SET NULL,
  "catalog_item_id" text REFERENCES "artist_catalog_items"("id") ON DELETE SET NULL,
  "template_id" text REFERENCES "idea_templates"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "status" text DEFAULT 'idea' NOT NULL,
  "platforms" jsonb DEFAULT '["instagram_reels","tiktok","youtube_shorts"]'::jsonb NOT NULL,
  "pillar" text DEFAULT 'drop_showcase' NOT NULL,
  "scheduled_for" timestamp,
  "posted_at" timestamp,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "video_url" text,
  "video_file_name" text,
  "video_size_bytes" integer,
  "auto_publish" boolean DEFAULT false NOT NULL,
  "platform_deliveries" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "on_screen_hook_en" text DEFAULT '' NOT NULL,
  "on_screen_hook_fr" text DEFAULT '' NOT NULL,
  "hook_variants_en" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "hook_variants_fr" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "shot_list" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "audio_timestamp" text DEFAULT '0:42 - 0:58 (Main Drop)',
  "caption_en" text DEFAULT '' NOT NULL,
  "caption_fr" text DEFAULT '' NOT NULL,
  "cta_en" text DEFAULT '' NOT NULL,
  "cta_fr" text DEFAULT '' NOT NULL,
  "hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "pre_flight_checklist" jsonb DEFAULT '{"highResExport":false,"coverFrameSelected":false,"audioSynced":false,"linkInBioUpdated":false}'::jsonb NOT NULL,
  "published_url" text,
  "views" integer DEFAULT 0 NOT NULL,
  "likes" integer DEFAULT 0 NOT NULL,
  "saves" integer DEFAULT 0 NOT NULL,
  "shares" integer DEFAULT 0 NOT NULL,
  "comments" integer DEFAULT 0 NOT NULL,
  "performance_rating" text,
  "retrospective_notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "social_posts" ADD COLUMN IF NOT EXISTS "video_url" text;
ALTER TABLE "social_posts" ADD COLUMN IF NOT EXISTS "video_file_name" text;
ALTER TABLE "social_posts" ADD COLUMN IF NOT EXISTS "video_size_bytes" integer;
ALTER TABLE "social_posts" ADD COLUMN IF NOT EXISTS "thumbnail_url" text;
ALTER TABLE "social_posts" ADD COLUMN IF NOT EXISTS "edit_mode" text DEFAULT 'manual' NOT NULL;
ALTER TABLE "social_posts" ADD COLUMN IF NOT EXISTS "review_status" text DEFAULT 'approved' NOT NULL;
ALTER TABLE "social_posts" ADD COLUMN IF NOT EXISTS "edit_recipe" jsonb;
ALTER TABLE "social_posts" ADD COLUMN IF NOT EXISTS "raw_cleaned_at" timestamp;
ALTER TABLE "social_posts" ADD COLUMN IF NOT EXISTS "auto_publish" boolean DEFAULT false NOT NULL;
ALTER TABLE "social_posts" ADD COLUMN IF NOT EXISTS "platform_deliveries" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "artist_profiles" ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'Europe/Paris' NOT NULL;
ALTER TABLE "artist_profiles" ADD COLUMN IF NOT EXISTS "cadence_days" jsonb DEFAULT '[1,3,5,0]'::jsonb NOT NULL;
ALTER TABLE "artist_profiles" ADD COLUMN IF NOT EXISTS "cadence_time" text DEFAULT '18:00' NOT NULL;
ALTER TABLE "artist_profiles" ADD COLUMN IF NOT EXISTS "avoid_consecutive_track" boolean DEFAULT true NOT NULL;
ALTER TABLE "artist_profiles" ADD COLUMN IF NOT EXISTS "default_edit_preset" text DEFAULT 'punchy' NOT NULL;
ALTER TABLE "artist_profiles" ADD COLUMN IF NOT EXISTS "burn_hook_overlay" boolean DEFAULT false NOT NULL;
ALTER TABLE "artist_profiles" ADD COLUMN IF NOT EXISTS "audio_headroom_db" double precision DEFAULT -1.5 NOT NULL;
ALTER TABLE "artist_profiles" ADD COLUMN IF NOT EXISTS "raw_retention_days" integer DEFAULT 7 NOT NULL;
ALTER TABLE "artist_profiles" ADD COLUMN IF NOT EXISTS "rendered_retention_days" integer DEFAULT 90 NOT NULL;
ALTER TABLE "artist_profiles" ADD COLUMN IF NOT EXISTS "storage_cap_gb" integer DEFAULT 8 NOT NULL;
ALTER TABLE "artist_profiles" ADD COLUMN IF NOT EXISTS "gemini_model" text DEFAULT '' NOT NULL;

ALTER TABLE "artist_catalog_items" ADD COLUMN IF NOT EXISTS "master_audio_path" text;
ALTER TABLE "artist_catalog_items" ADD COLUMN IF NOT EXISTS "audio_analysis" jsonb;

CREATE TABLE IF NOT EXISTS "social_raw_clips" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "post_id" text NOT NULL REFERENCES "social_posts"("id") ON DELETE CASCADE,
  "storage_key" text NOT NULL,
  "file_name" text NOT NULL,
  "size_bytes" integer DEFAULT 0 NOT NULL,
  "duration_sec" double precision,
  "width" integer,
  "height" integer,
  "fps" double precision,
  "detected_offset_sec" double precision,
  "sync_confidence" double precision,
  "order_index" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "background_jobs" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "post_id" text REFERENCES "social_posts"("id") ON DELETE CASCADE,
  "catalog_item_id" text REFERENCES "artist_catalog_items"("id") ON DELETE CASCADE,
  "job_type" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "progress" integer DEFAULT 0 NOT NULL,
  "stage_label" text DEFAULT 'Queued' NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "result" jsonb,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "run_after" timestamp DEFAULT now() NOT NULL,
  "locked_at" timestamp,
  "started_at" timestamp,
  "completed_at" timestamp,
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "background_jobs_status_run_after_idx" ON "background_jobs" ("status", "run_after");
CREATE INDEX IF NOT EXISTS "social_raw_clips_post_id_idx" ON "social_raw_clips" ("post_id");

CREATE TABLE IF NOT EXISTS "hashtag_presets" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text REFERENCES "user"("id") ON DELETE CASCADE,
  "is_system" boolean DEFAULT false NOT NULL,
  "name" text NOT NULL,
  "platform" text DEFAULT 'all' NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DELETE FROM "social_posts" WHERE "id" LIKE 'post-starter-%';
DELETE FROM "idea_templates" WHERE "is_system" = true OR "id" LIKE 'sys-idea-%';
DELETE FROM "hashtag_presets" WHERE "is_system" = true OR "id" LIKE 'sys-tags-%';
DELETE FROM "artist_catalog_items" WHERE "id" LIKE 'cat-%-course-%';
DELETE FROM "artist_catalog_items" WHERE "id" LIKE 'cat-%' AND "id" NOT LIKE 'cat-sync-%' AND "id" !~ '^cat-.*-[0-9]{13}$';
`;

export async function ensureSchemaInitialized(): Promise<void> {
  if (!globalForDb.__lilSbdSchemaInitPromise) {
    globalForDb.__lilSbdSchemaInitPromise = (async () => {
      const statements = BOOTSTRAP_DDL.split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const stmt of statements) {
        await db.execute(sql.raw(stmt));
      }
    })();
  }
  return globalForDb.__lilSbdSchemaInitPromise;
}

export function getDatabaseMode(): "remote_postgres" | "local_pglite" {
  return hasRemoteDatabaseUrl() ? "remote_postgres" : "local_pglite";
}
