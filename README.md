# LIL SBD (`lilsbd.com`)

Official artist site and automated short-form social media studio built with **TanStack Start**, **React 19**, **Drizzle ORM (PostgreSQL / PGlite)**, **Better Auth**, **FFmpeg**, **Gemini AI**, and **Tailwind CSS v4**.

---

## Quick Start

### Prerequisites (Local Development)

- **[Bun](https://bun.sh/)** (`1.3+`)
- **[FFmpeg & ffprobe](https://ffmpeg.org/download.html)** available on your `PATH` *(required for audio BPM/drop analysis, acoustic auto-sync, and 1080×1920 vertical video rendering — already pre-installed in the production [Dockerfile](./Dockerfile))*

```bash
bun install
cp .env.example .env
bun run dev
```

Run tests & production build:

```bash
bun run test
bun run build
```

---

## Environment Variables Overview

Copy `.env.example` to `.env` for local development, or paste these into **Coolify → Environment Variables** for production.

| Variable | Requirement | Purpose | Jump to |
| :--- | :--- | :--- | :--- |
| `BETTER_AUTH_SECRET` | **Required (Prod)** | Signs admin login sessions | [1. Core & Auth](#1-core-app-urls--admin-auth) |
| `BETTER_AUTH_URL` | **Required (Prod)** | Canonical app origin for Better Auth | [1. Core & Auth](#1-core-app-urls--admin-auth) |
| `PUBLIC_APP_URL` | **Required (IG Reels)** | Public HTTPS origin used for OAuth callbacks & Meta video fetch | [1. Core & Auth](#1-core-app-urls--admin-auth) |
| `ADMIN_EMAIL` / `PUBLIC_SIGNUP_ENABLED` | **Recommended (Prod)** | Locks `/admin/login` registration to your email only | [1. Core & Auth](#1-core-app-urls--admin-auth) |
| `DATABASE_URL` | **Recommended (Prod)** | PostgreSQL connection string (auto-falls back to local PGlite if blank) | [2. Database & Storage](#2-database--local-storage) |
| `SOCIAL_DATA_DIR` | Optional | Local data/media folder (default `.data`; `/app/.data` in Docker) | [2. Database & Storage](#2-database--local-storage) |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | **Recommended** | Powers AI dead-air trimming, edit direction & captions | [3. Gemini AI Director](#3-gemini-ai-director--copywriter) |
| `CRON_SECRET` | **Recommended (Prod)** | Secures `POST /api/socials/cron` heartbeat endpoint | [4. Cron & Discord Alerts](#4-unattended-cron-heartbeat--discord-alerts) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional (YT Shorts) | 1-click YouTube Shorts OAuth & auto-refreshing uploads | [5. YouTube Shorts](#5-youtube-shorts-google-cloud-console) |
| `META_APP_ID` / `META_APP_SECRET` | Optional (IG Reels) | Instagram Reels OAuth & 60-day long-lived token exchange | [6. Instagram Reels](#6-instagram-reels-meta-for-developers) |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | Optional (TikTok) | TikTok OAuth & Inbox Draft Push / Direct Post | [7. TikTok](#7-tiktok-tiktok-for-developers) |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` | Optional | Offloads permanent renders & masters to Cloudflare R2 / S3 | [8. Cloudflare R2 / S3](#8-optional-object-storage-cloudflare-r2--hetzner-s3) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Optional | "Sign in with GitHub" button on `/admin/login` | [9. Admin Login OAuth](#9-optional-admin-login-oauth-github--discord) |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Optional | "Sign in with Discord" button on `/admin/login` | [9. Admin Login OAuth](#9-optional-admin-login-oauth-github--discord) |
| `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` | Optional | Public site analytics (build-time client env vars) | [10. PostHog Analytics](#10-optional-posthog-analytics) |

> **Tip:** Once the app is running, open **`/admin/socials/settings`** and scroll to **Production Readiness Diagnostics** to verify every integration live.

---

## Step-by-Step Environment Variable Tutorial

### 1. Core App, URLs & Admin Auth

These control Better Auth session signing, OAuth callback URLs, and who is allowed to create an admin account at `/admin/login`.

```env
BETTER_AUTH_SECRET="replace-with-a-64-char-random-hex-secret"
BETTER_AUTH_URL="https://lilsbd.com"
PUBLIC_APP_URL="https://lilsbd.com"

# Lock studio registration strictly to your own email in production
ADMIN_EMAIL="you@lilsbd.com"
PUBLIC_SIGNUP_ENABLED="false"
```

1. **Generate `BETTER_AUTH_SECRET`** (run in any terminal):
   ```bash
   openssl rand -hex 32
   ```
   *(PowerShell alternative: `-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })`)*
2. **Set `BETTER_AUTH_URL` and `PUBLIC_APP_URL`**:
   - **Local dev**: `http://localhost:3000`
   - **Production**: Your exact HTTPS domain with no trailing slash (e.g., `https://lilsbd.com`).
   - `PUBLIC_APP_URL` is used to build OAuth redirect URIs, Discord alert links, and the public `.mp4` URL Meta fetches when publishing Instagram Reels.
3. **Lock down admin signups (`ADMIN_EMAIL` + `PUBLIC_SIGNUP_ENABLED`)**:
   - Set `ADMIN_EMAIL` to your personal login email and `PUBLIC_SIGNUP_ENABLED="false"`.
   - Only that exact email will be allowed to register at `/admin/login`; anyone else gets a `403 FORBIDDEN`.
   - Leave `PUBLIC_SIGNUP_ENABLED="true"` if you ever want to open multi-producer workspaces.

---

### 2. Database & Local Storage

```env
DATABASE_URL="postgresql://postgres:password@your-postgres-host:5432/lil_sbd"
SOCIAL_DATA_DIR=".data"
```

- **`DATABASE_URL` (PostgreSQL)**:
  - **Local dev**: You can leave `DATABASE_URL` empty (or at the default placeholder). The app automatically boots an embedded persistent **PGlite** Postgres database in `.data/pglite` with zero setup.
  - **Production (Coolify / Neon / Supabase / Railway)**:
    1. Create a PostgreSQL database (in Coolify: **+ New Resource → Database → PostgreSQL**).
    2. Copy the internal or external `postgresql://...` connection string into `DATABASE_URL`.
    3. All tables and columns auto-initialize cleanly on first boot via `ensureSchemaInitialized()` in [`src/db/index.ts`](./src/db/index.ts).
- **`SOCIAL_DATA_DIR`**:
  - Directory where uploaded raw clips, rendered vertical MP4s, thumbnails, demo masters, and FFmpeg scratch files live when using local disk storage.
  - Defaults to `.data` locally and `/app/.data` inside Docker ([`Dockerfile`](./Dockerfile) already sets `ENV SOCIAL_DATA_DIR=/app/.data`).
  - **On Coolify**: You do **not** need to set `SOCIAL_DATA_DIR` manually — just mount a persistent volume with **Destination Path** set to `/app/.data` (see [Step 3 of the Coolify Guide](#step-3--persistent-storage-storages-tab) below).

---

### 3. Gemini AI Director & Copywriter

Gemini inspects a tiny `360p @ 2fps` muted proxy of your raw clip alongside your track's DSP BPM/Drop/Highlight markers to trim camera walk-up/walk-away dead air, choose the best drop window and FX preset, and write direct, non-corny music copy.

```env
GEMINI_API_KEY="AIzaSy..."
GEMINI_MODEL="gemini-2.5-flash"
```

1. Go to **[Google AI Studio](https://aistudio.google.com/apikey)** and sign in with your Google account.
2. Click **Create API key** → select or create a Google Cloud project → copy the key (`AIzaSy...`).
3. Paste it into `GEMINI_API_KEY`.
4. **`GEMINI_MODEL`** (optional):
   - Defaults to `gemini-2.5-flash` if omitted.
   - You can change it via `GEMINI_MODEL` in `.env` **or** override it anytime without redeploying in **`/admin/socials/settings` → Gemini Model Override**.
5. **What happens if `GEMINI_API_KEY` is unset or rate-limited?**
   - Auto-editing still works using the deterministic DSP fallback, and if **Full Autopilot** is enabled, the safety net automatically holds the clip in the Review Inbox instead of auto-publishing template copy.

---

### 4. Unattended Cron Heartbeat & Discord Alerts

The background worker boots automatically when the server starts ([`src/server.ts`](./src/server.ts)), draining queued renders, firing scheduled posts, and pruning expired media. Adding `CRON_SECRET` + a Discord webhook makes unattended VPS/Coolify publishing bulletproof.

```env
CRON_SECRET="replace-with-another-random-32-char-secret"
```

#### Step A — Set `CRON_SECRET` & Coolify Scheduled Ping
1. Generate a random secret (`openssl rand -hex 32`) and save it as `CRON_SECRET`.
2. In Coolify (or Uptime Kuma / cron-job.org / GitHub Actions), create a cron job running every **5 minutes** (`*/5 * * * *`):
   ```bash
   curl -fsS -X POST "https://lilsbd.com/api/socials/cron" \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```
   *(Also accepts `x-cron-secret: YOUR_CRON_SECRET` header or `?secret=YOUR_CRON_SECRET` query parameter via `GET` or `POST`.)*
3. Each ping verifies the worker is running, enqueues any due Autopilot posts, checks expiring tokens, drains up to 5 jobs, and returns a JSON status summary.

#### Step B — Configure Discord Webhook Alerts (Stored in Studio Settings)
Discord webhooks are stored per-profile in `/admin/socials/settings` (no redeploy needed):
1. In your private Discord server, open **Channel Settings → Integrations → Webhooks → New Webhook**.
2. Name it `Lil SBD Autopilot`, click **Copy Webhook URL** (`https://discord.com/api/webhooks/...`).
3. Open **`/admin/socials/settings`** → paste the URL into **Discord Webhook Alerts** → click **Send Test Alert** → click **Save Defaults**.
4. You'll receive instant phone pings whenever:
   - Full Autopilot holds a clip in Review (e.g., low sync confidence or Gemini fallback)
   - A scheduled publish fails after retries
   - A TikTok draft hits your phone's TikTok Inbox (includes the ready-to-paste caption)
   - A connected social token is expiring within 7 days or expired (deduplicated once per 24h)

---

### 5. YouTube Shorts (Google Cloud Console)

```env
GOOGLE_CLIENT_ID="xxxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxxx"
```
*(Aliases `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` are also supported.)*

> **Dev / Testing Mode Note:** Google Cloud's **Testing** publishing status lets your own whitelisted Google account upload via YouTube Data API v3 immediately with zero Google review. Note that until a Google Cloud project is verified, YouTube forces API-uploaded videos to `private` until you flip visibility in YouTube Studio (or complete YouTube's standard API audit for direct `public` uploads).

1. Go to **[Google Cloud Console](https://console.cloud.google.com/)** → create a project (e.g., `lilsbd-socials`).
2. Navigate to **APIs & Services → Library**, search for **YouTube Data API v3**, and click **Enable**.
3. Go to **APIs & Services → OAuth consent screen** (or **Google Auth Platform → Audience / Branding**):
   - **User Type**: **External**.
   - Fill in App Name (`LIL SBD Studio`), User Support Email, and Developer Contact Email.
   - **Scopes**: Add:
     - `https://www.googleapis.com/auth/youtube.upload`
     - `https://www.googleapis.com/auth/youtube.readonly`
   - **Test users**: Click **+ Add Users** and add the exact Google email that owns your YouTube channel. Keep status as **Testing**.
4. Go to **APIs & Services → Credentials → + Create Credentials → OAuth client ID**:
   - **Application type**: **Web application**
   - **Authorized redirect URIs** — add both local and production URLs:
     ```text
     http://localhost:3000/api/socials/oauth/youtube_shorts
     https://lilsbd.com/api/socials/oauth/youtube_shorts
     ```
   - Click **Create** and copy **Client ID** and **Client Secret** into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. Restart the app, open **`/admin/socials/settings`**, and click **Connect OAuth** on the **YouTube Shorts** card. Choose your YouTube channel/Brand Account and approve the scopes — Google issues an offline refresh token that auto-refreshes transparently.

---

### 6. Instagram Reels (Meta for Developers)

```env
META_APP_ID="your_meta_app_id"
META_APP_SECRET="your_meta_app_secret"
```
*(Aliases `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET` are also supported.)*

> **Development Mode Note:** Keeping your Meta app in **Development Mode** (with permissions at **Standard Access**) lets you publish directly to your own Instagram Creator/Business account with **zero Meta App Review** and **no Business Verification**.

#### Step A — Account Prerequisite (1-Time)
1. In the Instagram mobile app, switch your account to **Creator** or **Business** (*Settings → Account type and tools*).
2. Link your Instagram account to a **Facebook Page** you admin (*Edit Profile → Page → Connect or create a Facebook Page*).

#### Step B — Create the Meta App (Current Use-Case Wizard)
1. Go to **[Meta for Developers](https://developers.facebook.com/apps/)** and click **Create App**.
2. **App details**: Enter an App name (e.g. `LIL SBD Studio`) and your contact email → **Next**.
3. **Use cases** (*"What do you want your app to do?"*):
   - Select **`Manage messaging & content on Instagram`** *(this bundles the Instagram Graph API & Facebook Login for Business)*.
   - If you also see **`Manage everything on your Page`**, you can select it too so Page permissions (`pages_show_list`, `pages_read_engagement`) are added automatically.
   - Click **Next**.
4. **Business portfolio**:
   - Select your **Meta Business Portfolio** if you already have one, **or** choose **I don't want to connect a business portfolio yet** (not required while staying in Development Mode for your own account) → **Next**.
5. **Requirements / Overview**: Review and click **Go to dashboard** to create the app. Keep the app in **Development** mode.

#### Step C — Pick the Right API Setup & Add Permissions
Inside your new App Dashboard, Meta now offers three different Instagram login setups. **Pick the right one so it matches this app's `graph.facebook.com` OAuth & Reels publisher:**

| Meta Dashboard Option | Use for this app? | Why |
| :--- | :--- | :--- |
| **API setup with Facebook login** | **YES — pick this** | Uses `graph.facebook.com`, Facebook OAuth (`META_APP_ID` / `META_APP_SECRET`), and standard `instagram_content_publish` scopes — matches [`oauth.$platform.ts`](./src/routes/api/socials/oauth.$platform.ts) and [`social-publisher.server.ts`](./src/server/social-publisher.server.ts). |
| **API setup with Unified login** | **No — skip** | Requires a verified Business Portfolio + a Facebook Login for Business `config_id`. Not needed for your own artist account. |
| **API setup with Instagram login** | **No — skip** | Uses separate `graph.instagram.com` endpoints & `instagram_business_*` token formats, which this app does not call. |

1. In the left sidebar, open **Use cases → `Manage messaging & content on Instagram` → Customize**.
2. Choose **`API setup with Facebook login`** *(ignore the "Unified login" and "Instagram login" prompts)*.
3. Under **Permissions** in that Customize screen (and under **`Manage everything on your Page` → Customize** if you added it), click **Add** on:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_show_list`
   - `pages_read_engagement`
   - `business_management` *(add if shown / if your Page is inside a Business Portfolio)*
   *(Leave all of them at **Standard Access** — do not submit for App Review.)*
4. In the left sidebar, go to **App settings → Basic**, click **Show** next to App secret, and copy **App ID** and **App secret** into your `.env` / Coolify env vars:
   ```env
   META_APP_ID="your_meta_app_id"
   META_APP_SECRET="your_meta_app_secret"
   ```

#### Step D — Configure Redirect URI & Connect Your Account
- **Option 1: 1-Click OAuth (Recommended for Production)**
  1. In the left sidebar, go to **Use cases → Customize** (or **Facebook Login for Business → Settings**).
  2. Under **Valid OAuth Redirect URIs**, add both your local and production callback URLs and click **Save changes**:
     ```text
     http://localhost:3000/api/socials/oauth/instagram_reels
     https://lilsbd.com/api/socials/oauth/instagram_reels
     ```
  3. Open **`/admin/socials/settings`** in your app and click **Connect OAuth** on the **Instagram Reels** card.
  4. In the Meta login popup, select **both** your **Facebook Page** and your linked **Instagram account** and approve. The server automatically exchanges the code for a **60-day long-lived token** and detects your Instagram Business Account ID & `@handle`.

- **Option 2: Fastest Dev Workaround (Graph API Explorer Token Paste — No Redirect URI Needed)**
  1. Open **[Meta Graph API Explorer](https://developers.facebook.com/tools/explorer/)**.
  2. In the right sidebar, select your **Meta App** (`LIL SBD Studio`) and under **User or Page** choose **Get User Access Token**.
  3. Add these permissions: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `business_management`.
  4. Click **Generate Access Token**, approve your Page & Instagram account, and copy the token.
  5. Open **`/admin/socials/settings`** → click **Setup Token** on **Instagram Reels**, leave **IG Business ID** as `auto`, paste the token, and click **Save Account**. Your server automatically exchanges it for a **60-day long-lived token**.

#### Step E — Public HTTPS Requirement for Instagram Reels
Meta's Reels API (`POST /{ig-user-id}/media`) requires a publicly reachable HTTPS `video_url` so Meta's servers can download your rendered `.mp4`.
- **Production**: Set `PUBLIC_APP_URL="https://lilsbd.com"` (or use Cloudflare R2 with `S3_PUBLIC_URL`).
- **Local testing**: Run a free temporary tunnel in a second terminal:
  ```bash
  npx cloudflared tunnel --url http://localhost:3000
  ```
  Then set `PUBLIC_APP_URL="https://xxxx.trycloudflare.com"` in `.env` and restart.

> **60-Day Renewal Note:** Meta long-lived tokens expire after ~60 days without a refresh token. With Discord alerts enabled, the studio automatically pings you 7 days before expiry so you can click **Reconnect OAuth** in 10 seconds.

---

### 7. TikTok (TikTok for Developers)

```env
TIKTOK_CLIENT_KEY="your_tiktok_client_key"
TIKTOK_CLIENT_SECRET="your_tiktok_client_secret"
```

> **Localhost Trick (No Tunnel Needed):** TikTok's **Web** platform rejects `http://localhost`, but TikTok's **Desktop** platform inside Login Kit natively allows `http://localhost:3000/api/socials/oauth/tiktok` with PKCE (handled automatically by [`oauth.$platform.ts`](./src/routes/api/socials/oauth.$platform.ts)). For production (`https://lilsbd.com`), configure **Web** with your HTTPS callback URL.

1. Go to **[TikTok for Developers](https://developers.tiktok.com/)** → **Manage Apps → Connect an App** (`LIL SBD Studio`).
2. Click **Create Sandbox** (top right) for instant dev testing without audit, then go to **Sandbox Settings → Target Users** and add your TikTok `@username`.
3. Click **Add Products** and enable:
   - **Login Kit**
   - **Content Posting API**
4. Under **Login Kit**, add your **Redirect URI**:
   - Local dev (**Desktop** platform): `http://localhost:3000/api/socials/oauth/tiktok`
   - Production (**Web** platform): `https://lilsbd.com/api/socials/oauth/tiktok`
5. Under **Scopes**, enable:
   - `user.info.basic`
   - `video.upload` *(Inbox Draft Push)*
   - `video.publish` *(Direct Post)*
6. Click **Save / Apply Changes**, copy **Client Key** and **Client Secret** into `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`.
7. Restart the app, open **`/admin/socials/settings`**, and click **Connect OAuth** on **TikTok**.

#### Inbox Draft Push vs. Direct Post
- **Inbox Draft Push (Default & Recommended)**: Uploads your rendered `.mp4` directly from your server to your TikTok app's Inbox notifications (and pings your Discord with the caption). Works **publicly** right away without waiting for TikTok's app audit — open TikTok on your phone and tap Post.
- **Direct Post**: Publishes straight to your profile, but TikTok restricts unaudited apps to `SELF_ONLY` (private) posts until your app passes TikTok Content Posting API audit. Switch modes anytime via **Settings / Token** on the TikTok card.

---

### 8. Optional Object Storage (Cloudflare R2 / Hetzner S3)

Leave these blank to use local disk storage (`SOCIAL_DATA_DIR`, zero extra setup). Fill all 6 variables to store permanent renders, thumbnails, and track masters on **Cloudflare R2** (10 GB free tier, $0 egress) or any S3-compatible bucket:

```env
S3_ENDPOINT="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
S3_BUCKET="lilsbd-media"
S3_REGION="auto"
S3_ACCESS_KEY_ID="your_r2_access_key_id"
S3_SECRET_ACCESS_KEY="your_r2_secret_access_key"
S3_PUBLIC_URL="https://media.lilsbd.com"
```

#### Cloudflare R2 Quick Setup
1. In the **[Cloudflare Dashboard](https://dash.cloudflare.com/)**, go to **R2 Object Storage → Create bucket** (e.g., `lilsbd-media`).
2. Inside the bucket's **Settings → Public Access**:
   - Either attach a custom domain (e.g., `https://media.lilsbd.com`) **or** enable the `r2.dev` public URL.
   - Paste that public base URL (no trailing slash) into `S3_PUBLIC_URL`.
3. Go to **R2 → Manage R2 API Tokens → Create API token**:
   - Permission: **Object Read & Write** scoped to your `lilsbd-media` bucket.
   - Copy **Access Key ID** → `S3_ACCESS_KEY_ID`, **Secret Access Key** → `S3_SECRET_ACCESS_KEY`, and the S3 endpoint URL (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`) → `S3_ENDPOINT`.
4. Set `S3_REGION="auto"` and `S3_BUCKET="lilsbd-media"`.

---

### 9. Optional Admin Login OAuth (GitHub & Discord)

Email + password login works out of the box. Add these only if you also want 1-click **GitHub** or **Discord** buttons on `/admin/login`:

```env
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""

DISCORD_CLIENT_ID=""
DISCORD_CLIENT_SECRET=""
```

- **GitHub OAuth App** (*GitHub → Settings → Developer settings → OAuth Apps → New OAuth App*):
  - **Authorization callback URL**:
    - Local: `http://localhost:3000/api/auth/callback/github`
    - Prod: `https://lilsbd.com/api/auth/callback/github`
- **Discord OAuth2 App** (*[Discord Developer Portal](https://discord.com/developers/applications) → OAuth2 → Redirects*):
  - **Redirect URI**:
    - Local: `http://localhost:3000/api/auth/callback/discord`
    - Prod: `https://lilsbd.com/api/auth/callback/discord`

---

### 10. Optional PostHog Analytics

Used for anonymous public website analytics (configured in [`src/integrations/posthog/provider.tsx`](./src/integrations/posthog/provider.tsx)):

```env
VITE_POSTHOG_KEY="phc_..."
VITE_POSTHOG_HOST="https://eu.i.posthog.com"
```

1. In **[PostHog](https://eu.posthog.com/)**, open **Project Settings → Project API Key** (`phc_...`).
2. Paste into `VITE_POSTHOG_KEY` and set `VITE_POSTHOG_HOST` (`https://eu.i.posthog.com` for EU Cloud or `https://us.i.posthog.com` for US Cloud).
3. Because `VITE_*` variables are bundled into client assets at build time, mark them as **Build Variables** in Coolify if you enable them.

---

## Coolify / VPS Production Deployment Guide

Follow these exact field-by-field steps when deploying on Coolify.

### Step 1 — Create PostgreSQL Database (Recommended)

1. In your Coolify Project/Environment, click **+ New Resource → Database → PostgreSQL** (PostgreSQL 16 or 17) and click **Start**.
2. Open the Postgres resource → copy the **Postgres URL (internal)** (looks like `postgresql://postgres:...@<container-name>:5432/postgres`).
   - Use the **internal** URL when the app and Postgres are on the same Coolify server (faster and never exposed publicly).
   - *(Optional fallback: if you skip creating Postgres and leave `DATABASE_URL` empty, the app automatically uses an embedded PGlite Postgres database inside `/app/.data/pglite` — still requires Step 3's persistent volume.)*

### Step 2 — Create the Application (`General` tab)

1. Click **+ New Resource → Public/Private Git Repository** and select this repo.
2. Set these exact values under **Configuration → General**:
   - **Build Pack**: `Dockerfile`
   - **Dockerfile Location**: `/Dockerfile` *(already bundles Bun build, Node 22 runtime, native `ffmpeg`/`ffprobe`, and DejaVu fonts)*
   - **Domains**: `https://lilsbd.com` *(HTTPS is mandatory for Instagram Reels and OAuth callbacks)*
   - **Network → Ports Exposes**: `3000` *(matches `ENV PORT=3000` & `EXPOSE 3000` in [`Dockerfile`](./Dockerfile))*

### Step 3 — Persistent Storage (`Storages` tab)

The container's working directory is `/app`, and [`Dockerfile`](./Dockerfile) pre-sets `ENV SOCIAL_DATA_DIR=/app/.data`. All raw clips, rendered MP4s, thumbnails, demo masters, and scratch files are stored inside **`/app/.data`**.

Go to **Configuration → Storages → + Add**:

- **Option A — Volume Mount *(Recommended — easiest, zero permission issues)***
  - **Name**: `lilsbd-data` *(any unique volume name)*
  - **Destination Path** *(path inside container)*:
    ```text
    /app/.data
    ```
- **Option B — Bind Mount *(only if you want to browse files directly on your VPS host)***
  - **Source Path** *(folder on your VPS)*:
    ```text
    /data/lilsbd
    ```
  - **Destination Path** *(path inside container)*:
    ```text
    /app/.data
    ```

> **Common gotchas to avoid:**
> - **Always use the full absolute path `/app/.data`** for **Destination Path** — never `.data` (Docker rejects relative mount paths).
> - **Do not set `SOCIAL_DATA_DIR=".data"`** in Coolify env vars. Leave `SOCIAL_DATA_DIR` unset (it inherits `/app/.data` from the Dockerfile) or set it explicitly to `/app/.data` so it matches the mount destination 1:1.
> - **Click Redeploy** after adding or changing any storage mount so Docker attaches the volume.

### Step 4 — Environment Variables (`Environment Variables` tab)

Click **Developer View** in Coolify's **Environment Variables** tab and paste your production values (remove any optional lines you don't use):

```env
# Required Core & Auth (no trailing slash on URLs)
BETTER_AUTH_SECRET=paste-your-64-char-hex-secret
BETTER_AUTH_URL=https://lilsbd.com
PUBLIC_APP_URL=https://lilsbd.com
ADMIN_EMAIL=you@lilsbd.com
PUBLIC_SIGNUP_ENABLED=false

# Database (internal Coolify Postgres URL from Step 1)
DATABASE_URL=postgresql://postgres:password@your-postgres-container:5432/postgres

# AI Director & Copywriter
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-2.5-flash

# Unattended Autopilot Cron Heartbeat
CRON_SECRET=paste-another-64-char-hex-secret

# Direct Social Publishing (add the platforms you want)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
META_APP_ID=...
META_APP_SECRET=...
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...

# Optional: Cloudflare R2 / S3 (leave omitted to use /app/.data volume)
# S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
# S3_BUCKET=lilsbd-media
# S3_REGION=auto
# S3_ACCESS_KEY_ID=...
# S3_SECRET_ACCESS_KEY=...
# S3_PUBLIC_URL=https://media.lilsbd.com
```

> **Coolify UI notes:**
> - **No trailing slashes** on `BETTER_AUTH_URL` or `PUBLIC_APP_URL` (`https://lilsbd.com`, not `https://lilsbd.com/`).
> - If entering values one-by-one in Coolify's form (instead of **Developer View**), do **not** wrap values in quotes `"..."`.
> - If you enable `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST`, open each variable's settings in Coolify and check **Available at Buildtime** (all other variables are runtime-only).

### Step 5 — Scheduled Heartbeat (`Scheduled Tasks` tab)

The background worker boots automatically on container startup, and adding a 5-minute Coolify Scheduled Task guarantees scheduled posts still fire immediately even right after a cold restart or idle period.

Go to **Configuration → Scheduled Tasks → + Add**:

- **Name**: `Autopilot Heartbeat`
- **Frequency**: `*/5 * * * *` *(every 5 minutes)*
- **Container Name**: *(leave blank — targets your app container automatically)*
- **Command**:
  ```sh
  node -e "fetch('http://127.0.0.1:3000/api/socials/cron',{method:'POST',headers:{Authorization:'Bearer '+process.env.CRON_SECRET}}).then(async r=>{const t=await r.text();console.log(r.status,t);if(!r.ok)process.exit(1)})"
  ```
  *(Uses `node` directly instead of `curl` because the slim `node:22-bookworm-slim` image doesn't bundle `curl`, and reads `CRON_SECRET` straight from the container environment without hardcoding it.)*

*(Alternatively, ping `POST https://lilsbd.com/api/socials/cron` with header `Authorization: Bearer <CRON_SECRET>` from an external monitor like Uptime Kuma.)*

### Step 6 — Deploy & First-Time Studio Setup

1. Click **Deploy** in Coolify and wait for the container to go healthy.
2. Visit `https://lilsbd.com/admin/login` and create your admin account using your exact `ADMIN_EMAIL`.
3. Open **`https://lilsbd.com/admin/socials/settings`**:
   - Scroll to **Production Readiness Diagnostics** and confirm every row shows **Ready** (`FFmpeg`, `Gemini`, `Public HTTPS`, `Storage`, `Cron Heartbeat`, `Discord Alerts`).
   - Paste your **Discord Webhook URL** → click **Send Test Alert** → check **Full Autopilot by default** → click **Save Defaults**.
   - Click **Sync Releases from Site** → **Analyze All (v2)** to populate BPM, drops, and highlights for your catalog.
   - Click **Connect OAuth** on **YouTube Shorts**, **Instagram Reels**, and **TikTok** (make sure you added the `https://lilsbd.com/api/socials/oauth/<platform>` redirect URIs in each developer portal).
4. **Daily Flow**: Open `https://lilsbd.com/admin/socials` on your phone → pick your track → drop 1–6 dancing clips → walk away.

---

## Studio Architecture

- **Nested Studio Routes**:
  - `/admin/socials` — Drop Zone + Review Inbox ([`src/routes/admin.socials.index.tsx`](./src/routes/admin.socials.index.tsx))
  - `/admin/socials/queue` — Autopilot Cadence Calendar, Upcoming Drops & Worker Log ([`src/routes/admin.socials.queue.tsx`](./src/routes/admin.socials.queue.tsx))
  - `/admin/socials/settings` — Cadence Defaults, Discord Alerts, Social OAuth, Audio Brain v2 Catalog & Readiness Diagnostics ([`src/routes/admin.socials.settings.tsx`](./src/routes/admin.socials.settings.tsx))
- **Full Autopilot Safety Net**: Auto-approves & schedules renders when acoustic sync is `>= 35%` across all takes and Gemini AI succeeds; holds clips in Review Inbox (and pings Discord) if sync falls back or Gemini is unavailable.
- **Persistent Worker & Conveyor-Belt Cleanup**: Boots on server start ([`src/server.ts`](./src/server.ts)) + `/api/socials/cron` heartbeat ([`src/routes/api/socials/cron.ts`](./src/routes/api/socials/cron.ts)), retries failed jobs with exponential backoff, and automatically prunes expired raw takes & old renders based on your retention settings.
