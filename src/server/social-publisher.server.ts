import { and, eq, lte, ne } from "drizzle-orm";
import { db, ensureSchemaInitialized } from "#/db";
import {
  type PlatformDeliveries,
  type PlatformDeliveryState,
  type PublishablePlatform,
  type SocialConnectionRecord,
  type SocialPlatform,
  type SocialPostRecord,
  socialConnections,
  socialPosts,
} from "#/db/schema";
import { getLegacySocialsDir, readMediaBuffer } from "./media-storage.server";

export const SOCIAL_UPLOADS_DIR = getLegacySocialsDir();

export function ensureUploadsDir(): string {
  return getLegacySocialsDir();
}

export function isPublishablePlatform(p: SocialPlatform): p is PublishablePlatform {
  return p === "instagram_reels" || p === "tiktok" || p === "youtube_shorts";
}

export function assemblePostCaption(post: {
  onScreenHookEn?: string | null;
  captionEn?: string | null;
  ctaEn?: string | null;
  hashtags?: string[] | null;
}): string {
  const hook = post.onScreenHookEn?.trim() || "";
  const body = post.captionEn?.trim() || "";
  const cta = post.ctaEn?.trim() || "";
  const tags = (post.hashtags ?? []).filter(Boolean).join(" ").trim();

  const sections: string[] = [];
  if (hook && !body.startsWith(hook)) {
    sections.push(hook);
  }
  if (body) {
    sections.push(body);
  }
  if (cta && !body.includes(cta)) {
    sections.push(cta);
  }
  if (tags) {
    sections.push(tags);
  }
  return sections.join("\n\n").trim();
}

