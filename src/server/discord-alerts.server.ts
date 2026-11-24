import { eq } from "drizzle-orm";
import { db, ensureSchemaInitialized } from "#/db";
import { artistProfiles, type PublishablePlatform, socialConnections } from "#/db/schema";
import { evaluateTokenHealth } from "./social-publisher.server";

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields?: DiscordEmbedField[];
  url?: string;
  footer?: { text: string };
  timestamp?: string;
}

export interface DiscordWebhookPayload {
  username?: string;
  content?: string;
  embeds: DiscordEmbed[];
}

const DISCORD_COLORS = {
  purple: 0x9333ea,
  amber: 0xf59e0b,
  red: 0xef4444,
  cyan: 0x06b6d4,
  emerald: 0x10b981,
} as const;

const PLATFORM_LABELS: Record<PublishablePlatform, string> = {
  youtube_shorts: "YouTube Shorts",
  instagram_reels: "Instagram Reels",
  tiktok: "TikTok",
};

const globalForAlerts = globalThis as unknown as {
  __lilSbdTokenAlertDedupe?: Map<string, number>;
};

function getTokenDedupeMap(): Map<string, number> {
  if (!globalForAlerts.__lilSbdTokenAlertDedupe) {
    globalForAlerts.__lilSbdTokenAlertDedupe = new Map();
  }
  return globalForAlerts.__lilSbdTokenAlertDedupe;
}

export function resetTokenAlertDedupeForTests(): void {
  getTokenDedupeMap().clear();
}

export function isValidDiscordWebhookUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return false;
    const allowedHosts = new Set([
      "discord.com",
      "discordapp.com",
      "canary.discord.com",
      "ptb.discord.com",
    ]);
    if (!allowedHosts.has(parsed.hostname.toLowerCase())) return false;
    return parsed.pathname.startsWith("/api/webhooks/");
  } catch {
    return false;
  }
}

