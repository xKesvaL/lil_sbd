// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { db, ensureSchemaInitialized } from "#/db";
import { artistProfiles, socialConnections, user } from "#/db/schema";
import { handleAutopilotCronRequest } from "#/routes/api/socials/cron";
import {
  isValidDiscordWebhookUrl,
  notifyClipHeldForReview,
  notifyPublishFailed,
  notifyTikTokInboxReady,
  resetTokenAlertDedupeForTests,
  scanAndNotifyExpiringTokens,
} from "./discord-alerts.server";

describe("Milestone 3 — Unattended Cron Heartbeat & Discord Webhook Alerts", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  afterEach(() => {
    vi.restoreAllMocks();
    resetTokenAlertDedupeForTests();
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }
  });

  it("validates Discord webhook URLs strictly", () => {
    expect(isValidDiscordWebhookUrl("https://discord.com/api/webhooks/123456/abcdef")).toBe(true);
    expect(isValidDiscordWebhookUrl("https://discordapp.com/api/webhooks/123456/abcdef")).toBe(true);
    expect(isValidDiscordWebhookUrl("http://discord.com/api/webhooks/123456/abcdef")).toBe(false);
    expect(isValidDiscordWebhookUrl("https://evil.example.com/api/webhooks/123/abc")).toBe(false);
    expect(isValidDiscordWebhookUrl("")).toBe(false);
  });

  it("sends Discord embeds for held clips, publish failures, TikTok inbox ready, and deduplicated token alerts", async () => {
    await ensureSchemaInitialized();
    const uid = `test-discord-${Date.now()}`;
    const webhookUrl = "https://discord.com/api/webhooks/999999999/test-token";

    await db.insert(user).values({
      id: uid,
      name: "LIL SBD",
      email: `${uid}@lilsbd.com`,
      emailVerified: true,
    });
    await db.insert(artistProfiles).values({
      id: `profile-${uid}`,
      userId: uid,
      stageName: "LIL SBD",
      discordWebhookUrl: webhookUrl,
    });
    await db.insert(socialConnections).values({
      id: `conn-${uid}-ig`,
      userId: uid,
      platform: "instagram_reels",
      accountName: "@lilsbd",
      externalAccountId: "ig-123",
      accessToken: "fake-token",
      tokenExpiresAt: new Date(Date.now() + 3 * 86_400_000), // expires in 3 days
    });

    const sentPayloads: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      sentPayloads.push({
        url: String(input),
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      });
      return new Response(null, { status: 204 });
    });

    const heldSent = await notifyClipHeldForReview({
      userId: uid,
      postTitle: "INDUZAAG — Drop Clip",
      trackTitle: "INDUZAAG",
      reason: "Low audio sync (15% < 35% threshold)",
    });
    expect(heldSent).toBe(true);

    const failSent = await notifyPublishFailed({
      userId: uid,
      postTitle: "CAFFEINE — Mashup",
      errorSummary: "Instagram Graph API returned 400",
      platforms: ["instagram_reels"],
    });
    expect(failSent).toBe(true);

    const tiktokSent = await notifyTikTokInboxReady({
      userId: uid,
      postTitle: "CAFFEINE — Mashup",
      captionPreview: "CAFFEINE (220 BPM). Out everywhere — https://lilsbd.com",
    });
    expect(tiktokSent).toBe(true);

    // Token expiry scan should alert once, then deduplicate on immediate repeat scan
    const firstScan = await scanAndNotifyExpiringTokens(new Date());
    const secondScan = await scanAndNotifyExpiringTokens(new Date());
    expect(firstScan).toBeGreaterThanOrEqual(1);
    expect(secondScan).toBe(0);

    expect(sentPayloads.length).toBeGreaterThanOrEqual(4);
    expect(sentPayloads.every((p) => p.url === webhookUrl)).toBe(true);
  });

  it("enforces CRON_SECRET on /api/socials/cron and runs a worker tick when authorized", async () => {
    process.env.CRON_SECRET = "super-secret-coolify-cron-key";

    // Missing secret -> 401
    const unauthRes = await handleAutopilotCronRequest(
      new Request("https://lilsbd.com/api/socials/cron", { method: "POST" }),
    );
    expect(unauthRes.status).toBe(401);

    // Wrong secret -> 401
    const wrongRes = await handleAutopilotCronRequest(
      new Request("https://lilsbd.com/api/socials/cron", {
        method: "POST",
        headers: { Authorization: "Bearer wrong-key" },
      }),
    );
    expect(wrongRes.status).toBe(401);

    // Valid Bearer secret -> 200 with structured tick summary
    const okRes = await handleAutopilotCronRequest(
      new Request("https://lilsbd.com/api/socials/cron", {
        method: "POST",
        headers: { Authorization: "Bearer super-secret-coolify-cron-key" },
      }),
    );
    expect(okRes.status).toBe(200);
    const json = (await okRes.json()) as {
      ok: boolean;
      workerRunning: boolean;
      enqueuedAutopilotPosts: number;
      jobsProcessed: number;
    };
    expect(json.ok).toBe(true);
    expect(json.workerRunning).toBe(true);
    expect(typeof json.enqueuedAutopilotPosts).toBe("number");
    expect(typeof json.jobsProcessed).toBe("number");
  });
});
