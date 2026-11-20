// @vitest-environment node
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { CAMPAIGN_ROLLOUT_BLUEPRINTS } from "#/lib/social-blueprints";
import {
  assemblePostCaption,
  publishSocialPostToPlatforms,
} from "#/server/social-publisher.server";
import { ensureArtistProfile } from "#/server/socials.server";
import { db, ensureSchemaInitialized } from "./index";
import {
  artistCatalogItems,
  artistProfiles,
  hashtagPresets,
  ideaTemplates,
  socialConnections,
  socialPosts,
  user,
} from "./schema";

describe("Social Growth Studio — Clean Database, Accounts & Pre-Programmed Publishing", () => {
  it("initializes Postgres schema with 3 core short-form platforms and supports pre-programmed posts & connections", async () => {
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
    expect(profiles[0]?.targetPlatforms).toEqual([
      "instagram_reels",
      "tiktok",
      "youtube_shorts",
    ]);

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

    // Connect a TikTok account in Inbox mode
    await db.insert(socialConnections).values({
      id: `conn-${testUserId}-tiktok`,
      userId: testUserId,
      platform: "tiktok",
      accountName: "@lilsbd",
      externalAccountId: "open_id_123",
      accessToken: "tok_test",
      metadata: { tiktokPostMode: "inbox" },
    });

    const connections = await db
      .select()
      .from(socialConnections)
      .where(eq(socialConnections.userId, testUserId));
    expect(connections).toHaveLength(1);
    expect(connections[0]?.platform).toBe("tiktok");
    expect(connections[0]?.metadata?.tiktokPostMode).toBe("inbox");

    // Pre-program a social post with videoUrl & autoPublish
    const postId = `post-${testUserId}-1`;
    await db.insert(socialPosts).values({
      id: postId,
      userId: testUserId,
      title: "DEAD OPS 2nd Drop Switch",
      status: "ready",
      platforms: ["instagram_reels", "tiktok", "youtube_shorts"],
      videoUrl: "/api/socials/media/test-drop.mp4",
      videoFileName: "test-drop.mp4",
      videoSizeBytes: 4_200_000,
      autoPublish: true,
      platformDeliveries: {
        instagram_reels: { status: "scheduled" },
        tiktok: { status: "scheduled" },
        youtube_shorts: { status: "scheduled" },
      },
      onScreenHookEn: "Wait for the 2nd kick switch on DEAD OPS (200 BPM)...",
      captionEn: "Full track streaming everywhere -> https://lilsbd.com",
      hashtags: ["#uptempohardcore", "#zaagkick"],
    });

    const savedPosts = await db
      .select()
      .from(socialPosts)
      .where(eq(socialPosts.id, postId));
    expect(savedPosts).toHaveLength(1);
    expect(savedPosts[0]?.autoPublish).toBe(true);
    expect(savedPosts[0]?.videoUrl).toBe("/api/socials/media/test-drop.mp4");

    const assembled = assemblePostCaption(savedPosts[0]!);
    expect(assembled).toContain("Wait for the 2nd kick switch on DEAD OPS (200 BPM)...");
    expect(assembled).toContain("Full track streaming everywhere -> https://lilsbd.com");
    expect(assembled).toContain("#uptempohardcore #zaagkick");

    // Verify graceful per-platform error reporting when an account is unlinked
    const pubResult = await publishSocialPostToPlatforms(postId, testUserId, [
      "instagram_reels",
    ]);
    expect(pubResult.allSucceeded).toBe(false);
    expect(pubResult.deliveries.instagram_reels?.status).toBe("failed");
    expect(pubResult.deliveries.instagram_reels?.error).toContain("No instagram reels account");

    expect(CAMPAIGN_ROLLOUT_BLUEPRINTS.single_release.steps.length).toBe(8);
  });
});