function getStudioBaseUrl(): string {
  return (
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.BETTER_AUTH_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function safeStudioUrl(path: string): string | undefined {
  const base = getStudioBaseUrl();
  if (base.startsWith("https://") || base.startsWith("http://")) {
    return `${base}${path}`;
  }
  return undefined;
}

export async function sendDiscordWebhookMessage(
  webhookUrl: string,
  payload: DiscordWebhookPayload,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = webhookUrl.trim();
  if (!isValidDiscordWebhookUrl(trimmed)) {
    return {
      ok: false,
      error: "Invalid Discord webhook URL (must start with https://discord.com/api/webhooks/...)",
    };
  }

  try {
    const res = await fetch(trimmed, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: payload.username || "Lil SBD Autopilot",
        ...(payload.content ? { content: payload.content } : {}),
        embeds: payload.embeds,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Discord returned HTTP ${res.status}${text ? `: ${text.slice(0, 140)}` : ""}`,
      };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error sending Discord webhook",
    };
  }
}

async function getUserWebhookConfig(
  userId: string,
): Promise<{ webhookUrl: string; stageName: string } | null> {
  await ensureSchemaInitialized();
  const rows = await db
    .select({
      discordWebhookUrl: artistProfiles.discordWebhookUrl,
      stageName: artistProfiles.stageName,
    })
    .from(artistProfiles)
    .where(eq(artistProfiles.userId, userId))
    .limit(1);

  const profile = rows[0];
  if (!profile?.discordWebhookUrl?.trim()) return null;
  if (!isValidDiscordWebhookUrl(profile.discordWebhookUrl)) return null;
  return {
    webhookUrl: profile.discordWebhookUrl.trim(),
    stageName: profile.stageName || "LIL SBD",
  };
}

export async function sendTestDiscordAlert(
  webhookUrl: string,
  stageName = "LIL SBD",
): Promise<{ ok: boolean; error?: string }> {
  return sendDiscordWebhookMessage(webhookUrl, {
    username: `${stageName} Autopilot`,
    embeds: [
      {
        title: "Discord Autopilot Alerts Connected",
        description:
          "You will receive pings here when a clip is held for review, a publish fails, a TikTok draft hits your inbox, or a platform token is expiring.",
        color: DISCORD_COLORS.emerald,
        url: safeStudioUrl("/admin/socials/settings"),
        footer: { text: `${stageName} • Social Autopilot Studio` },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

export async function notifyClipHeldForReview(params: {
  userId: string;
  postTitle: string;
  trackTitle?: string | null;
  reason: string;
}): Promise<boolean> {
  try {
    const cfg = await getUserWebhookConfig(params.userId);
    if (!cfg) return false;

    const reviewUrl = safeStudioUrl("/admin/socials");
    const res = await sendDiscordWebhookMessage(cfg.webhookUrl, {
      username: `${cfg.stageName} Autopilot`,
      embeds: [
        {
          title: `Held in Review Inbox: ${params.postTitle.slice(0, 120)}`,
          description: params.reason.slice(0, 400),
          color: DISCORD_COLORS.amber,
          ...(reviewUrl ? { url: reviewUrl } : {}),
          fields: [
            ...(params.trackTitle
              ? [{ name: "Track", value: params.trackTitle, inline: true }]
              : []),
            ...(reviewUrl
              ? [{ name: "Action", value: `[Open Review Inbox](${reviewUrl})`, inline: true }]
              : []),
          ],
          footer: { text: `${cfg.stageName} • Autopilot Safety Net` },
          timestamp: new Date().toISOString(),
        },
      ],
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function notifyPublishFailed(params: {
  userId: string;
  postTitle: string;
  errorSummary: string;
  platforms?: PublishablePlatform[];
}): Promise<boolean> {
  try {
    const cfg = await getUserWebhookConfig(params.userId);
    if (!cfg) return false;

    const queueUrl = safeStudioUrl("/admin/socials/queue");
    const platformList =
      params.platforms && params.platforms.length > 0
        ? params.platforms.map((p) => PLATFORM_LABELS[p] ?? p).join(", ")
        : "Target platform(s)";

    const res = await sendDiscordWebhookMessage(cfg.webhookUrl, {
      username: `${cfg.stageName} Autopilot`,
      embeds: [
        {
          title: `Publish Failed: ${params.postTitle.slice(0, 120)}`,
          description: params.errorSummary.slice(0, 450),
          color: DISCORD_COLORS.red,
          ...(queueUrl ? { url: queueUrl } : {}),
          fields: [
            { name: "Platforms", value: platformList, inline: true },
            ...(queueUrl
              ? [{ name: "Retry", value: `[Open Autopilot Queue](${queueUrl})`, inline: true }]
              : []),
          ],
          footer: { text: `${cfg.stageName} • Auto-Publish Exhausted Retries` },
          timestamp: new Date().toISOString(),
        },
      ],
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function notifyTikTokInboxReady(params: {
  userId: string;
  postTitle: string;
  captionPreview?: string | null;
}): Promise<boolean> {
  try {
    const cfg = await getUserWebhookConfig(params.userId);
    if (!cfg) return false;

    const queueUrl = safeStudioUrl("/admin/socials/queue");
    const res = await sendDiscordWebhookMessage(cfg.webhookUrl, {
      username: `${cfg.stageName} Autopilot`,
      embeds: [
        {
          title: `TikTok Draft Ready in Inbox: ${params.postTitle.slice(0, 110)}`,
          description:
            "Your rendered vertical video has been pushed to your TikTok app notifications. Open TikTok on your phone to tap Post.",
          color: DISCORD_COLORS.cyan,
          url: "https://www.tiktok.com/tiktokstudio/content",
          fields: [
            ...(params.captionPreview?.trim()
              ? [
                  {
                    name: "Caption (ready to paste)",
                    value: params.captionPreview.trim().slice(0, 300),
                    inline: false,
                  },
                ]
              : []),
            ...(queueUrl
              ? [{ name: "Studio", value: `[View Queue](${queueUrl})`, inline: true }]
              : []),
          ],
          footer: { text: `${cfg.stageName} • TikTok Inbox Draft Push` },
          timestamp: new Date().toISOString(),
        },
      ],
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Scans all connected social accounts for expired or soon-expiring (<= 7 days) tokens
 * and sends a Discord alert at most once every 24 hours per connection.
 */
export async function scanAndNotifyExpiringTokens(now = new Date()): Promise<number> {
  await ensureSchemaInitialized();
  const [profiles, connections] = await Promise.all([
    db
      .select({
        userId: artistProfiles.userId,
        stageName: artistProfiles.stageName,
        discordWebhookUrl: artistProfiles.discordWebhookUrl,
      })
      .from(artistProfiles),
    db.select().from(socialConnections),
  ]);

  const profileByUser = new Map(profiles.map((p) => [p.userId, p]));
  const dedupe = getTokenDedupeMap();
  const nowMs = now.getTime();
  const cooldownMs = 24 * 3600_000;
  let alertsSent = 0;

  for (const conn of connections) {
    const health = evaluateTokenHealth(conn);
    if (health.tokenHealth !== "expired" && health.tokenHealth !== "expiring_soon") {
      continue;
    }

    const profile = profileByUser.get(conn.userId);
    if (!profile?.discordWebhookUrl?.trim() || !isValidDiscordWebhookUrl(profile.discordWebhookUrl)) {
      continue;
    }

    const dedupeKey = `${conn.userId}:${conn.platform}:${health.tokenHealth}`;
    const lastSentMs = dedupe.get(dedupeKey) ?? 0;
    if (nowMs - lastSentMs < cooldownMs) {
      continue;
    }

    const settingsUrl = safeStudioUrl("/admin/socials/settings");
    const platformLabel = PLATFORM_LABELS[conn.platform] ?? conn.platform;
    const isExpired = health.tokenHealth === "expired";

    const res = await sendDiscordWebhookMessage(profile.discordWebhookUrl, {
      username: `${profile.stageName || "LIL SBD"} Autopilot`,
      embeds: [
        {
          title: isExpired
            ? `${platformLabel} Token Expired (${conn.accountName})`
            : `${platformLabel} Token Expiring in ${health.daysUntilExpiry ?? 0}d (${conn.accountName})`,
          description: isExpired
            ? `Auto-publishing to ${platformLabel} will fail until you reconnect or paste a fresh token.`
            : `Reconnect ${platformLabel} soon so scheduled Autopilot posts keep firing without interruption.`,
          color: isExpired ? DISCORD_COLORS.red : DISCORD_COLORS.amber,
          ...(settingsUrl ? { url: settingsUrl } : {}),
          fields: [
            { name: "Account", value: conn.accountName, inline: true },
            ...(settingsUrl
              ? [{ name: "Reconnect", value: `[Open Tracks & Settings](${settingsUrl})`, inline: true }]
              : []),
          ],
          footer: { text: `${profile.stageName || "LIL SBD"} • Token Health Monitor` },
          timestamp: now.toISOString(),
        },
      ],
    });

    if (res.ok) {
      dedupe.set(dedupeKey, nowMs);
      alertsSent++;
    }
  }

  return alertsSent;
}
