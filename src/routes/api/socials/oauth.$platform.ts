import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db, ensureSchemaInitialized } from "#/db";
import { type PublishablePlatform, socialConnections } from "#/db/schema";
import { auth } from "#/lib/auth";
import { isPublishablePlatform } from "#/server/social-publisher.server";

function getBaseUrl(request: Request): string {
  const envUrl = process.env.PUBLIC_APP_URL?.trim() || process.env.BETTER_AUTH_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, "");
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}

export const Route = createFileRoute("/api/socials/oauth/$platform")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        await ensureSchemaInitialized();
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user) {
          return Response.redirect(new URL("/admin/login", request.url).toString(), 302);
        }

        const rawPlatform = params.platform as PublishablePlatform;
        if (!isPublishablePlatform(rawPlatform)) {
          return Response.redirect(
            new URL("/admin/socials?oauth_error=invalid_platform", request.url).toString(),
            302,
          );
        }

        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const baseUrl = getBaseUrl(request);
        const redirectUri = `${baseUrl}/api/socials/oauth/${rawPlatform}`;

        // ------------------------------------------------------------------
        // Step 1: Initiate OAuth Redirect (when ?code is not present)
        // ------------------------------------------------------------------
        if (!code) {
          if (rawPlatform === "instagram_reels") {
            const clientId = process.env.META_APP_ID?.trim();
            if (!clientId) {
              return Response.redirect(
                `${baseUrl}/admin/socials?tab=settings&setup=${rawPlatform}`,
                302,
              );
            }
            const authUrl = new URL("https://www.facebook.com/v21.0/dialog/oauth");
            authUrl.searchParams.set("client_id", clientId);
            authUrl.searchParams.set("redirect_uri", redirectUri);
            authUrl.searchParams.set(
              "scope",
              "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,business_management",
            );
            authUrl.searchParams.set("response_type", "code");
            return Response.redirect(authUrl.toString(), 302);
          }

          if (rawPlatform === "tiktok") {
            const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
            if (!clientKey) {
              return Response.redirect(
                `${baseUrl}/admin/socials?tab=settings&setup=${rawPlatform}`,
                302,
              );
            }

            // Generate PKCE code_verifier & hex-encoded SHA-256 code_challenge
            // so TikTok "Desktop" platform works directly with http://localhost:3000 (zero tunnels!)
            const verifierBytes = new Uint8Array(32);
            crypto.getRandomValues(verifierBytes);
            const codeVerifier = Array.from(verifierBytes, (b) =>
              b.toString(16).padStart(2, "0"),
            ).join("");
            const digest = await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(codeVerifier),
            );
            const codeChallenge = Array.from(new Uint8Array(digest), (b) =>
              b.toString(16).padStart(2, "0"),
            ).join("");

            const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
            authUrl.searchParams.set("client_key", clientKey);
            authUrl.searchParams.set("redirect_uri", redirectUri);
            authUrl.searchParams.set("scope", "user.info.basic,video.upload,video.publish");
            authUrl.searchParams.set("response_type", "code");
            authUrl.searchParams.set("state", `${session.user.id}.${codeVerifier}`);
            authUrl.searchParams.set("code_challenge", codeChallenge);
            authUrl.searchParams.set("code_challenge_method", "S256");
            return Response.redirect(authUrl.toString(), 302);
          }

          if (rawPlatform === "youtube_shorts") {
            const clientId =
              process.env.GOOGLE_CLIENT_ID?.trim() || process.env.YOUTUBE_CLIENT_ID?.trim();
            if (!clientId) {
              return Response.redirect(
                `${baseUrl}/admin/socials?tab=settings&setup=${rawPlatform}`,
                302,
              );
            }
            const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
            authUrl.searchParams.set("client_id", clientId);
            authUrl.searchParams.set("redirect_uri", redirectUri);
            authUrl.searchParams.set("response_type", "code");
            authUrl.searchParams.set("access_type", "offline");
            authUrl.searchParams.set("prompt", "consent");
            authUrl.searchParams.set(
              "scope",
              "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
            );
            return Response.redirect(authUrl.toString(), 302);
          }
        }

        // ------------------------------------------------------------------
        // Step 2: Handle OAuth Callback (?code=...)
        // ------------------------------------------------------------------
        try {
          const userId = session.user.id;

          if (rawPlatform === "instagram_reels") {
            const clientId = process.env.META_APP_ID!.trim();
            const clientSecret = process.env.META_APP_SECRET!.trim();

            const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
            tokenUrl.searchParams.set("client_id", clientId);
            tokenUrl.searchParams.set("client_secret", clientSecret);
            tokenUrl.searchParams.set("redirect_uri", redirectUri);
            tokenUrl.searchParams.set("code", code!);

            const shortRes = await fetch(tokenUrl.toString());
            const shortJson = (await shortRes.json()) as { access_token?: string };
            if (!shortJson.access_token) {
              throw new Error("Failed to exchange Meta OAuth code");
            }

            // Exchange for 60-day long-lived token
            const longUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
            longUrl.searchParams.set("grant_type", "fb_exchange_token");
            longUrl.searchParams.set("client_id", clientId);
            longUrl.searchParams.set("client_secret", clientSecret);
            longUrl.searchParams.set("fb_exchange_token", shortJson.access_token);

            const longRes = await fetch(longUrl.toString());
            const longJson = (await longRes.json()) as {
              access_token?: string;
              expires_in?: number;
            };
            const finalToken = longJson.access_token || shortJson.access_token;

            // Discover linked Instagram Business Account via Facebook Pages
            const pagesRes = await fetch(
              `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,instagram_business_account{id,username,name}&access_token=${encodeURIComponent(finalToken)}`,
            );
            const pagesJson = (await pagesRes.json()) as {
              data?: Array<{
                id: string;
                name: string;
                instagram_business_account?: { id: string; username?: string; name?: string };
              }>;
            };

            const pageWithIg = pagesJson.data?.find((p) => p.instagram_business_account?.id);
            if (!pageWithIg?.instagram_business_account) {
              throw new Error(
                "No Instagram Business/Creator account linked to your Facebook Pages.",
              );
            }

            const igAcct = pageWithIg.instagram_business_account;
            const accountName = igAcct.username ? `@${igAcct.username}` : igAcct.name || "IG Reels";

            await db
              .delete(socialConnections)
              .where(
                and(
                  eq(socialConnections.userId, userId),
                  eq(socialConnections.platform, "instagram_reels"),
                ),
              );

            await db.insert(socialConnections).values({
              id: `conn-${userId}-instagram_reels`,
              userId,
              platform: "instagram_reels",
              accountName,
              externalAccountId: igAcct.id,
              accessToken: finalToken,
              tokenExpiresAt: longJson.expires_in
                ? new Date(Date.now() + longJson.expires_in * 1000)
                : new Date(Date.now() + 60 * 86_400_000),
              metadata: { igPageId: pageWithIg.id },
            });
          }

          if (rawPlatform === "tiktok") {
            const clientKey = process.env.TIKTOK_CLIENT_KEY!.trim();
            const clientSecret = process.env.TIKTOK_CLIENT_SECRET!.trim();
            const rawState = url.searchParams.get("state") || "";
            const codeVerifier = rawState.includes(".")
              ? rawState.split(".").slice(1).join(".")
              : undefined;

            const body = new URLSearchParams({
              client_key: clientKey,
              client_secret: clientSecret,
              code: decodeURIComponent(code!),
              grant_type: "authorization_code",
              redirect_uri: redirectUri,
              ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
            });

            const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: body.toString(),
            });

            const tokenJson = (await tokenRes.json()) as {
              access_token?: string;
              refresh_token?: string;
              open_id?: string;
              expires_in?: number;
              scope?: string;
              error_description?: string;
            };

            if (!tokenJson.access_token || !tokenJson.open_id) {
              throw new Error(
                tokenJson.error_description || "TikTok token exchange failed",
              );
            }

            let accountName = "TikTok Creator";
            try {
              const infoRes = await fetch(
                "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username",
                {
                  headers: { Authorization: `Bearer ${tokenJson.access_token}` },
                },
              );
              const infoJson = (await infoRes.json()) as {
                data?: { user?: { username?: string; display_name?: string } };
              };
              const u = infoJson.data?.user;
              if (u?.username) accountName = `@${u.username}`;
              else if (u?.display_name) accountName = u.display_name;
            } catch {
              // Keep default label
            }

            await db
              .delete(socialConnections)
              .where(
                and(eq(socialConnections.userId, userId), eq(socialConnections.platform, "tiktok")),
              );

            await db.insert(socialConnections).values({
              id: `conn-${userId}-tiktok`,
              userId,
              platform: "tiktok",
              accountName,
              externalAccountId: tokenJson.open_id,
              accessToken: tokenJson.access_token,
              refreshToken: tokenJson.refresh_token ?? null,
              tokenExpiresAt: tokenJson.expires_in
                ? new Date(Date.now() + tokenJson.expires_in * 1000)
                : null,
              scopes: tokenJson.scope ?? null,
              metadata: { tiktokPostMode: "inbox" },
            });
          }

          if (rawPlatform === "youtube_shorts") {
            const clientId = (
              process.env.GOOGLE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID
            )!.trim();
            const clientSecret = (
              process.env.GOOGLE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET
            )!.trim();

            const body = new URLSearchParams({
              code: code!,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUri,
              grant_type: "authorization_code",
            });

            const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: body.toString(),
            });

            const tokenJson = (await tokenRes.json()) as {
              access_token?: string;
              refresh_token?: string;
              expires_in?: number;
              scope?: string;
            };

            if (!tokenJson.access_token) {
              throw new Error("Google OAuth token exchange failed");
            }

            const chanRes = await fetch(
              "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
              {
                headers: { Authorization: `Bearer ${tokenJson.access_token}` },
              },
            );
            const chanJson = (await chanRes.json()) as {
              items?: Array<{ id: string; snippet?: { title?: string; customUrl?: string } }>;
            };

            const channel = chanJson.items?.[0];
            const accountName =
              channel?.snippet?.customUrl || channel?.snippet?.title || "YouTube Channel";
            const externalId = channel?.id || "mine";

            await db
              .delete(socialConnections)
              .where(
                and(
                  eq(socialConnections.userId, userId),
                  eq(socialConnections.platform, "youtube_shorts"),
                ),
              );

            await db.insert(socialConnections).values({
              id: `conn-${userId}-youtube_shorts`,
              userId,
              platform: "youtube_shorts",
              accountName,
              externalAccountId: externalId,
              accessToken: tokenJson.access_token,
              refreshToken: tokenJson.refresh_token ?? null,
              tokenExpiresAt: tokenJson.expires_in
                ? new Date(Date.now() + tokenJson.expires_in * 1000)
                : null,
              scopes: tokenJson.scope ?? null,
              metadata: { youtubePrivacy: "public" },
            });
          }

          return Response.redirect(
            `${baseUrl}/admin/socials?tab=settings&connected=${rawPlatform}`,
            302,
          );
        } catch (err) {
          const msg = encodeURIComponent(
            err instanceof Error ? err.message : "OAuth connection failed",
          );
          return Response.redirect(
            `${baseUrl}/admin/socials?tab=settings&oauth_error=${msg}`,
            302,
          );
        }
      },
    },
  },
});
