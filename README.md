# LIL SBD (`lilsbd.com`)

Official web platform & admin social media studio built with **TanStack Start**, **Drizzle ORM (SQLite)**, **Better Auth**, and **Tailwind CSS v4**.

---

## Quick Start

```bash
bun install
cp .env.example .env
bun --bun run dev
```

Run tests & production build:

```bash
bun --bun run test
bun --bun run build
```

---

## Direct Native Social Media Publishing Setup (Dev-End Guide)

The `/admin/socials` command center supports **100% direct native pre-programming & publishing** to **YouTube Shorts**, **Instagram Reels**, and **TikTok** directly from your server — **without third-party SaaS subscriptions or public App Review / Audits** when used for your own creator accounts in developer mode.

### 0. Base `.env` Configuration

Copy `.env.example` to `.env` and fill in your credentials as you create each app below:

```env
BETTER_AUTH_SECRET="replace-with-a-random-32-char-secret"
BETTER_AUTH_URL="http://localhost:3000"

# Used by Instagram Reels Graph API to fetch local video uploads when testing on localhost
# (Run `npx cloudflared tunnel --url http://localhost:3000` when testing IG Reels locally)
PUBLIC_APP_URL="http://localhost:3000"

# 1. YouTube Shorts (Google Cloud Console)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# 2. Instagram Reels (Meta for Developers)
META_APP_ID=""
META_APP_SECRET=""

# 3. TikTok (TikTok for Developers)
TIKTOK_CLIENT_KEY=""
TIKTOK_CLIENT_SECRET=""
```

---

### 1. YouTube Shorts Setup (Google Cloud Console — Dev / Testing Mode)

> **Why Dev Mode works:** Google Cloud's **Testing** publishing status lets your own whitelisted Google account upload via the YouTube Data API v3 immediately without Google OAuth verification.
> *(Note: Until a Google Cloud project is verified, YouTube's API only permits `private` visibility on API uploads; if you want public visibility without verifying the app, flip the uploaded Short from Private to Public in YouTube Studio, or submit the 1-page OAuth verification form later.)*

1. Go to **[Google Cloud Console](https://console.cloud.google.com/)** $\rightarrow$ create a new project (e.g., `lilsbd-socials`).
2. Navigate to **APIs & Services $\rightarrow$ Library**, search for **YouTube Data API v3**, and click **Enable**.
3. Go to **APIs & Services $\rightarrow$ OAuth consent screen**:
   - **User Type**: Select **External** $\rightarrow$ Create.
   - Fill in App Name (`LIL SBD Studio`), User Support Email, and Developer Contact Email.
   - **Scopes**: Click **Add or Remove Scopes** and add:
     - `https://www.googleapis.com/auth/youtube.upload`
     - `https://www.googleapis.com/auth/youtube.readonly`
   - **Test users** *(Critical for Dev Mode)*: Click **+ Add Users** and add the exact Google email address that owns your **YouTube channel**. Leave Publishing status as **Testing**.
4. Go to **APIs & Services $\rightarrow$ Credentials** $\rightarrow$ **+ Create Credentials $\rightarrow$ OAuth client ID**:
   - **Application type**: **Web application**
   - **Authorized redirect URIs**: Add:
     ```text
     http://localhost:3000/api/socials/oauth/youtube_shorts
     ```
   - Click **Create** and copy your **Client ID** and **Client Secret** into `.env`:
     ```env
     GOOGLE_CLIENT_ID="xxxx.apps.googleusercontent.com"
     GOOGLE_CLIENT_SECRET="GOCSPX-xxxx"
     ```
5. Restart `bun --bun run dev`, open `http://localhost:3000/admin/socials` $\rightarrow$ **Catalog & Accounts**, and click **Connect OAuth** on the **YouTube Shorts** card.
   - During the Google login prompt, choose your **YouTube Channel / Brand Account** and check the upload permission boxes.

---

### 2. Instagram Reels Setup (Meta for Developers — Development Mode)

> **Why Dev Mode works:** A Meta App kept in **Development Mode** allows any account listed as an App Admin/Developer/Tester to use `instagram_basic` and `instagram_content_publish` against their own Instagram Creator/Business account with **zero Meta App Review**.

#### Step A — Account Prerequisite (1-time)
1. In the Instagram mobile app, ensure your account is a **Creator** or **Business** account (*Settings $\rightarrow$ Account type and tools*).
2. Link your Instagram account to a **Facebook Page** you admin (*Edit Profile $\rightarrow$ Page $\rightarrow$ Connect or create a Facebook Page*).

