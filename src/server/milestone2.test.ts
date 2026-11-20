// @vitest-environment node
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, ensureSchemaInitialized } from "#/db";
import { backgroundJobs, socialPosts, user } from "#/db/schema";
import {
  computeRebalancedQueue,
  enqueueDueAutopilotPosts,
  findNextAvailableSlot,
  generateCadenceSlots,
  zonedWallClockToUtc,
} from "./autopilot-scheduler.server";
import { processNextJob } from "./jobs.server";
import { evaluateTokenHealth } from "./social-publisher.server";

describe("Milestone 2 — Autopilot Cadence, Track Rotation, Token Health & Hardened Publish Jobs", () => {
  it("converts Europe/Paris wall-clock times to UTC accurately across winter and summer DST", () => {
    // Winter (CET = UTC+1): 18:00 Paris = 17:00 UTC
    const winter = zonedWallClockToUtc(2026, 11, 23, 18, 0, "Europe/Paris");
    expect(winter.toISOString()).toBe("2026-11-23T17:00:00.000Z");

    // Summer (CEST = UTC+2): 18:00 Paris = 16:00 UTC
    const summer = zonedWallClockToUtc(2026, 7, 15, 18, 0, "Europe/Paris");
    expect(summer.toISOString()).toBe("2026-07-15T16:00:00.000Z");
  });

  it("generates upcoming cadence slots and finds next open slot without collisions", () => {
    // Anchor: Friday 2026-11-20 12:00 UTC (13:00 Paris)
    const now = new Date("2026-11-20T12:00:00.000Z");
    const cadence = {
      timezone: "Europe/Paris",
      cadenceDays: [1, 3, 5, 0], // Mon, Wed, Fri, Sun
      cadenceTime: "18:00",
      avoidConsecutiveTrack: true,
    };

    const slots = generateCadenceSlots({ cadence, fromDate: now, count: 4 });
    expect(slots).toHaveLength(4);
    // Fri Nov 20 18:00 CET -> 17:00Z, Sun Nov 22 17:00Z, Mon Nov 23 17:00Z, Wed Nov 25 17:00Z
    expect(slots[0]!.toISOString()).toBe("2026-11-20T17:00:00.000Z");
    expect(slots[1]!.toISOString()).toBe("2026-11-22T17:00:00.000Z");
    expect(slots[2]!.toISOString()).toBe("2026-11-23T17:00:00.000Z");
    expect(slots[3]!.toISOString()).toBe("2026-11-25T17:00:00.000Z");

    // Occupy Friday slot -> next available should be Sunday
    const next = findNextAvailableSlot({
      profile: cadence,
      existingPosts: [
        {
          id: "p-1",
          status: "ready",
          reviewStatus: "approved",
          catalogItemId: "track-a",
          scheduledFor: new Date("2026-11-20T17:00:00.000Z"),
        },
      ],
      catalogItemId: "track-b",
      now,
    });
    expect(next.toISOString()).toBe("2026-11-22T17:00:00.000Z");
  });

  it("interleaves tracks when rebalancing the queue with avoidConsecutiveTrack enabled", () => {
    const now = new Date("2026-11-20T12:00:00.000Z");
    const rebalanced = computeRebalancedQueue({
      profile: {
        timezone: "Europe/Paris",
        cadenceDays: [1, 3, 5, 0],
        cadenceTime: "18:00",
        avoidConsecutiveTrack: true,
      },
      lastPublishedTrackId: "track-a",
      posts: [
        { id: "p1", catalogItemId: "track-a", scheduledFor: null, createdAt: new Date(1000) },
        { id: "p2", catalogItemId: "track-a", scheduledFor: null, createdAt: new Date(2000) },
        { id: "p3", catalogItemId: "track-b", scheduledFor: null, createdAt: new Date(3000) },
        { id: "p4", catalogItemId: "track-c", scheduledFor: null, createdAt: new Date(4000) },
      ],
      now,
    });

    // Since last published was track-a, order should avoid putting track-a first or consecutively!
    const order = rebalanced.map((r) => r.postId);
    expect(order).toEqual(["p3", "p1", "p4", "p2"]);
  });

  it("evaluates social OAuth token health accurately (auto-refresh vs expiring vs expired)", () => {
    const in3Days = new Date(Date.now() + 3 * 86_400_000);
    const yesterday = new Date(Date.now() - 86_400_000);
    const in30Days = new Date(Date.now() + 30 * 86_400_000);

    expect(evaluateTokenHealth({ tokenExpiresAt: in30Days }).tokenHealth).toBe("healthy");
    expect(evaluateTokenHealth({ tokenExpiresAt: in3Days }).tokenHealth).toBe("expiring_soon");
    expect(evaluateTokenHealth({ tokenExpiresAt: yesterday }).tokenHealth).toBe("expired");
    // Refresh token keeps Google/TikTok accounts healthy even if short-lived access token expired
    expect(
      evaluateTokenHealth({ tokenExpiresAt: yesterday, refreshToken: "refresh_tok" }).tokenHealth,
    ).toBe("healthy");
  });

  it("enqueues due approved posts once (deduplicated) and runs publish_post job with retry on failure", async () => {
    await ensureSchemaInitialized();

    const testUserId = `test-m2-autopilot-${Date.now()}`;
    await db.insert(user).values({
      id: testUserId,
      name: "LIL SBD",
      email: `${testUserId}@lilsbd.com`,
      emailVerified: true,
    });

    const postId = `post-m2-${Date.now()}`;
    await db.insert(socialPosts).values({
      id: postId,
      userId: testUserId,
      title: "INDUZAAG Auto-Publish Test",
      status: "ready",
      reviewStatus: "approved",
      autoPublish: true,
      platforms: ["youtube_shorts"],
      scheduledFor: new Date(Date.now() - 60_000), // due 1 minute ago
      videoUrl: "/api/socials/media/rendered/sample.mp4",
    });

    // First scan enqueues 1 publish_post job; second scan deduplicates (0 new jobs)
    const count1 = await enqueueDueAutopilotPosts();
    const count2 = await enqueueDueAutopilotPosts();
    expect(count1).toBe(1);
    expect(count2).toBe(0);

    // Running the job without a connected YouTube account fails & schedules retry 1/3
    const processed = await processNextJob();
    expect(processed?.jobType).toBe("publish_post");
    expect(processed?.postId).toBe(postId);
    expect(processed?.status).toBe("queued"); // queued for exponential backoff retry
    expect(processed?.attempts).toBe(1);
    expect(processed?.error).toContain("No youtube shorts account connected");

    const updatedPost = await db
      .select()
      .from(socialPosts)
      .where(eq(socialPosts.id, postId))
      .limit(1);
    expect(updatedPost[0]?.platformDeliveries?.youtube_shorts?.status).toBe("failed");

    const jobs = await db
      .select()
      .from(backgroundJobs)
      .where(eq(backgroundJobs.postId, postId));
    expect(jobs).toHaveLength(1);
  });
});
