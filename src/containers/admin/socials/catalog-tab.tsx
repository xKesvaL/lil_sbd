import {
  IconCheck,
  IconCopy,
  IconDisc,
  IconEdit,
  IconKey,
  IconLoader2,
  IconPlugConnected,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUpload,
  IconWaveSine,
  IconX,
} from "@tabler/icons-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import type {
  ArtistCatalogItemRecord,
  ArtistProfileRecord,
  CatalogItemType,
  HashtagPresetRecord,
  PublishablePlatform,
} from "#/db/schema";
import { cn } from "#/lib/utils";
import {
  analyzeAllCatalogTracksServerFn,
  analyzeCatalogTrackServerFn,
  createHashtagPresetServerFn,
  deleteCatalogItemServerFn,
  deleteHashtagPresetServerFn,
  disconnectSocialAccountServerFn,
  syncLilSbdCatalogServerFn,
  testSocialConnectionServerFn,
  updateArtistProfileServerFn,
  upsertCatalogItemServerFn,
  upsertSocialConnectionServerFn,
} from "#/server/socials";
import type { SafeSocialConnection } from "./publishing-copilot-sheet";
import { PLATFORM_META, PUBLISHABLE_PLATFORMS } from "./social-constants";

interface StorageStatsSummary {
  storageMode: "s3_r2" | "local_nvme";
  dataDir: string;
  totalBytes: number;
  byNamespace: Record<string, { files: number; bytes: number }>;
}

interface CatalogTabProps {
  profile: ArtistProfileRecord;
  catalog: ArtistCatalogItemRecord[];
  hashtagPresets: HashtagPresetRecord[];
  connections: SafeSocialConnection[];
  oauthEnvConfigured: Record<PublishablePlatform, boolean>;
  storageStats?: StorageStatsSummary;
  onRefresh: () => Promise<void>;
}