function getPublicBaseUrl(): string {
  return (
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.BETTER_AUTH_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function resolvePublicVideoUrl(videoUrl: string): string {
  if (videoUrl.startsWith("http://") || videoUrl.startsWith("https://")) {
    return videoUrl;
  }
  const base = getPublicBaseUrl();
  return `${base}${videoUrl.startsWith("/") ? "" : "/"}${videoUrl}`;
}

async function loadVideoBuffer(videoUrl: string): Promise<Uint8Array> {
  if (videoUrl.startsWith("/api/socials/media/")) {
    return readMediaBuffer(videoUrl);
  }

  const resolvedUrl = resolvePublicVideoUrl(videoUrl);
  const res = await fetch(resolvedUrl);
  if (!res.ok) {
    throw new Error(`Could not fetch video from URL (${res.status}): ${resolvedUrl}`);
  }
  const ab = await res.arrayBuffer();
  return new Uint8Array(ab);
}

// ============================================================================
// 1. Instagram Reels Publisher (Meta Graph API v21.0)
// ============================================================================

async function publishToInstagramReels(
  post: SocialPostRecord,
  connection: SocialConnectionRecord,
): Promise<PlatformDeliveryState> {
  if (!post.videoUrl) {
    throw new Error("Attach a video (.mp4) before publishing to Instagram Reels.");
  }

  const publicVideoUrl = resolvePublicVideoUrl(post.videoUrl);
  if (publicVideoUrl.includes("localhost") || publicVideoUrl.includes("127.0.0.1")) {
    throw new Error(
      "Instagram Graph API requires a public HTTPS URL to fetch the Reel video. Set PUBLIC_APP_URL or BETTER_AUTH_URL to your public domain, or paste a public video URL.",
    );
  }

  const caption = assemblePostCaption(post);
  const igUserId = connection.externalAccountId.trim();
  const accessToken = connection.accessToken.trim();

  // Step 1: Create Reel Media Container
  const createParams = new URLSearchParams({
    media_type: "REELS",
    video_url: publicVideoUrl,
    caption,
    share_to_feed: "true",
    access_token: accessToken,
  });

  const createRes = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(igUserId)}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: createParams.toString(),
    },
  );

  const createJson = (await createRes.json()) as {
    id?: string;
    error?: { message?: string };
  };

  if (!createRes.ok || !createJson.id) {
    throw new Error(
      createJson.error?.message || `Instagram container creation failed (${createRes.status})`,
    );
  }

  const creationId = createJson.id;

  // Step 2: Poll until container status_code === FINISHED
  let isReady = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(creationId)}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`,
    );
    const statusJson = (await statusRes.json()) as {
      status_code?: string;
      status?: string;
      error?: { message?: string };
    };

    if (statusJson.status_code === "FINISHED") {
      isReady = true;
      break;
    }
    if (statusJson.status_code === "ERROR" || statusJson.status_code === "EXPIRED") {
      throw new Error(
        `Instagram video processing failed: ${statusJson.status || statusJson.status_code}`,
      );
    }
  }

  if (!isReady) {
    throw new Error("Instagram video container is still processing. Retry in 30 seconds.");
  }

  // Step 3: Publish Container
  const publishParams = new URLSearchParams({
    creation_id: creationId,
    access_token: accessToken,
  });

  const publishRes = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(igUserId)}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: publishParams.toString(),
    },
  );

  const publishJson = (await publishRes.json()) as {
    id?: string;
    error?: { message?: string };
  };

  if (!publishRes.ok || !publishJson.id) {
    throw new Error(
      publishJson.error?.message || `Instagram media_publish failed (${publishRes.status})`,
    );
  }

  // Step 4: Fetch Permalink
  let permalink = `https://www.instagram.com/`;
  try {
    const permRes = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(publishJson.id)}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`,
    );
    const permJson = (await permRes.json()) as { permalink?: string };
    if (permJson.permalink) {
      permalink = permJson.permalink;
    }
  } catch {
    // Keep fallback URL
  }

  return {
    status: "published",
    externalPostId: publishJson.id,
    externalUrl: permalink,
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 2. TikTok Publisher (Content Posting API v2 — Inbox Draft or Direct Post)
// ============================================================================

async function ensureFreshTikTokToken(connection: SocialConnectionRecord): Promise<string> {
  const expiresAt = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt).getTime() : null;
  const now = Date.now();
  if (!expiresAt || expiresAt - now > 5 * 60_000 || !connection.refreshToken) {
    return connection.accessToken;
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();
  if (!clientKey || !clientSecret) {
    return connection.accessToken;
  }

  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: connection.refreshToken,
  });

  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (res.ok && json.access_token) {
    await db
      .update(socialConnections)
      .set({
        accessToken: json.access_token,
        refreshToken: json.refresh_token ?? connection.refreshToken,
        tokenExpiresAt: json.expires_in
          ? new Date(Date.now() + json.expires_in * 1000)
          : connection.tokenExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(socialConnections.id, connection.id));
    return json.access_token;
  }

  return connection.accessToken;
}

async function publishToTikTok(
  post: SocialPostRecord,
  connection: SocialConnectionRecord,
): Promise<PlatformDeliveryState> {
  if (!post.videoUrl) {
    throw new Error("Attach a video (.mp4) before publishing to TikTok.");
  }

  const accessToken = await ensureFreshTikTokToken(connection);
  const videoBytes = await loadVideoBuffer(post.videoUrl);
  const videoSize = videoBytes.byteLength;

  if (videoSize === 0) {
    throw new Error("Video file is empty (0 bytes).");
  }

  const mode = connection.metadata?.tiktokPostMode ?? "inbox";
  const caption = assemblePostCaption(post).slice(0, 2200);

  const initEndpoint =
    mode === "direct"
      ? "https://open.tiktokapis.com/v2/post/publish/video/init/"
      : "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/";

  const initPayload =
    mode === "direct"
      ? {
          post_info: {
            title: caption,
            privacy_level: connection.metadata?.tiktokPrivacyLevel ?? "PUBLIC_TO_EVERYONE",
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: {
            source: "FILE_UPLOAD",
            video_size: videoSize,
            chunk_size: videoSize,
            total_chunk_count: 1,
          },
        }
      : {
          source_info: {
            source: "FILE_UPLOAD",
            video_size: videoSize,
            chunk_size: videoSize,
            total_chunk_count: 1,
          },
        };

  const initRes = await fetch(initEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(initPayload),
  });

  const initJson = (await initRes.json()) as {
    data?: { publish_id?: string; upload_url?: string };
    error?: { code?: string; message?: string };
  };

  if (
    !initRes.ok ||
    (initJson.error?.code && initJson.error.code !== "ok") ||
    !initJson.data?.upload_url
  ) {
    throw new Error(
      initJson.error?.message ||
        initJson.error?.code ||
        `TikTok init failed (${initRes.status})`,
    );
  }

  const uploadUrl = initJson.data.upload_url;
  const publishId = initJson.data.publish_id ?? `tt-${Date.now()}`;

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(videoSize),
      "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
    },
    body: Buffer.from(videoBytes),
  });

  if (!uploadRes.ok) {
    throw new Error(`TikTok binary upload failed (${uploadRes.status})`);
  }

  return {
    status: mode === "direct" ? "published" : "inbox_ready",
    externalPostId: publishId,
    externalUrl: "https://www.tiktok.com/tiktokstudio/content",
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 3. YouTube Shorts Publisher (YouTube Data API v3 Resumable Upload)
// ============================================================================

async function ensureFreshYouTubeToken(connection: SocialConnectionRecord): Promise<string> {
  const expiresAt = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt).getTime() : null;
  const now = Date.now();
  if (!expiresAt || expiresAt - now > 5 * 60_000) {
    if (!connection.refreshToken) {
      return connection.accessToken;
    }
  }

  if (!connection.refreshToken) {
    return connection.accessToken;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret =
    process.env.GOOGLE_CLIENT_SECRET?.trim() || process.env.YOUTUBE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return connection.accessToken;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: connection.refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (res.ok && json.access_token) {
    await db
      .update(socialConnections)
      .set({
        accessToken: json.access_token,
        tokenExpiresAt: json.expires_in
          ? new Date(Date.now() + json.expires_in * 1000)
          : connection.tokenExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(socialConnections.id, connection.id));
    return json.access_token;
  }

  return connection.accessToken;
}

async function publishToYouTubeShorts(
  post: SocialPostRecord,
  connection: SocialConnectionRecord,
): Promise<PlatformDeliveryState> {
  if (!post.videoUrl) {
    throw new Error("Attach a video (.mp4) before publishing to YouTube Shorts.");
  }

  const accessToken = await ensureFreshYouTubeToken(connection);
  const videoBytes = await loadVideoBuffer(post.videoUrl);
  const videoSize = videoBytes.byteLength;

  const baseTitle = (post.onScreenHookEn?.trim() || post.title.trim() || "New Short").replace(
    /[<>]/g,
    "",
  );
  const titleWithShorts = baseTitle.toLowerCase().includes("#shorts")
    ? baseTitle.slice(0, 100)
    : `${baseTitle.slice(0, 91)} #Shorts`;

  const description = assemblePostCaption(post);
  const privacyStatus = connection.metadata?.youtubePrivacy ?? "public";

  const metadataBody = {
    snippet: {
      title: titleWithShorts,
      description,
      categoryId: "10", // Music
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: false,
    },
  };

  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(videoSize),
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify(metadataBody),
    },
  );

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`YouTube upload init failed (${initRes.status}): ${errText.slice(0, 220)}`);
  }

  const uploadLocation = initRes.headers.get("location");
  if (!uploadLocation) {
    throw new Error("YouTube API did not return a resumable upload Location header.");
  }

  const uploadRes = await fetch(uploadLocation, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(videoSize),
    },
    body: Buffer.from(videoBytes),
  });

  const uploadJson = (await uploadRes.json()) as {
    id?: string;
    error?: { message?: string };
  };

  if (!uploadRes.ok || !uploadJson.id) {
    throw new Error(
      uploadJson.error?.message || `YouTube video upload failed (${uploadRes.status})`,
    );
  }

  return {
    status: "published",
    externalPostId: uploadJson.id,
    externalUrl: `https://www.youtube.com/shorts/${uploadJson.id}`,
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 4. Unified Post Publisher & Account Verifier
// ============================================================================

export async function publishSocialPostToPlatforms(
  postId: string,
  userId: string,
  targetPlatforms?: PublishablePlatform[],
): Promise<{
  deliveries: PlatformDeliveries;
  allSucceeded: boolean;
  anySucceeded: boolean;
}> {
  await ensureSchemaInitialized();

  const [postRows, userConnections] = await Promise.all([
    db
      .select()
      .from(socialPosts)
      .where(and(eq(socialPosts.id, postId), eq(socialPosts.userId, userId)))
      .limit(1),
    db.select().from(socialConnections).where(eq(socialConnections.userId, userId)),
  ]);

  const post = postRows[0];
  if (!post) {
    throw new Error("Post not found");
  }

  const platformsToRun: PublishablePlatform[] =
    targetPlatforms && targetPlatforms.length > 0
      ? targetPlatforms
      : (post.platforms ?? []).filter(isPublishablePlatform);

  if (platformsToRun.length === 0) {
    throw new Error("Select at least one platform (IG Reels, TikTok, or YouTube Shorts).");
  }

  const deliveries: PlatformDeliveries = { ...(post.platformDeliveries ?? {}) };

  for (const platform of platformsToRun) {
    const conn = userConnections.find((c) => c.platform === platform);
    if (!conn) {
      deliveries[platform] = {
        status: "failed",
        error: `No ${platform.replace("_", " ")} account connected in Catalog & Accounts.`,
        updatedAt: new Date().toISOString(),
      };
      continue;
    }

    try {
      if (platform === "instagram_reels") {
        deliveries[platform] = await publishToInstagramReels(post, conn);
      } else if (platform === "tiktok") {
        deliveries[platform] = await publishToTikTok(post, conn);
      } else if (platform === "youtube_shorts") {
        deliveries[platform] = await publishToYouTubeShorts(post, conn);
      }
    } catch (err) {
      deliveries[platform] = {
        status: "failed",
        error: err instanceof Error ? err.message : "Publishing failed",
        updatedAt: new Date().toISOString(),
      };
    }
  }

  const states = platformsToRun.map((p) => deliveries[p]?.status);
  const allSucceeded =
    states.length > 0 && states.every((s) => s === "published" || s === "inbox_ready");
  const anySucceeded = states.some((s) => s === "published" || s === "inbox_ready");

  const firstPublishedUrl =
    deliveries.instagram_reels?.externalUrl ||
    deliveries.youtube_shorts?.externalUrl ||
    deliveries.tiktok?.externalUrl ||
    post.publishedUrl ||
    null;

  await db
    .update(socialPosts)
    .set({
      platformDeliveries: deliveries,
      ...(allSucceeded
        ? {
            status: "posted",
            postedAt: new Date(),
            autoPublish: false,
            publishedUrl: firstPublishedUrl,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(socialPosts.id, post.id));

  return { deliveries, allSucceeded, anySucceeded };
}

export async function testSocialConnection(
  connection: SocialConnectionRecord,
): Promise<{ ok: boolean; accountLabel: string; message: string }> {
  try {
    if (connection.platform === "instagram_reels") {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(connection.externalAccountId)}?fields=id,username,name&access_token=${encodeURIComponent(connection.accessToken)}`,
      );
      const json = (await res.json()) as {
        username?: string;
        name?: string;
        error?: { message?: string };
      };
      if (!res.ok) {
        return {
          ok: false,
          accountLabel: connection.accountName,
          message: json.error?.message || `Graph API returned ${res.status}`,
        };
      }
      const handle = json.username ? `@${json.username}` : json.name || connection.accountName;
      return {
        ok: true,
        accountLabel: handle,
        message: `Connected to Instagram Business account ${handle}`,
      };
    }

    if (connection.platform === "tiktok") {
      const token = await ensureFreshTikTokToken(connection);
      const res = await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const json = (await res.json()) as {
        data?: { user?: { username?: string; display_name?: string } };
        error?: { code?: string; message?: string };
      };
      if (!res.ok || (json.error?.code && json.error.code !== "ok")) {
        return {
          ok: false,
          accountLabel: connection.accountName,
          message: json.error?.message || `TikTok API returned ${res.status}`,
        };
      }
      const name =
        json.data?.user?.username ||
        json.data?.user?.display_name ||
        connection.accountName;
      return {
        ok: true,
        accountLabel: name,
        message: `TikTok token valid for ${name}`,
      };
    }

    if (connection.platform === "youtube_shorts") {
      const token = await ensureFreshYouTubeToken(connection);
      const res = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const json = (await res.json()) as {
        items?: Array<{ id?: string; snippet?: { title?: string } }>;
        error?: { message?: string };
      };
      if (!res.ok) {
        return {
          ok: false,
          accountLabel: connection.accountName,
          message: json.error?.message || `YouTube API returned ${res.status}`,
        };
      }
      const title = json.items?.[0]?.snippet?.title || connection.accountName;
      return {
        ok: true,
        accountLabel: title,
        message: `Connected to YouTube channel "${title}"`,
      };
    }

    return { ok: false, accountLabel: connection.accountName, message: "Unknown platform" };
  } catch (err) {
    return {
      ok: false,
      accountLabel: connection.accountName,
      message: err instanceof Error ? err.message : "Network error testing connection",
    };
  }
}

// ============================================================================
// 5. In-Process Background Scheduler (60s Tick on VPS/Node)
// ============================================================================

const globalForScheduler = globalThis as unknown as {
  __lilSbdSocialSchedulerStarted?: boolean;
  __lilSbdSocialSchedulerBusy?: boolean;
};

export async function runDueScheduledPosts(): Promise<number> {
  if (globalForScheduler.__lilSbdSocialSchedulerBusy) {
    return 0;
  }
  globalForScheduler.__lilSbdSocialSchedulerBusy = true;

  try {
    await ensureSchemaInitialized();
    const now = new Date();
    const duePosts = await db
      .select()
      .from(socialPosts)
      .where(
        and(
          eq(socialPosts.autoPublish, true),
          ne(socialPosts.status, "posted"),
          lte(socialPosts.scheduledFor, now),
        ),
      );

    let processedCount = 0;
    for (const post of duePosts) {
      if (!post.videoUrl) {
        continue;
      }
      const pendingPlatforms = (post.platforms ?? [])
        .filter(isPublishablePlatform)
        .filter((p) => {
          const st = post.platformDeliveries?.[p]?.status;
          return st !== "published" && st !== "inbox_ready" && st !== "failed";
        });

      if (pendingPlatforms.length === 0) {
        continue;
      }

      await publishSocialPostToPlatforms(post.id, post.userId, pendingPlatforms);
      processedCount++;
    }

    return processedCount;
  } catch (err) {
    console.error("[SocialScheduler] Error processing due posts:", err);
    return 0;
  } finally {
    globalForScheduler.__lilSbdSocialSchedulerBusy = false;
  }
}

export function ensureSocialSchedulerRunning(): void {
  if (globalForScheduler.__lilSbdSocialSchedulerStarted) {
    return;
  }
  if (process.env.VITEST) {
    return;
  }
  globalForScheduler.__lilSbdSocialSchedulerStarted = true;
  const timer = setInterval(() => {
    void runDueScheduledPosts();
  }, 60_000);
  if (typeof timer.unref === "function") {
    timer.unref();
  }
}