#### Step B — Create the Meta Developer App
1. Go to **[Meta for Developers](https://developers.facebook.com/apps/)** $\rightarrow$ **Create App**.
2. Select **Other** $\rightarrow$ **Next** $\rightarrow$ choose **Business** as the app type $\rightarrow$ enter name (`LIL SBD Studio`) $\rightarrow$ **Create App**.
3. Keep the app toggle at the top set to **Development** mode.
4. Go to **App Settings $\rightarrow$ Basic** and copy your **App ID** and **App Secret** into `.env`:
   ```env
   META_APP_ID="your_meta_app_id"
   META_APP_SECRET="your_meta_app_secret"
   ```

#### Step C — Connect Your Account (2 Ways)
- **Option 1: Fastest Dev Method (Graph API Explorer Token Paste — No Redirect URI needed)**
  1. Open **[Meta Graph API Explorer](https://developers.facebook.com/tools/explorer/)**.
  2. In the right sidebar, select your **Meta App** (`LIL SBD Studio`) and under **User or Page** select **Get User Access Token**.
  3. Add these permissions:
     - `instagram_basic`
     - `instagram_content_publish`
     - `pages_show_list`
     - `pages_read_engagement`
     - `business_management`
  4. Click **Generate Access Token** and approve the popup (select both your Facebook Page and Instagram account).
  5. Copy the generated token $\rightarrow$ go to `/admin/socials` $\rightarrow$ **Catalog & Accounts** $\rightarrow$ click **Setup Token** on **Instagram Reels**:
     - Leave **IG Business ID** set to `auto`.
     - Paste the token and click **Save Account**.
     - Your server will automatically exchange the short-lived token for a **60-day long-lived token** (using `META_APP_ID` + `META_APP_SECRET`) and auto-detect your Instagram Business Account ID & `@handle`!

- **Option 2: 1-Click OAuth Flow**
  1. In your Meta App dashboard, click **Add Product** $\rightarrow$ **Facebook Login for Business** (or **Facebook Login**) $\rightarrow$ **Settings**.
  2. Add to **Valid OAuth Redirect URIs**:
     ```text
     http://localhost:3000/api/socials/oauth/instagram_reels
     ```
  3. In `/admin/socials` $\rightarrow$ **Catalog & Accounts**, click **Connect OAuth** on **Instagram Reels**.

#### Step D — Localhost Video URL Note for Instagram Reels
Unlike TikTok and YouTube (which receive binary `.mp4` uploads directly from your disk), Meta's Reels API (`POST /{ig-user-id}/media`) requires a publicly reachable `video_url` so Meta's servers can download the `.mp4`.
- When running locally on `localhost:3000`, run a free Cloudflare quick tunnel in a second terminal:
  ```bash
  npx cloudflared tunnel --url http://localhost:3000
  ```
- Copy the `https://xxxx.trycloudflare.com` URL into `.env` as `PUBLIC_APP_URL="https://xxxx.trycloudflare.com"`.

---

### 3. TikTok Setup (TikTok for Developers — `http://localhost:3000`, Zero Tunnels)

> **Key Trick for `localhost` (No Cloudflare / No Tunnel needed):**
> In the TikTok Developer Portal, if you choose **Web**, TikTok rejects `http://localhost`. Instead, choose **Desktop** as your platform inside Login Kit — TikTok natively allows `http://localhost:3000/api/socials/oauth/tiktok` on **Desktop** apps using PKCE (which our `/api/socials/oauth/tiktok` route now handles automatically).

#### Step A — Create App & Sandbox in TikTok Developer Portal
1. Go to **[TikTok for Developers](https://developers.tiktok.com/)** → **Manage Apps** → **Connect an App** → enter name (`LIL SBD Studio`).
2. Inside your app, click **Create Sandbox** (top right) → name it `LIL SBD Dev`.
   *(Sandbox mode gives you instant access to all scopes for your own account with zero review).*
3. Go to **Sandbox Settings → Target Users** → click **+ Add Target User** and add your TikTok `@username`.

#### Step B — Add Products & `http://localhost:3000` Redirect URI
1. In your Sandbox (or App) configuration, click **Add Products** and select:
   - **Login Kit**
   - **Content Posting API**
2. Under **Login Kit**:
   - Select **Desktop** as the platform (this unlocks `http://localhost` without HTTPS or Cloudflare).
   - Set **Redirect URI** to:
     ```text
     http://localhost:3000/api/socials/oauth/tiktok
     ```
3. Under **Content Posting API**:
   - Enable **Direct Post** / **Share to TikTok (Video Upload)**.
4. Under **Scopes**, enable:
   - `user.info.basic`
   - `video.upload` *(Inbox Draft Push)*
   - `video.publish` *(Direct Post)*
5. Click **Save / Apply Changes**.

#### Step C — Add Keys to `.env` & Connect
1. Copy your **Client Key** and **Client Secret** from the top of the TikTok app/sandbox page into `.env`:
   ```env
   TIKTOK_CLIENT_KEY="your_client_key"
   TIKTOK_CLIENT_SECRET="your_client_secret"
   ```
2. Restart `bun --bun run dev`, open `http://localhost:3000/admin/socials` → **Catalog & Accounts**, and click **Connect OAuth** on **TikTok**.
3. Log in with the TikTok account you added under Target Users and approve the permissions.

#### How TikTok Publishing Works (`Inbox Draft Push` vs `Direct Post`)
- **Inbox Draft Push (Default & Recommended)**: Uploads your `.mp4` file directly from your computer's hard drive (`FILE_UPLOAD`) to your **TikTok phone app's Inbox / System Notifications**. You open TikTok on your phone, tap the notification, and post it publicly with 1 tap.
- **Direct Post**: Posts directly to your profile without opening the phone app (note: TikTok locks Direct Posts from un-audited dev apps to "Only Me / Private" visibility until the app is audited, which is why **Inbox Draft Push** lets you post **Publicly** right away without an audit).

---

## Publishing & Scheduling Architecture

- **Media Storage**: Uploaded `.mp4` / `.mov` files are saved to `.data/uploads/socials/` and served with HTTP `Range` support at `/api/socials/media/:filename`.
- **In-Process Auto-Scheduler**: [`src/server/social-publisher.server.ts`](./src/server/social-publisher.server.ts) runs a background tick every 60 seconds (`ensureSocialSchedulerStarted()`). Any post with `status = "scheduled"`, `autoPublish = true`, and `scheduledFor <= now` is automatically published to all selected platforms and marked `"posted"` once all platforms succeed.