function formatSec(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

function formatMb(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const PLATFORM_SETUP_GUIDES: Record<
  PublishablePlatform,
  {
    idLabel: string;
    idPlaceholder: string;
    tokenLabel: string;
    helperText: string;
    oauthEnvHint: string;
  }
> = {
  instagram_reels: {
    idLabel: "IG Business ID (or 'auto' to auto-detect)",
    idPlaceholder: "auto (or e.g. 17841405822304914)",
    tokenLabel: "Meta Access Token (Graph API Explorer or Long-Lived)",
    helperText:
      "Works in Meta App Development Mode without App Review. Paste a token from Graph API Explorer with instagram_basic, instagram_content_publish, pages_show_list & leave ID as 'auto'.",
    oauthEnvHint: "META_APP_ID & META_APP_SECRET",
  },
  tiktok: {
    idLabel: "TikTok Open ID (or 'auto' to auto-detect)",
    idPlaceholder: "auto (or @lilsbd)",
    tokenLabel: "TikTok OAuth Access Token",
    helperText:
      "Default mode is 'Inbox Draft Push' (video.upload scope) which uploads the .mp4 from local disk to your TikTok mobile app notifications (bypasses unaudited SELF_ONLY locks).",
    oauthEnvHint: "TIKTOK_CLIENT_KEY & TIKTOK_CLIENT_SECRET",
  },
  youtube_shorts: {
    idLabel: "YouTube Channel ID (or 'auto')",
    idPlaceholder: "auto",
    tokenLabel: "Google OAuth Access Token",
    helperText:
      "Uploads vertical videos with #Shorts via YouTube Data API v3. In Google Cloud 'Testing' mode, add your email under Test Users.",
    oauthEnvHint: "GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET",
  },
};

export function CatalogTab({
  profile,
  catalog,
  hashtagPresets,
  connections,
  oauthEnvConfigured,
  storageStats,
  onRefresh,
}: CatalogTabProps) {
  // Social Account Setup Modal / Panel State
  const [configuringPlatform, setConfiguringPlatform] =
    useState<PublishablePlatform | null>(null);
  const [testingPlatform, setTestingPlatform] =
    useState<PublishablePlatform | null>(null);
  const [isSavingConnection, setIsSavingConnection] = useState(false);

  const [connAccountName, setConnAccountName] = useState("");
  const [connExternalId, setConnExternalId] = useState("");
  const [connAccessToken, setConnAccessToken] = useState("");
  const [connRefreshToken, setConnRefreshToken] = useState("");
  const [connTiktokMode, setConnTiktokMode] = useState<"inbox" | "direct">("inbox");
  const [connYoutubePrivacy, setConnYoutubePrivacy] = useState<
    "public" | "unlisted" | "private"
  >("public");

  // Artist Profile form state
  const [stageName, setStageName] = useState(profile.stageName);
  const [genre, setGenre] = useState(profile.genre);
  const [defaultBioLink, setDefaultBioLink] = useState(profile.defaultBioLink);
  const [weeklyPostTarget, setWeeklyPostTarget] = useState(
    profile.weeklyPostTarget || 5,
  );
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Catalog Item form state
  const [showAddTrack, setShowAddTrack] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | undefined>(
    undefined,
  );
  const [itemType, setItemType] = useState<CatalogItemType>("track");
  const [itemTitle, setItemTitle] = useState("");
  const [itemAlbum, setItemAlbum] = useState("");
  const [itemReleaseDate, setItemReleaseDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [itemBpm, setItemBpm] = useState(200);
  const [itemSpotify, setItemSpotify] = useState("");
  const [itemSoundcloud, setItemSoundcloud] = useState("");
  const [itemArtwork, setItemArtwork] = useState("");
  const [itemMasterAudioPath, setItemMasterAudioPath] = useState("");
  const [itemAudioPreviewUrl, setItemAudioPreviewUrl] = useState("");
  const [isUploadingMaster, setIsUploadingMaster] = useState(false);
  const [analyzingTrackId, setAnalyzingTrackId] = useState<string | null>(null);
  const [isAnalyzingAll, setIsAnalyzingAll] = useState(false);
  const masterInputRef = useRef<HTMLInputElement | null>(null);

  // Hashtag Preset form state
  const [showAddPreset, setShowAddPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetTagsInput, setPresetTagsInput] = useState("");

  const openConfigurePlatform = (platform: PublishablePlatform) => {
    const existing = connections.find((c) => c.platform === platform);
    setConfiguringPlatform(platform);
    setConnAccountName(
      existing?.accountName ?? `@${profile.stageName.toLowerCase().replace(/\s+/g, "")}`,
    );
    setConnExternalId(existing?.externalAccountId ?? "auto");
    setConnAccessToken("");
    setConnRefreshToken("");
    setConnTiktokMode(existing?.metadata?.tiktokPostMode ?? "inbox");
    setConnYoutubePrivacy(existing?.metadata?.youtubePrivacy ?? "public");
  };

  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configuringPlatform) return;

    const existing = connections.find((c) => c.platform === configuringPlatform);
    const tokenToUse = connAccessToken.trim() || (existing ? "__KEEP_EXISTING__" : "");
    if (!tokenToUse) {
      toast.error("Paste an Access Token to connect this account.");
      return;
    }

    setIsSavingConnection(true);
    try {
      await upsertSocialConnectionServerFn({
        data: {
          platform: configuringPlatform,
          accountName: connAccountName.trim() || configuringPlatform,
          externalAccountId: connExternalId.trim() || "auto",
          accessToken: tokenToUse,
          refreshToken:
            connRefreshToken.trim() || (existing ? "__KEEP_EXISTING__" : undefined),
          metadata: {
            tiktokPostMode: connTiktokMode,
            youtubePrivacy: connYoutubePrivacy,
          },
        },
      });
      await onRefresh();
      toast.success(`Saved ${PLATFORM_META[configuringPlatform].label} connection!`);
      setConfiguringPlatform(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save connection");
    } finally {
      setIsSavingConnection(false);
    }
  };

  const handleTestConnection = async (platform: PublishablePlatform) => {
    setTestingPlatform(platform);
    try {
      const res = await testSocialConnectionServerFn({ data: { platform } });
      await onRefresh();
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection test failed");
    } finally {
      setTestingPlatform(null);
    }
  };

  const handleDisconnect = async (platform: PublishablePlatform) => {
    try {
      await disconnectSocialAccountServerFn({ data: { platform } });
      await onRefresh();
      toast.success(`Disconnected ${PLATFORM_META[platform].label}`);
    } catch {
      toast.error("Could not disconnect account");
    }
  };

  const resetTrackForm = () => {
    setEditingItemId(undefined);
    setItemType("track");
    setItemTitle("");
    setItemAlbum("");
    setItemReleaseDate(new Date().toISOString().slice(0, 10));
    setItemBpm(200);
    setItemSpotify("");
    setItemSoundcloud("");
    setItemArtwork("");
    setItemMasterAudioPath("");
    setItemAudioPreviewUrl("");
    setShowAddTrack(false);
  };

  const handleEditItem = (item: ArtistCatalogItemRecord) => {
    setEditingItemId(item.id);
    setItemType(item.type as CatalogItemType);
    setItemTitle(item.title);
    setItemAlbum(item.albumOrChapter ?? "");
    setItemReleaseDate(new Date(item.releaseDate).toISOString().slice(0, 10));
    setItemBpm(item.bpm ?? 200);
    setItemSpotify(item.streamingLinks?.spotify ?? "");
    setItemSoundcloud(item.streamingLinks?.soundcloud ?? "");
    setItemArtwork(item.artworkUrl ?? "");
    setItemMasterAudioPath(item.masterAudioPath ?? "");
    setItemAudioPreviewUrl(item.audioPreviewUrl ?? "");
    setShowAddTrack(true);
  };

  const handleMasterAudioUpload = async (file: File) => {
    setIsUploadingMaster(true);
    try {
      const formData = new FormData();
      formData.append("audio", file);
      const res = await fetch("/api/socials/master-upload", {
        method: "POST",
        body: formData,
      });
      const json = (await res.json()) as {
        masterAudioPath?: string;
        audioPreviewUrl?: string;
        fileName?: string;
        error?: string;
      };
      if (!res.ok || !json.masterAudioPath) {
        throw new Error(json.error || "Audio upload failed");
      }
      setItemMasterAudioPath(json.masterAudioPath);
      if (json.audioPreviewUrl) {
        setItemAudioPreviewUrl(json.audioPreviewUrl);
      }
      if (!itemTitle.trim()) {
        setItemTitle(file.name.replace(/\.[^/.]+$/, "").toUpperCase());
      }
      toast.success(`Uploaded master "${file.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload master audio");
    } finally {
      setIsUploadingMaster(false);
    }
  };

  const handleAnalyzeTrack = async (catalogItemId: string, title: string) => {
    setAnalyzingTrackId(catalogItemId);
    try {
      const res = await analyzeCatalogTrackServerFn({
        data: { catalogItemId, runImmediately: true },
      });
      await onRefresh();
      if (res.analysis) {
        toast.success(
          `Analyzed "${title}": ${res.analysis.bpm} BPM • ${res.analysis.drops.length} drop(s) detected`,
        );
      } else {
        toast.success(`Queued audio analysis for "${title}"`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Audio analysis failed");
    } finally {
      setAnalyzingTrackId(null);
    }
  };

  const handleAnalyzeAllTracks = async () => {
    setIsAnalyzingAll(true);
    try {
      const res = await analyzeAllCatalogTracksServerFn();
      await onRefresh();
      toast.success(
        res.queuedCount > 0
          ? `Queued audio analysis for ${res.queuedCount} track(s) in background worker`
          : "All tracks with audio are already analyzed!",
      );
    } catch {
      toast.error("Failed to queue track analysis");
    } finally {
      setIsAnalyzingAll(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      await updateArtistProfileServerFn({
        data: {
          stageName: stageName.trim() || "LIL SBD",
          genre: genre.trim() || "Uptempo Hardcore",
          tagline: profile.tagline,
          primaryLanguage: "en",
          defaultBioLink: defaultBioLink.trim(),
          weeklyPostTarget: Number(weeklyPostTarget) || 5,
        },
      });
      await onRefresh();
      toast.success("Studio profile saved!");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSyncCatalog = async () => {
    setIsSyncing(true);
    try {
      const res = await syncLilSbdCatalogServerFn();
      await onRefresh();
      toast.success(
        res.syncedCount > 0
          ? `Imported ${res.syncedCount} release(s) from lilsbd.com!`
          : "All site tracks are already in your catalog.",
      );
    } catch {
      toast.error("Failed to import site catalog");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveCatalogItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemTitle.trim()) return;

    try {
      await upsertCatalogItemServerFn({
        data: {
          id: editingItemId,
          type: itemType,
          title: itemTitle.trim(),
          albumOrChapter: itemAlbum.trim() || undefined,
          releaseDate: itemReleaseDate,
          bpm: Number(itemBpm) || 200,
          keySignature: "F Minor",
          genreTag: genre,
          artworkUrl: itemArtwork.trim() || undefined,
          audioPreviewUrl: itemAudioPreviewUrl.trim() || undefined,
          masterAudioPath: itemMasterAudioPath.trim() || undefined,
          streamingLinks: {
            spotify: itemSpotify.trim() || undefined,
            soundcloud: itemSoundcloud.trim() || undefined,
          },
        },
      });
      await onRefresh();
      toast.success(
        editingItemId ? `Updated "${itemTitle.trim()}"` : `Added "${itemTitle.trim()}"!`,
      );
      resetTrackForm();
    } catch {
      toast.error("Could not save track");
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await deleteCatalogItemServerFn({ data: { id } });
      await onRefresh();
      toast.success("Removed track from catalog");
    } catch {
      toast.error("Could not remove item");
    }
  };

  const handleCreatePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedTags = presetTagsInput
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith("#") ? t : `#${t}`));

    if (!presetName.trim() || parsedTags.length === 0) {
      toast.error("Provide a pack name and at least one hashtag");
      return;
    }

    try {
      await createHashtagPresetServerFn({
        data: {
          name: presetName.trim(),
          platform: "all",
          tags: parsedTags,
        },
      });
      await onRefresh();
      setPresetName("");
      setPresetTagsInput("");
      setShowAddPreset(false);
      toast.success(`Saved hashtag pack "${presetName.trim()}"`);
    } catch {
      toast.error("Failed to save hashtag pack");
    }
  };

  const handleDeletePreset = async (id: string) => {
    try {
      await deleteHashtagPresetServerFn({ data: { id } });
      await onRefresh();
      toast.success("Deleted hashtag pack");
    } catch {
      toast.error("Could not delete hashtag pack");
    }
  };

  return (
    <div className="space-y-6">
      {/* ====================================================================
          1. CONNECTED SOCIAL ACCOUNTS (DIRECT NATIVE PUBLISHING)
          ==================================================================== */}
      <Card className="border border-primary/40 bg-card/55 backdrop-blur-md">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <IconPlugConnected className="size-5 text-primary" />
                Connected Social Accounts (Direct Native Publishing)
              </CardTitle>
              <CardDescription className="text-xs">
                Connect Instagram Reels, TikTok, and YouTube Shorts once to pre-program automatic publishing directly from your server.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs">
              {connections.length} / 3 Connected
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3.5 md:grid-cols-3">
            {PUBLISHABLE_PLATFORMS.map((platform) => {
              const meta = PLATFORM_META[platform];
              const conn = connections.find((c) => c.platform === platform);
              const isTesting = testingPlatform === platform;
              const hasOAuthEnv = oauthEnvConfigured[platform];

              return (
                <div
                  key={platform}
                  className={cn(
                    "flex flex-col justify-between gap-3 border p-4 transition-colors",
                    conn
                      ? "border-emerald-500/40 bg-emerald-500/8"
                      : "border-border/70 bg-background/60",
                  )}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 text-sm font-bold text-foreground">
                        <meta.Icon className="size-4.5 text-primary" />
                        {meta.label}
                      </span>
                      {conn ? (
                        <Badge className="border-emerald-500/40 bg-emerald-500/20 text-[0.65rem] text-emerald-200">
                          Connected
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[0.65rem] text-muted-foreground">
                          Not Linked
                        </Badge>
                      )}
                    </div>

                    {conn ? (
                      <div className="space-y-1 text-xs">
                        <p className="font-semibold text-foreground">{conn.accountName}</p>
                        <p className="font-mono text-[0.68rem] text-muted-foreground">
                          ID: {conn.externalAccountId}
                        </p>
                        {platform === "tiktok" ? (
                          <p className="text-[0.68rem] text-cyan-300">
                            Mode:{" "}
                            {conn.metadata?.tiktokPostMode === "direct"
                              ? "Direct Public Post"
                              : "TikTok Inbox Draft Push"}
                          </p>
                        ) : null}
                        {platform === "youtube_shorts" ? (
                          <p className="text-[0.68rem] text-red-300">
                            Visibility: {conn.metadata?.youtubePrivacy ?? "public"}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">{meta.publishModeHint}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-2">
                    {hasOAuthEnv ? (
                      <Button
                        size="xs"
                        variant={conn ? "outline" : "default"}
                        nativeButton={false}
                        render={<a href={`/api/socials/oauth/${platform}`} />}
                      >
                        {conn ? "Reconnect OAuth" : "Connect OAuth"}
                      </Button>
                    ) : null}

                    <Button
                      size="xs"
                      variant={conn || hasOAuthEnv ? "outline" : "default"}
                      onClick={() => openConfigurePlatform(platform)}
                    >
                      <IconKey className="size-3.5" />
                      <span>{conn ? "Settings / Token" : "Setup Token"}</span>
                    </Button>

                    {conn ? (
                      <>
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={isTesting}
                          onClick={() => handleTestConnection(platform)}
                        >
                          {isTesting ? (
                            <IconLoader2 className="size-3 animate-spin" />
                          ) : (
                            <IconRefresh className="size-3" />
                          )}
                          <span>Verify</span>
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => handleDisconnect(platform)}
                          title="Disconnect account"
                        >
                          <IconTrash className="size-3.5 text-destructive" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Inline Credential / Mode Configuration Drawer */}
          {configuringPlatform ? (
            <form
              onSubmit={handleSaveConnection}
              className="space-y-4 border border-primary/50 bg-background/95 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-foreground">
                    Configure {PLATFORM_META[configuringPlatform].label}
                  </h4>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {PLATFORM_SETUP_GUIDES[configuringPlatform].helperText}
                  </p>
                </div>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => setConfiguringPlatform(null)}
                >
                  <IconX className="size-4" />
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border border-border/60 bg-card/40 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <span className="font-semibold text-muted-foreground">
                    OAuth Redirect URI:{" "}
                  </span>
                  <code className="font-mono text-[0.7rem] text-foreground">
                    {typeof window !== "undefined"
                      ? `${window.location.origin}/api/socials/oauth/${configuringPlatform}`
                      : `http://localhost:3000/api/socials/oauth/${configuringPlatform}`}
                  </code>
                </div>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    const uri =
                      typeof window !== "undefined"
                        ? `${window.location.origin}/api/socials/oauth/${configuringPlatform}`
                        : `http://localhost:3000/api/socials/oauth/${configuringPlatform}`;
                    void navigator.clipboard.writeText(uri);
                    toast.success("Copied OAuth Redirect URI!");
                  }}
                >
                  <IconCopy className="size-3.5" />
                  <span>Copy URI</span>
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    Display Handle / Name
                  </label>
                  <input
                    type="text"
                    required
                    value={connAccountName}
                    onChange={(e) => setConnAccountName(e.target.value)}
                    placeholder="@lilsbd"
                    className="mt-1 w-full border border-border/80 bg-card/50 px-3 py-1.5 text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    {PLATFORM_SETUP_GUIDES[configuringPlatform].idLabel} *
                  </label>
                  <input
                    type="text"
                    required
                    value={connExternalId}
                    onChange={(e) => setConnExternalId(e.target.value)}
                    placeholder={PLATFORM_SETUP_GUIDES[configuringPlatform].idPlaceholder}
                    className="mt-1 w-full border border-border/80 bg-card/50 px-3 py-1.5 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    {PLATFORM_SETUP_GUIDES[configuringPlatform].tokenLabel}{" "}
                    {connections.some((c) => c.platform === configuringPlatform)
                      ? "(leave blank to keep current)"
                      : "*"}
                  </label>
                  <input
                    type="password"
                    value={connAccessToken}
                    onChange={(e) => setConnAccessToken(e.target.value)}
                    placeholder="Paste access token..."
                    className="mt-1 w-full border border-border/80 bg-card/50 px-3 py-1.5 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    Optional OAuth Refresh Token (auto-renews access token)
                  </label>
                  <input
                    type="password"
                    value={connRefreshToken}
                    onChange={(e) => setConnRefreshToken(e.target.value)}
                    placeholder="Paste refresh token if applicable..."
                    className="mt-1 w-full border border-border/80 bg-card/50 px-3 py-1.5 font-mono text-xs"
                  />
                </div>
              </div>

              {configuringPlatform === "tiktok" ? (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    TikTok Delivery Mode
                  </label>
                  <select
                    value={connTiktokMode}
                    onChange={(e) =>
                      setConnTiktokMode(e.target.value as "inbox" | "direct")
                    }
                    className="mt-1 w-full border border-border/80 bg-card/50 px-3 py-1.5 text-xs"
                  >
                    <option value="inbox">
                      Inbox Draft Push (/v2/post/publish/inbox/video/init/) — Works without public app audit
                    </option>
                    <option value="direct">
                      Direct Public Post (/v2/post/publish/video/init/) — Requires audited TikTok app
                    </option>
                  </select>
                </div>
              ) : null}

              {configuringPlatform === "youtube_shorts" ? (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    Default YouTube Shorts Visibility
                  </label>
                  <select
                    value={connYoutubePrivacy}
                    onChange={(e) =>
                      setConnYoutubePrivacy(
                        e.target.value as "public" | "unlisted" | "private",
                      )
                    }
                    className="mt-1 w-full border border-border/80 bg-card/50 px-3 py-1.5 text-xs"
                  >
                    <option value="public">Public (verified Google project)</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="private">Private (unverified Google project default)</option>
                  </select>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-[0.68rem] text-muted-foreground">
                  Tip: Set {PLATFORM_SETUP_GUIDES[configuringPlatform].oauthEnvHint} in .env to enable 1-click OAuth redirect.
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfiguringPlatform(null)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={isSavingConnection}>
                    <IconCheck className="size-4" />
                    {isSavingConnection ? "Saving..." : "Save Account"}
                  </Button>
                </div>
              </div>
            </form>
          ) : null}
        </CardContent>
      </Card>

      {/* ====================================================================
          2. ARTIST CATALOG (TRACKS & RELEASES)
          ==================================================================== */}
      <Card className="border border-border/70 bg-card/45">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <IconDisc className="size-4.5 text-primary" />
                Track & Release Catalog ({catalog.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Bind tracks to your posts for 1-click audio preview, BPM hooks, and streaming links.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {storageStats ? (
                <Badge variant="outline" className="text-[0.65rem] text-muted-foreground">
                  {storageStats.storageMode === "s3_r2" ? "Cloudflare R2 / S3" : "Local NVMe"} •{" "}
                  {formatMb(storageStats.totalBytes)}
                </Badge>
              ) : null}
              <Button
                size="xs"
                variant="outline"
                disabled={isAnalyzingAll || catalog.length === 0}
                onClick={handleAnalyzeAllTracks}
              >
                <IconWaveSine className={cn("size-3.5", isAnalyzingAll && "animate-pulse")} />
                <span>{isAnalyzingAll ? "Queuing..." : "Analyze All Audio"}</span>
              </Button>
              <Button
                size="xs"
                variant="outline"
                disabled={isSyncing}
                onClick={handleSyncCatalog}
              >
                <IconRefresh className={cn("size-3.5", isSyncing && "animate-spin")} />
                <span>{isSyncing ? "Syncing..." : "Sync Site Releases"}</span>
              </Button>
              <Button
                size="xs"
                onClick={() => {
                  if (showAddTrack) resetTrackForm();
                  else setShowAddTrack(true);
                }}
              >
                <IconPlus className="size-3.5" />
                <span>{showAddTrack ? "Close" : "Add Track / Demo"}</span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {showAddTrack ? (
            <form
              onSubmit={handleSaveCatalogItem}
              className="grid gap-3 border border-primary/35 bg-background/80 p-4 sm:grid-cols-3"
            >
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                  placeholder="DEAD OPS"
                  className="mt-1 w-full border border-border/70 bg-card/50 px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  BPM
                </label>
                <input
                  type="number"
                  value={itemBpm}
                  onChange={(e) => setItemBpm(Number(e.target.value) || 200)}
                  className="mt-1 w-full border border-border/70 bg-card/50 px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Release Date
                </label>
                <input
                  type="date"
                  value={itemReleaseDate}
                  onChange={(e) => setItemReleaseDate(e.target.value)}
                  className="mt-1 w-full border border-border/70 bg-card/50 px-2.5 py-1.5 text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Unreleased Demo / Master Audio (.WAV / .MP3)
                </label>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <input
                    ref={masterInputRef}
                    type="file"
                    accept="audio/wav,audio/mpeg,audio/flac,audio/mp4,audio/ogg,.wav,.mp3,.flac,.m4a,.ogg"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleMasterAudioUpload(f);
                    }}
                  />
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={isUploadingMaster}
                    onClick={() => masterInputRef.current?.click()}
                  >
                    {isUploadingMaster ? (
                      <IconLoader2 className="size-3.5 animate-spin" />
                    ) : (
                      <IconUpload className="size-3.5" />
                    )}
                    <span>
                      {isUploadingMaster
                        ? "Uploading..."
                        : itemMasterAudioPath
                          ? "Replace Master WAV/MP3"
                          : "Upload Master WAV/MP3"}
                    </span>
                  </Button>
                  {itemMasterAudioPath ? (
                    <span className="truncate font-mono text-[0.68rem] text-emerald-300">
                      {itemMasterAudioPath}
                    </span>
                  ) : (
                    <span className="text-[0.68rem] text-muted-foreground">
                      Used for auto-sync & clean master audio swap
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Spotify Link (optional)
                </label>
                <input
                  type="text"
                  value={itemSpotify}
                  onChange={(e) => setItemSpotify(e.target.value)}
                  placeholder="https://open.spotify.com/track/..."
                  className="mt-1 w-full border border-border/70 bg-card/50 px-2.5 py-1.5 text-xs"
                />
              </div>
              <div className="flex items-end justify-end gap-2 sm:col-span-3">
                <Button type="button" size="sm" variant="ghost" onClick={resetTrackForm}>
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  {editingItemId ? "Update" : "Save Track"}
                </Button>
              </div>
            </form>
          ) : null}

          {catalog.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-border/60 py-6 text-center">
              <p className="text-xs text-muted-foreground">
                No tracks in catalog yet. Click &ldquo;Sync Site Releases&rdquo; to import your songs.
              </p>
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {catalog.map((item) => {
                const analysis = item.audioAnalysis;
                const isAnalyzing = analyzingTrackId === item.id;
                const hasAudio = Boolean(item.masterAudioPath || item.audioPreviewUrl);

                return (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between gap-2 border border-border/60 bg-background/60 p-3"
                  >
                    <div className="flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {item.artworkUrl ? (
                          <img
                            src={item.artworkUrl}
                            alt={item.title}
                            className="size-10 shrink-0 object-cover border border-white/10"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-foreground">
                            {item.title}
                          </p>
                          <p className="text-[0.68rem] text-muted-foreground">
                            {analysis ? `${analysis.bpm} BPM` : `${item.bpm ?? 200} BPM`} •{" "}
                            {item.albumOrChapter || "Single"}
                            {analysis ? ` • ${formatSec(analysis.durationSec)}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {hasAudio ? (
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            disabled={isAnalyzing}
                            onClick={() => void handleAnalyzeTrack(item.id, item.title)}
                            title={
                              analysis
                                ? "Re-analyze BPM, beat grid & drops"
                                : "Analyze BPM, beat grid & drops"
                            }
                          >
                            {isAnalyzing ? (
                              <IconLoader2 className="size-3.5 animate-spin text-primary" />
                            ) : (
                              <IconWaveSine
                                className={cn(
                                  "size-3.5",
                                  analysis ? "text-emerald-400" : "text-muted-foreground",
                                )}
                              />
                            )}
                          </Button>
                        ) : null}
                        {item.streamingLinks?.spotify ? (
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => {
                              void navigator.clipboard.writeText(item.streamingLinks.spotify!);
                              toast.success("Copied Spotify URL");
                            }}
                            title="Copy Spotify URL"
                          >
                            <IconCopy className="size-3.5" />
                          </Button>
                        ) : null}
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => handleEditItem(item)}
                          title="Edit track"
                        >
                          <IconEdit className="size-3.5" />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => handleDeleteItem(item.id)}
                          title="Delete track"
                        >
                          <IconTrash className="size-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    {analysis ? (
                      <div className="space-y-1.5 border-t border-border/40 pt-2">
                        <div className="flex h-5 items-end gap-[1px] overflow-hidden bg-card/40 px-1 py-0.5">
                          {analysis.energyEnvelope.slice(0, 80).map((amp, idx) => {
                            const barTime =
                              (idx / Math.max(1, Math.min(80, analysis.energyEnvelope.length))) *
                              analysis.durationSec;
                            const inDrop = analysis.drops.some(
                              (d) => barTime >= d.dropImpactSec && barTime <= d.endSec,
                            );
                            return (
                              <span
                                key={idx}
                                style={{ height: `${Math.max(12, Math.round(amp * 100))}%` }}
                                className={cn(
                                  "flex-1 rounded-[1px]",
                                  inDrop ? "bg-primary" : "bg-muted-foreground/35",
                                )}
                              />
                            );
                          })}
                        </div>
                        <div className="flex flex-wrap items-center gap-1 text-[0.64rem] text-muted-foreground">
                          <span className="border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-300">
                            {analysis.barsSec.length} bars
                          </span>
                          {analysis.drops.slice(0, 3).map((d, i) => (
                            <span
                              key={i}
                              className="border border-primary/35 bg-primary/10 px-1.5 py-0.5 text-primary-foreground"
                            >
                              {d.label}: {formatSec(d.dropImpactSec)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : hasAudio ? (
                      <div className="flex items-center justify-between border-t border-border/40 pt-1.5 text-[0.65rem] text-muted-foreground">
                        <span>Not analyzed yet</span>
                        <button
                          type="button"
                          disabled={isAnalyzing}
                          onClick={() => void handleAnalyzeTrack(item.id, item.title)}
                          className="font-semibold text-primary hover:underline"
                        >
                          {isAnalyzing ? "Analyzing..." : "Analyze beats & drops →"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ====================================================================
          3. STUDIO PROFILE & HASHTAG PACKS (2-COLUMN)
          ==================================================================== */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border border-border/70 bg-card/45">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Producer Profile & Defaults</CardTitle>
            <CardDescription className="text-xs">
              Default bio link and weekly post target.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    Stage Name
                  </label>
                  <input
                    type="text"
                    value={stageName}
                    onChange={(e) => setStageName(e.target.value)}
                    className="mt-1 w-full border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    Weekly Post Goal
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={21}
                    value={weeklyPostTarget}
                    onChange={(e) => setWeeklyPostTarget(Number(e.target.value) || 5)}
                    className="mt-1 w-full border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Default Link in Bio
                </label>
                <input
                  type="text"
                  value={defaultBioLink}
                  onChange={(e) => setDefaultBioLink(e.target.value)}
                  className="mt-1 w-full border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs"
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={isSavingProfile}>
                  {isSavingProfile ? "Saving..." : "Save Profile"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border border-border/70 bg-card/45">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  Saved Hashtag Packs ({hashtagPresets.length})
                </CardTitle>
                <CardDescription className="text-xs">
                  1-click hashtag bundles inside the post composer.
                </CardDescription>
              </div>
              <Button
                size="xs"
                variant="outline"
                onClick={() => setShowAddPreset((v) => !v)}
              >
                <IconPlus className="size-3.5" />
                New Pack
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {showAddPreset ? (
              <form
                onSubmit={handleCreatePreset}
                className="space-y-2 border border-primary/35 bg-background/80 p-3"
              >
                <input
                  type="text"
                  required
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Pack name (e.g., Zaag Core)..."
                  className="w-full border border-border/70 bg-card/50 px-2.5 py-1 text-xs"
                />
                <input
                  type="text"
                  required
                  value={presetTagsInput}
                  onChange={(e) => setPresetTagsInput(e.target.value)}
                  placeholder="#uptempohardcore #zaagkick #harddance"
                  className="w-full border border-border/70 bg-card/50 px-2.5 py-1 text-xs"
                />
                <div className="flex justify-end gap-2">
                  <Button type="submit" size="xs">
                    Save Pack
                  </Button>
                </div>
              </form>
            ) : null}

            {hashtagPresets.length === 0 ? (
              <p className="text-xs text-muted-foreground">No saved hashtag packs yet.</p>
            ) : (
              <div className="space-y-2">
                {hashtagPresets.map((preset) => (
                  <div
                    key={preset.id}
                    className="flex items-center justify-between gap-2 border border-border/60 bg-background/60 p-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-foreground">{preset.name}</p>
                      <p className="truncate text-[0.68rem] text-muted-foreground">
                        {preset.tags.join(" ")}
                      </p>
                    </div>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => handleDeletePreset(preset.id)}
                    >
                      <IconTrash className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
