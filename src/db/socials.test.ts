import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { CAMPAIGN_ROLLOUT_BLUEPRINTS } from "#/lib/social-blueprints";
import { ensureArtistProfile } from "#/server/socials.server";
import { db, ensureSchemaInitialized } from "./index";
import {
  artistCatalogItems,
  artistProfiles,
  hashtagPresets,
  ideaTemplates,
  socialPosts,
  user,
} from "./schema";

describe("Social Growth Studio — Clean Database & Multi-Producer Workspace", () => {
  it("initializes Postgres schema with zero seeded posts, templates, catalog items, or presets", async () => {
    await ensureSchemaInitialized();

    const testUserId = `test-producer-${Date.now()}`;
    await db.insert(user).values({
      id: testUserId,
      name: "LIL SBD",
      email: `${testUserId}@lilsbd.com`,
      emailVerified: true,
    });

    await ensureArtistProfile(testUserId, "LIL SBD");

    const profiles = await db
      .select()
      .from(artistProfiles)
      .where(eq(artistProfiles.userId, testUserId));
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.stageName).toBe("LIL SBD");

    const catalog = await db
      .select()
      .from(artistCatalogItems)
      .where(eq(artistCatalogItems.userId, testUserId));
    expect(catalog).toHaveLength(0);

    const posts = await db
      .select()
      .from(socialPosts)
      .where(eq(socialPosts.userId, testUserId));
    expect(posts).toHaveLength(0);

    const userTemplates = await db
      .select()
      .from(ideaTemplates)
      .where(eq(ideaTemplates.userId, testUserId));
    expect(userTemplates).toHaveLength(0);

    const userPresets = await db
      .select()
      .from(hashtagPresets)
      .where(eq(hashtagPresets.userId, testUserId));
    expect(userPresets).toHaveLength(0);

    expect(CAMPAIGN_ROLLOUT_BLUEPRINTS.single_release.steps.length).toBe(8);
  });
});
