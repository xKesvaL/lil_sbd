import {
  IconAlertTriangle,
  IconBrandDiscord,
  IconCalendarClock,
  IconCheck,
  IconCopy,
  IconDisc,
  IconEdit,
  IconKey,
  IconLoader2,
  IconLock,
  IconLockOpen,
  IconPlayerPlay,
  IconPlayerStop,
  IconPlugConnected,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUpload,
  IconWaveSine,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
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
  BackgroundJobRecord,
  CatalogItemType,
  EditPreset,
  HashtagPresetRecord,
  PublishablePlatform,
  TrackSectionKind,
} from "#/db/schema";
import { cn } from "#/lib/utils";
import {
  analyzeAllCatalogTracksServerFn,
  analyzeCatalogTrackServerFn,
  createHashtagPresetServerFn,
  deleteCatalogItemServerFn,
  deleteHashtagPresetServerFn,
  disconnectSocialAccountServerFn,
  runMediaCleanupNowServerFn,
  syncLilSbdCatalogServerFn,
  testDiscordWebhookServerFn,
  testSocialConnectionServerFn,
  updateArtistProfileServerFn,
  updateTrackAudioMetadataServerFn,
  upsertCatalogItemServerFn,
  upsertSocialConnectionServerFn,
} from "#/server/socials";
import {
  COMMON_TIMEZONES,
  PLATFORM_META,
  PUBLISHABLE_PLATFORMS,
  type SafeSocialConnection,
  type StorageStatsSummary,
  WEEKDAY_OPTIONS,
} from "./social-constants";

interface SystemDiagnostics {
  ffmpegAvailable: boolean;
  publicHttpsReady: boolean;
  publicBaseUrl: string;
  storageMode: "s3_r2" | "local_nvme";
  geminiConfigured: boolean;
  geminiModel: string;
  cronSecretConfigured?: boolean;
  discordWebhookConfigured?: boolean;
}

interface TracksSettingsTabProps {
  profile: ArtistProfileRecord;
  catalog: ArtistCatalogItemRecord[];
  hashtagPresets: HashtagPresetRecord[];
  connections: SafeSocialConnection[];
  oauthEnvConfigured: Record<PublishablePlatform, boolean>;
  storageStats?: StorageStatsSummary;
  diagnostics?: SystemDiagnostics;
  recentJobs?: BackgroundJobRecord[];
  onRefresh: () => Promise<void>;
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
    idPlaceholder: "auto",
    tokenLabel: "Meta Access Token (Graph API Explorer or Long-Lived)",
    helperText:
      "Works in Meta App Development Mode without App Review. Paste a token with instagram_basic, instagram_content_publish, pages_show_list & leave ID as 'auto'.",
    oauthEnvHint: "META_APP_ID & META_APP_SECRET",
  },
  tiktok: {
    idLabel: "TikTok Open ID (or 'auto' to auto-detect)",
    idPlaceholder: "auto",
    tokenLabel: "TikTok OAuth Access Token",
    helperText:
      "Default mode is 'Inbox Draft Push' (video.upload scope) which delivers the rendered .mp4 straight to your TikTok app notifications (bypasses unaudited SELF_ONLY locks).",
    oauthEnvHint: "TIKTOK_CLIENT_KEY & TIKTOK_CLIENT_SECRET",
  },
  youtube_shorts: {
    idLabel: "YouTube Channel ID (or 'auto')",
    idPlaceholder: "auto",
    tokenLabel: "Google OAuth Access Token",
    helperText:
      "Uploads vertical videos with #Shorts via YouTube Data API v3. Use 1-click OAuth (GOOGLE_CLIENT_ID/SECRET) to store a refresh token that never expires.",
    oauthEnvHint: "GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET",
  },
};

function formatSec(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

function parseTimestampSec(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":").map((p) => Number(p.trim()));
    if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      return Math.max(0, parts[0]! * 60 + parts[1]!);
    }
    return null;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function resolveAuditionAudioUrl(item: ArtistCatalogItemRecord): string | null {
  if (item.audioPreviewUrl?.trim()) return item.audioPreviewUrl.trim();
  const master = item.masterAudioPath?.trim();
  if (!master) return null;
  if (master.startsWith("/") || master.startsWith("http://") || master.startsWith("https://")) {
    return master;
  }
  return `/api/socials/media/${master}`;
}

function formatMb(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function TracksSettingsTab({
  profile,
  catalog,
  hashtagPresets,
  connections,
  oauthEnvConfigured,
  storageStats,
  diagnostics,
  recentJobs = [],
  onRefresh,
}: TracksSettingsTabProps) {
  // Autopilot Cadence & Audio/Edit Settings state
  const [stageName, setStageName] = useState(profile.stageName);
  const [defaultBioLink, setDefaultBioLink] = useState(profile.defaultBioLink);
  const [timezone, setTimezone] = useState(profile.timezone || "Europe/Paris");
  const [cadenceDays, setCadenceDays] = useState<number[]>(
    profile.cadenceDays?.length ? profile.cadenceDays : [1, 3, 5, 0],
  );
  const [cadenceTime, setCadenceTime] = useState(profile.cadenceTime || "18:00");
  const [avoidConsecutiveTrack, setAvoidConsecutiveTrack] = useState(
    profile.avoidConsecutiveTrack ?? true,
  );
  const [fullAutopilot, setFullAutopilot] = useState(profile.fullAutopilot ?? false);
  const [defaultEditPreset, setDefaultEditPreset] = useState<EditPreset>(
    profile.defaultEditPreset || "punchy",
  );
  const [burnHookOverlay, setBurnHookOverlay] = useState(profile.burnHookOverlay ?? false);
  const [audioHeadroomDb, setAudioHeadroomDb] = useState(profile.audioHeadroomDb ?? -1.5);
  const [rawRetentionDays, setRawRetentionDays] = useState(profile.rawRetentionDays ?? 7);
  const [renderedRetentionDays, setRenderedRetentionDays] = useState(
    profile.renderedRetentionDays ?? 90,
  );
  const [storageCapGb, setStorageCapGb] = useState(profile.storageCapGb ?? 8);
  const [geminiModel, setGeminiModel] = useState(profile.geminiModel ?? "");
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState(profile.discordWebhookUrl ?? "");
  const [isTestingDiscord, setIsTestingDiscord] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Connected Social Accounts state
  const [configuringPlatform, setConfiguringPlatform] = useState<PublishablePlatform | null>(
    null,
  );
  const [testingPlatform, setTestingPlatform] = useState<PublishablePlatform | null>(null);
  const [isSavingConnection, setIsSavingConnection] = useState(false);
  const [connAccountName, setConnAccountName] = useState("");
  const [connExternalId, setConnExternalId] = useState("");
  const [connAccessToken, setConnAccessToken] = useState("");
  const [connRefreshToken, setConnRefreshToken] = useState("");
  const [connTiktokMode, setConnTiktokMode] = useState<"inbox" | "direct">("inbox");
  const [connYoutubePrivacy, setConnYoutubePrivacy] = useState<
    "public" | "unlisted" | "private"
  >("public");

  // Track Catalog state
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAddTrack, setShowAddTrack] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | undefined>(undefined);
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

  // Audio Brain v2 interactive audition & manual marker state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [auditioning, setAuditioning] = useState<{
    trackId: string;
    trackTitle: string;
    markerKey: string;
    label: string;
    targetSec: number;
  } | null>(null);
  const [addingMarkerTrackId, setAddingMarkerTrackId] = useState<string | null>(null);
  const [newMarkerKind, setNewMarkerKind] = useState<TrackSectionKind>("highlight");
  const [newMarkerTimeInput, setNewMarkerTimeInput] = useState("");
  const [editingBpmTrackId, setEditingBpmTrackId] = useState<string | null>(null);
  const [editingBpmValue, setEditingBpmValue] = useState<number>(200);
  const [savingMetaTrackId, setSavingMetaTrackId] = useState<string | null>(null);

  const activeAnalyzeJobs = recentJobs.filter(
    (j) =>
      j.jobType === "analyze_track" && (j.status === "queued" || j.status === "running"),
  );

  // Auto-refresh catalog every 2s while background Audio Brain v2 jobs are draining
  useEffect(() => {
    if (activeAnalyzeJobs.length === 0) return;
    const timer = setInterval(() => {
      void onRefresh();
    }, 2_000);
    return () => clearInterval(timer);
  }, [activeAnalyzeJobs.length, onRefresh]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  const stopAudition = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setAuditioning(null);
  };

  const handleAuditionTimestamp = (
    item: ArtistCatalogItemRecord,
    targetSec: number,
    markerKey: string,
    label: string,
    leadInSec = 2,
  ) => {
    if (auditioning?.trackId === item.id && auditioning.markerKey === markerKey) {
      stopAudition();
      return;
    }

    const url = resolveAuditionAudioUrl(item);
    if (!url) {
      toast.error("No playable audio URL found for this track.");
      return;
    }

    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.addEventListener("ended", () => setAuditioning(null));
    }

    const audio = audioRef.current;
    const seekTo = Math.max(0, Number((targetSec - leadInSec).toFixed(2)));
    const nextAbsoluteUrl =
      typeof window !== "undefined" ? new URL(url, window.location.origin).href : url;

    const startPlayback = () => {
      try {
        audio.currentTime = seekTo;
      } catch {
        // Seek after metadata loads
      }
      void audio.play().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Could not play audio preview");
        setAuditioning(null);
      });
    };

    if (audio.src !== nextAbsoluteUrl) {
      audio.pause();
      audio.src = nextAbsoluteUrl;
      const onMeta = () => {
        audio.removeEventListener("loadedmetadata", onMeta);
        startPlayback();
      };
      audio.addEventListener("loadedmetadata", onMeta);
      audio.load();
    } else {
      startPlayback();
    }

    setAuditioning({
      trackId: item.id,
      trackTitle: item.title,
      markerKey,
      label,
      targetSec,
    });
  };

  const handleToggleBpmLock = async (item: ArtistCatalogItemRecord, overrideBpm?: number) => {
    const currentlyLocked = Boolean(item.audioAnalysis?.bpmLocked);
    const nextLocked = overrideBpm !== undefined ? true : !currentlyLocked;
    const nextBpm = overrideBpm ?? Math.round(item.audioAnalysis?.bpm ?? item.bpm ?? 200);
    setSavingMetaTrackId(item.id);
    try {
      await updateTrackAudioMetadataServerFn({
        data: {
          catalogItemId: item.id,
          bpm: nextBpm,
          bpmLocked: nextLocked,
        },
      });
      await onRefresh();
      setEditingBpmTrackId(null);
      toast.success(
        nextLocked
          ? `Locked "${item.title}" to ${nextBpm} BPM (re-analyze to align grid)`
          : `Unlocked auto-BPM detection for "${item.title}"`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update BPM lock");
    } finally {
      setSavingMetaTrackId(null);
    }
  };

  const handleRemoveMarker = async (
    item: ArtistCatalogItemRecord,
    markerId: string | undefined,
    markerIdx: number,
  ) => {
    setSavingMetaTrackId(item.id);
    try {
      await updateTrackAudioMetadataServerFn({
        data: {
          catalogItemId: item.id,
          ...(markerId ? { removeMarkerId: markerId } : { removeMarkerIndex: markerIdx }),
        },
      });
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove marker");
    } finally {
      setSavingMetaTrackId(null);
    }
  };

  const handleAddManualMarker = async (item: ArtistCatalogItemRecord) => {
    const sec = parseTimestampSec(newMarkerTimeInput);
    if (sec === null) {
      toast.error("Enter a valid time like 1:15 or 75");
      return;
    }
    setSavingMetaTrackId(item.id);
    try {
      await updateTrackAudioMetadataServerFn({
        data: {
          catalogItemId: item.id,
          addMarker: {
            kind: newMarkerKind,
            dropImpactSec: sec,
          },
        },
      });
      await onRefresh();
      setNewMarkerTimeInput("");
      setAddingMarkerTrackId(null);
      toast.success(`Added marker at ${formatSec(sec)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add marker");
    } finally {
      setSavingMetaTrackId(null);
    }
  };

  // Hashtag Presets state
  const [showAddPreset, setShowAddPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetTagsInput, setPresetTagsInput] = useState("");
  const [isRunningCleanup, setIsRunningCleanup] = useState(false);

  const handleRunCleanupNow = async () => {
    setIsRunningCleanup(true);
    try {
      const res = await runMediaCleanupNowServerFn();
      await onRefresh();
      const s = res.summary;
      const totalDeleted = s.scratchFilesDeleted + s.rawClipsDeleted + s.renderedVideosDeleted;
      toast.success(
        totalDeleted > 0
          ? `Cleaned ${totalDeleted} file(s) — freed ${formatMb(s.bytesFreed)}!`
          : "Storage is already clean — nothing expired yet.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cleanup failed");
    } finally {
      setIsRunningCleanup(false);
    }
  };

  const toggleCadenceDay = (day: number) => {
    setCadenceDays((prev) =>
      prev.includes(day)
        ? prev.length > 1
          ? prev.filter((d) => d !== day)
          : prev
        : [...prev, day],
    );
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      await updateArtistProfileServerFn({
        data: {
          stageName: stageName.trim() || "LIL SBD",
          genre: profile.genre,
          tagline: profile.tagline,
          primaryLanguage: "en",
          defaultBioLink: defaultBioLink.trim(),
          weeklyPostTarget: cadenceDays.length,
          timezone,
          cadenceDays,
          cadenceTime,
          avoidConsecutiveTrack,
          fullAutopilot,
          defaultEditPreset,
          burnHookOverlay,
          audioHeadroomDb: Number(audioHeadroomDb),
          rawRetentionDays: Number(rawRetentionDays) || 7,
          renderedRetentionDays: Number(renderedRetentionDays) || 90,
          storageCapGb: Number(storageCapGb) || 8,
          geminiModel: geminiModel.trim(),
          discordWebhookUrl: discordWebhookUrl.trim(),
        },
      });
      await onRefresh();
      toast.success("Saved Autopilot cadence & studio defaults!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleTestDiscordWebhook = async () => {
    if (!discordWebhookUrl.trim()) {
      toast.error("Paste a Discord webhook URL first.");
      return;
    }
    setIsTestingDiscord(true);
    try {
      const res = await testDiscordWebhookServerFn({
        data: { webhookUrl: discordWebhookUrl.trim() },
      });
      if (res.ok) {
        toast.success("Sent test alert to Discord! Click Save Defaults to store it.");
      } else {
        toast.error(res.error || "Discord webhook test failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Discord webhook test failed");
    } finally {
      setIsTestingDiscord(false);
    }
  };

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
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
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
        error?: string;
      };
      if (!res.ok || !json.masterAudioPath) {
        throw new Error(json.error || "Audio upload failed");
      }
      setItemMasterAudioPath(json.masterAudioPath);
      if (json.audioPreviewUrl) setItemAudioPreviewUrl(json.audioPreviewUrl);
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
        const bpmText = res.analysis.bpmRange
          ? `${res.analysis.bpmRange[0]}–${res.analysis.bpmRange[1]} BPM`
          : `${res.analysis.bpm} BPM`;
        const dropsCount = res.analysis.drops.filter((d) => (d.kind ?? "drop") === "drop").length;
        const highlightCount = res.analysis.drops.filter((d) => (d.kind ?? "drop") !== "drop").length;
        toast.success(
          `Analyzed "${title}": ${bpmText} • ${dropsCount} drop(s), ${highlightCount} highlight(s)`,
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

  const tracksNeedingV2 = catalog.filter(
    (item) =>
      Boolean(item.masterAudioPath || item.audioPreviewUrl) &&
      (!item.audioAnalysis || (item.audioAnalysis.version ?? 1) < 2),
  ).length;

  const handleAnalyzeAllTracks = async (forceReanalyze = false) => {
    setIsAnalyzingAll(true);
    try {
      const res = await analyzeAllCatalogTracksServerFn({
        data: { forceReanalyze },
      });
      await onRefresh();
      toast.success(
        res.queuedCount > 0
          ? `Queued Audio Brain v2 analysis for ${res.queuedCount} track(s)`
          : "All tracks with audio are already on Audio Brain v2!",
      );
    } catch {
      toast.error("Failed to queue track analysis");
    } finally {
      setIsAnalyzingAll(false);
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
          genreTag: profile.genre,
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
        data: { name: presetName.trim(), platform: "all", tags: parsedTags },
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
          1. AUTOPILOT CADENCE & AUDIO/EDIT DEFAULTS
          ==================================================================== */}
      <Card className="border border-primary/40 bg-card/50 backdrop-blur-md">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <IconCalendarClock className="size-5 text-primary" />
            Autopilot Cadence & Audio / Edit Defaults
          </CardTitle>
          <CardDescription className="text-xs">
            Configure your weekly schedule once — every dropped clip auto-fills the next open slot
            without manual calendar planning.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveSettings} className="space-y-4">
            {/* Posting Days + Time + Timezone */}
            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  Autopilot Posting Days ({cadenceDays.length}x / week)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_OPTIONS.map((w) => {
                    const active = cadenceDays.includes(w.day);
                    return (
                      <button
                        key={w.day}
                        type="button"
                        onClick={() => toggleCadenceDay(w.day)}
                        className={cn(
                          "border px-3 py-1.5 text-xs font-bold transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border/70 bg-background/60 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {w.short}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    Post Time
                  </label>
                  <input
                    type="time"
                    value={cadenceTime}
                    onChange={(e) => setCadenceTime(e.target.value)}
                    className="mt-1 w-full border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    Timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="mt-1 w-full border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs"
                  >
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Audio / Edit / Retention Grid */}
            <div className="grid gap-3 border-t border-border/50 pt-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Master Headroom Trim (dB)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={-6}
                  max={0}
                  value={audioHeadroomDb}
                  onChange={(e) => setAudioHeadroomDb(Number(e.target.value))}
                  className="mt-1 w-full border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs"
                />
                <p className="mt-0.5 text-[0.65rem] text-muted-foreground">
                  Full uptempo loudness preserved (no -14 LUFS flattening)
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Default Dynamic Edit Preset
                </label>
                <select
                  value={defaultEditPreset}
                  onChange={(e) => setDefaultEditPreset(e.target.value as EditPreset)}
                  className="mt-1 w-full border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs"
                >
                  <option value="subtle">Subtle (light punch-zoom)</option>
                  <option value="punchy">Punchy (recommended)</option>
                  <option value="hard">Hard (aggressive zaag shakes)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Gemini Model Override (optional)
                </label>
                <input
                  type="text"
                  value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value)}
                  placeholder="Uses GEMINI_MODEL env"
                  className="mt-1 w-full border border-border/70 bg-background/80 px-2.5 py-1.5 font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Retention (Raw / Rendered / Cap)
                </label>
                <div className="mt-1 grid grid-cols-3 gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={rawRetentionDays}
                    onChange={(e) => setRawRetentionDays(Number(e.target.value) || 7)}
                    title="Raw takes retention (days post-publish)"
                    className="w-full border border-border/70 bg-background/80 px-2 py-1.5 text-xs"
                  />
                  <input
                    type="number"
                    min={7}
                    max={3650}
                    value={renderedRetentionDays}
                    onChange={(e) => setRenderedRetentionDays(Number(e.target.value) || 90)}
                    title="Rendered Reels retention (days)"
                    className="w-full border border-border/70 bg-background/80 px-2 py-1.5 text-xs"
                  />
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={storageCapGb}
                    onChange={(e) => setStorageCapGb(Number(e.target.value) || 8)}
                    title="Storage cap (GB)"
                    className="w-full border border-border/70 bg-background/80 px-2 py-1.5 text-xs"
                  />
                </div>
                <p className="mt-0.5 text-[0.65rem] text-muted-foreground">
                  {rawRetentionDays}d raw • {renderedRetentionDays}d final • {storageCapGb} GB cap
                </p>
              </div>
            </div>

            {/* Discord Webhook Alerts */}
            <div className="space-y-1.5 border-t border-border/50 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <IconBrandDiscord className="size-3.5 text-indigo-400" />
                  Discord Webhook Alerts (optional)
                </label>
                <span className="text-[0.65rem] text-muted-foreground">
                  Pings on held-for-review clips, publish failures, TikTok inbox-ready drafts &amp;
                  expiring tokens
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="url"
                  value={discordWebhookUrl}
                  onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="min-w-60 flex-1 border border-border/70 bg-background/80 px-2.5 py-1.5 font-mono text-xs"
                />
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={isTestingDiscord || !discordWebhookUrl.trim()}
                  onClick={() => void handleTestDiscordWebhook()}
                >
                  {isTestingDiscord ? (
                    <IconLoader2 className="size-3.5 animate-spin" />
                  ) : (
                    <IconBrandDiscord className="size-3.5 text-indigo-400" />
                  )}
                  <span>{isTestingDiscord ? "Sending..." : "Send Test Alert"}</span>
                </Button>
              </div>
            </div>

            {/* Artist Profile & Toggles Row */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-3">
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={avoidConsecutiveTrack}
                    onChange={(e) => setAvoidConsecutiveTrack(e.target.checked)}
                    className="accent-primary"
                  />
                  <span>Avoid back-to-back posts of the same track</span>
                </label>

                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={fullAutopilot}
                    onChange={(e) => setFullAutopilot(e.target.checked)}
                    className="accent-primary"
                  />
                  <span>
                    Full Autopilot by default (auto-approve &amp; schedule if sync ≥ 35% &amp;
                    Gemini succeeds)
                  </span>
                </label>

                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={burnHookOverlay}
                    onChange={(e) => setBurnHookOverlay(e.target.checked)}
                    className="accent-primary"
                  />
                  <span>Burn on-screen hook text by default</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={stageName}
                  onChange={(e) => setStageName(e.target.value)}
                  placeholder="Stage Name"
                  className="w-28 border border-border/70 bg-background/80 px-2 py-1 text-xs"
                />
                <input
                  type="text"
                  value={defaultBioLink}
                  onChange={(e) => setDefaultBioLink(e.target.value)}
                  placeholder="https://lilsbd.com"
                  className="w-40 border border-border/70 bg-background/80 px-2 py-1 text-xs"
                />
                <Button type="submit" size="sm" disabled={isSavingSettings}>
                  <IconCheck className="size-4" />
                  <span>{isSavingSettings ? "Saving..." : "Save Defaults"}</span>
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ====================================================================
          2. CONNECTED SOCIAL ACCOUNTS (WITH TOKEN HEALTH)
          ==================================================================== */}
      <Card className="border border-border/70 bg-card/45">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <IconPlugConnected className="size-5 text-primary" />
                Connected Social Accounts
              </CardTitle>
              <CardDescription className="text-xs">
                Native direct publishing to YouTube Shorts, Instagram Reels, and TikTok with
                automatic retry backoff.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs">
              {connections.length} / 3 Linked
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
                    conn?.tokenHealth === "expired"
                      ? "border-rose-500/50 bg-rose-500/10"
                      : conn?.tokenHealth === "expiring_soon"
                        ? "border-amber-500/50 bg-amber-500/10"
                        : conn
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
                        conn.tokenHealth === "expired" ? (
                          <Badge className="border-rose-500/50 bg-rose-500/20 text-[0.62rem] text-rose-200">
                            <IconAlertTriangle className="mr-1 size-3" />
                            Expired
                          </Badge>
                        ) : conn.tokenHealth === "expiring_soon" ? (
                          <Badge className="border-amber-500/50 bg-amber-500/20 text-[0.62rem] text-amber-200">
                            Expires in {conn.daysUntilExpiry}d
                          </Badge>
                        ) : (
                          <Badge className="border-emerald-500/40 bg-emerald-500/20 text-[0.62rem] text-emerald-200">
                            {conn.hasRefreshToken ? "Auto-Refresh" : "Connected"}
                          </Badge>
                        )
                      ) : (
                        <Badge variant="outline" className="text-[0.62rem] text-muted-foreground">
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
                          onClick={() => void handleTestConnection(platform)}
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
                          onClick={() => void handleDisconnect(platform)}
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
                  <span className="font-semibold text-muted-foreground">OAuth Redirect URI: </span>
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
                    Optional OAuth Refresh Token
                  </label>
                  <input
                    type="password"
                    value={connRefreshToken}
                    onChange={(e) => setConnRefreshToken(e.target.value)}
                    placeholder="Auto-renews access token..."
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
                    onChange={(e) => setConnTiktokMode(e.target.value as "inbox" | "direct")}
                    className="mt-1 w-full border border-border/80 bg-card/50 px-3 py-1.5 text-xs"
                  >
                    <option value="inbox">Inbox Draft Push (works without public app audit)</option>
                    <option value="direct">Direct Public Post (requires audited TikTok app)</option>
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
                      setConnYoutubePrivacy(e.target.value as "public" | "unlisted" | "private")
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
                  Set {PLATFORM_SETUP_GUIDES[configuringPlatform].oauthEnvHint} in .env for 1-click
                  OAuth.
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
          3. TRACK & UNRELEASED DEMO CATALOG (AUDIO BRAIN)
          ==================================================================== */}
      <Card className="border border-border/70 bg-card/45">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <IconDisc className="size-4.5 text-primary" />
                Track & Demo Catalog ({catalog.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Released tracks + uploaded unreleased WAV/MP3 demos with cached BPM, beat grids,
                and drop markers.
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
                variant={tracksNeedingV2 > 0 ? "default" : "outline"}
                disabled={isAnalyzingAll || catalog.length === 0 || activeAnalyzeJobs.length > 0}
                onClick={() => void handleAnalyzeAllTracks(tracksNeedingV2 === 0)}
                title={
                  tracksNeedingV2 > 0
                    ? "Upgrade tracks to Audio Brain v2 (precise BPM, multi-BPM, unlimited drops & kick switches)"
                    : "Re-analyze every track in catalog with Audio Brain v2"
                }
              >
                {activeAnalyzeJobs.length > 0 ? (
                  <IconLoader2 className="size-3.5 animate-spin" />
                ) : (
                  <IconWaveSine className={cn("size-3.5", isAnalyzingAll && "animate-pulse")} />
                )}
                <span>
                  {activeAnalyzeJobs.length > 0
                    ? `Analyzing (${activeAnalyzeJobs.length} left)...`
                    : isAnalyzingAll
                      ? "Queuing..."
                      : tracksNeedingV2 > 0
                        ? `Upgrade All to v2 (${tracksNeedingV2})`
                        : "Re-Analyze All (v2)"}
                </span>
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
                <label className="text-xs font-semibold text-muted-foreground">Title *</label>
                <input
                  type="text"
                  required
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                  placeholder="UNRELEASED ID #1"
                  className="mt-1 w-full border border-border/70 bg-card/50 px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">BPM</label>
                <input
                  type="number"
                  value={itemBpm}
                  onChange={(e) => setItemBpm(Number(e.target.value) || 200)}
                  className="mt-1 w-full border border-border/70 bg-card/50 px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Release Date</label>
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
                      Used for auto-sync & direct clean audio swap
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

          {auditioning ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border border-primary/50 bg-primary/12 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <IconPlayerPlay className="size-3.5 shrink-0 text-primary animate-pulse" />
                <span className="truncate font-semibold text-foreground">
                  {auditioning.trackTitle}
                </span>
                <span className="truncate text-muted-foreground">
                  {auditioning.label} @ {formatSec(auditioning.targetSec)} (2s pre-roll)
                </span>
              </div>
              <Button size="xs" variant="outline" onClick={stopAudition}>
                <IconPlayerStop className="size-3.5" />
                <span>Stop</span>
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[0.68rem] text-muted-foreground">
              <span>
                Click any marker pill or waveform spot to audition 2 seconds before the hit.
              </span>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 bg-primary inline-block" /> Drop
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 bg-fuchsia-400 inline-block" /> Highlight
                </span>
              </div>
            </div>
          )}

          {catalog.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-border/60 py-6 text-center">
              <p className="text-xs text-muted-foreground">
                No tracks in catalog yet. Click &ldquo;Sync Site Releases&rdquo; or upload an
                unreleased demo WAV/MP3.
              </p>
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {catalog.map((item) => {
                const analysis = item.audioAnalysis;
                const isAnalyzing = analyzingTrackId === item.id;
                const isSavingMeta = savingMetaTrackId === item.id;
                const hasAudio = Boolean(item.masterAudioPath || item.audioPreviewUrl);
                const isMultiBpm = Boolean(analysis?.bpmRange);
                const bpmDisplay = analysis?.bpmRange
                  ? `${analysis.bpmRange[0]}–${analysis.bpmRange[1]} BPM`
                  : `${analysis ? analysis.bpm : (item.bpm ?? 200)} BPM`;

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex flex-col justify-between gap-2 border bg-background/60 p-3 transition-colors",
                      auditioning?.trackId === item.id
                        ? "border-primary/70 bg-primary/5"
                        : "border-border/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {item.artworkUrl ? (
                          <img
                            src={item.artworkUrl}
                            alt={item.title}
                            className="size-10 shrink-0 border border-white/10 object-cover"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-xs font-bold text-foreground">
                              {item.title}
                            </p>
                            {analysis && (analysis.version ?? 1) < 2 ? (
                              <span className="shrink-0 border border-amber-500/40 bg-amber-500/10 px-1 text-[0.58rem] font-semibold text-amber-300">
                                v1
                              </span>
                            ) : null}
                          </div>
                          {editingBpmTrackId === item.id ? (
                            <div className="mt-1 flex items-center gap-1">
                              <input
                                type="number"
                                min={60}
                                max={350}
                                value={editingBpmValue}
                                onChange={(e) => setEditingBpmValue(Number(e.target.value) || 200)}
                                className="w-16 border border-primary/60 bg-background px-1.5 py-0.5 text-[0.68rem]"
                              />
                              <button
                                type="button"
                                disabled={isSavingMeta}
                                onClick={() => void handleToggleBpmLock(item, editingBpmValue)}
                                className="border border-primary/50 bg-primary/20 px-1.5 py-0.5 text-[0.62rem] font-semibold text-primary-foreground"
                              >
                                Lock
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingBpmTrackId(null)}
                                className="text-[0.62rem] text-muted-foreground hover:text-foreground"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <p className="flex flex-wrap items-center gap-1 text-[0.68rem] text-muted-foreground">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingBpmTrackId(item.id);
                                  setEditingBpmValue(
                                    Math.round(analysis?.bpm ?? item.bpm ?? 200),
                                  );
                                }}
                                title="Click to set & lock BPM manually"
                                className={cn(
                                  "inline-flex items-center gap-0.5 font-semibold hover:text-foreground",
                                  analysis?.bpmLocked
                                    ? "text-amber-300"
                                    : isMultiBpm
                                      ? "text-fuchsia-300"
                                      : "text-foreground/85",
                                )}
                              >
                                {analysis?.bpmLocked ? (
                                  <IconLock className="size-2.5" />
                                ) : null}
                                {bpmDisplay}
                              </button>
                              <span>• {item.albumOrChapter || "Single"}</span>
                              {analysis ? <span>• {formatSec(analysis.durationSec)}</span> : null}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {analysis ? (
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            disabled={isSavingMeta}
                            onClick={() => void handleToggleBpmLock(item)}
                            title={
                              analysis.bpmLocked
                                ? "BPM is locked (click to unlock auto-detection)"
                                : "Lock detected BPM"
                            }
                          >
                            {analysis.bpmLocked ? (
                              <IconLock className="size-3.5 text-amber-300" />
                            ) : (
                              <IconLockOpen className="size-3.5 text-muted-foreground" />
                            )}
                          </Button>
                        ) : null}
                        {hasAudio ? (
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            disabled={isAnalyzing}
                            onClick={() => void handleAnalyzeTrack(item.id, item.title)}
                            title="Re-analyze BPM, beat grid, drops & kick switches (Audio Brain v2)"
                          >
                            {isAnalyzing ? (
                              <IconLoader2 className="size-3.5 animate-spin text-primary" />
                            ) : (
                              <IconWaveSine
                                className={cn(
                                  "size-3.5",
                                  analysis && (analysis.version ?? 1) >= 2
                                    ? "text-emerald-400"
                                    : analysis
                                      ? "text-amber-400"
                                      : "text-muted-foreground",
                                )}
                              />
                            )}
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
                          onClick={() => void handleDeleteItem(item.id)}
                          title="Delete track"
                        >
                          <IconTrash className="size-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    {analysis ? (
                      <div className="space-y-1.5 border-t border-border/40 pt-2">
                        {/* Clickable Waveform Bar with Drop / Kick Switch / Kickroll highlights */}
                        <div className="flex h-6 items-end gap-[1px] overflow-hidden bg-card/40 px-1 py-0.5">
                          {analysis.energyEnvelope.slice(0, 80).map((amp, idx) => {
                            const totalBars = Math.max(
                              1,
                              Math.min(80, analysis.energyEnvelope.length),
                            );
                            const barTime = (idx / totalBars) * analysis.durationSec;
                            const stepSec = analysis.durationSec / totalBars;
                            const hasHighlight = analysis.drops.some(
                              (d) =>
                                (d.kind ?? "drop") !== "drop" &&
                                Math.abs(barTime - d.dropImpactSec) <= Math.max(1.2, stepSec),
                            );
                            const inDrop = analysis.drops.some(
                              (d) =>
                                (d.kind ?? "drop") === "drop" &&
                                barTime >= d.dropImpactSec &&
                                barTime <= d.endSec,
                            );
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() =>
                                  handleAuditionTimestamp(
                                    item,
                                    barTime,
                                    `wave-${idx}`,
                                    "Waveform",
                                    0,
                                  )
                                }
                                title={`Play from ${formatSec(barTime)}`}
                                style={{ height: `${Math.max(12, Math.round(amp * 100))}%` }}
                                className={cn(
                                  "flex-1 cursor-pointer rounded-[1px] transition-opacity hover:opacity-100",
                                  hasHighlight
                                    ? "bg-fuchsia-400"
                                    : inDrop
                                      ? "bg-primary"
                                      : "bg-muted-foreground/35",
                                )}
                              />
                            );
                          })}
                        </div>

                        {/* Unlimited Color-Coded Auditionable Markers */}
                        <div className="flex flex-wrap items-center gap-1 text-[0.63rem] text-muted-foreground">
                          <span className="border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-300">
                            {analysis.barsSec.length} bars
                          </span>
                          {analysis.drops.map((d, i) => {
                            const isHighlight = (d.kind ?? "drop") !== "drop";
                            const markerKey = d.id || `${d.kind ?? "drop"}-${i}-${d.dropImpactSec}`;
                            const isPlayingThis =
                              auditioning?.trackId === item.id &&
                              auditioning.markerKey === markerKey;
                            const pillStyle = isHighlight
                              ? isPlayingThis
                                ? "border-fuchsia-400 bg-fuchsia-500/35 text-white"
                                : "border-fuchsia-500/45 bg-fuchsia-500/12 text-fuchsia-200 hover:bg-fuchsia-500/25"
                              : isPlayingThis
                                ? "border-primary bg-primary/40 text-white"
                                : "border-primary/40 bg-primary/12 text-primary-foreground hover:bg-primary/25";

                            const shortPrefix = isHighlight
                              ? "Highlight"
                              : d.label.replace(/\s*\/\s*Kick Switch/i, "");

                            return (
                              <span
                                key={markerKey}
                                className={cn(
                                  "inline-flex items-center border transition-colors",
                                  pillStyle,
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleAuditionTimestamp(
                                      item,
                                      d.dropImpactSec,
                                      markerKey,
                                      shortPrefix,
                                    )
                                  }
                                  title={`Audition ${shortPrefix} (${formatSec(d.dropImpactSec)}, plays 2s early)`}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 cursor-pointer"
                                >
                                  {isPlayingThis ? (
                                    <IconPlayerStop className="size-2.5 shrink-0" />
                                  ) : (
                                    <IconPlayerPlay className="size-2.5 shrink-0 opacity-70" />
                                  )}
                                  <span>
                                    {shortPrefix}
                                    {isMultiBpm && d.bpm ? ` · ${d.bpm}` : ""}:{" "}
                                    {formatSec(d.dropImpactSec)}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isSavingMeta}
                                  onClick={() => void handleRemoveMarker(item, d.id, i)}
                                  title="Remove marker"
                                  className="border-l border-current/20 px-1 py-0.5 opacity-60 hover:opacity-100"
                                >
                                  ×
                                </button>
                              </span>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => {
                              setAddingMarkerTrackId(
                                addingMarkerTrackId === item.id ? null : item.id,
                              );
                              setNewMarkerTimeInput("");
                            }}
                            title="Add manual Drop or Highlight marker"
                            className="inline-flex items-center gap-0.5 border border-dashed border-border/70 px-1.5 py-0.5 text-muted-foreground hover:border-primary/60 hover:text-foreground"
                          >
                            <IconPlus className="size-2.5" />
                            <span>Marker</span>
                          </button>
                        </div>

                        {addingMarkerTrackId === item.id ? (
                          <div className="flex flex-wrap items-center gap-1.5 border border-primary/35 bg-card/60 p-1.5 text-[0.65rem]">
                            <select
                              value={newMarkerKind}
                              onChange={(e) =>
                                setNewMarkerKind(e.target.value as TrackSectionKind)
                              }
                              className="border border-border/70 bg-background px-1.5 py-0.5 text-[0.65rem]"
                            >
                              <option value="drop">Drop</option>
                              <option value="highlight">Highlight</option>
                            </select>
                            <input
                              type="text"
                              value={newMarkerTimeInput}
                              onChange={(e) => setNewMarkerTimeInput(e.target.value)}
                              placeholder="m:ss (e.g. 1:15)"
                              className="w-24 border border-border/70 bg-background px-1.5 py-0.5 font-mono text-[0.65rem]"
                            />
                            <button
                              type="button"
                              disabled={isSavingMeta}
                              onClick={() => void handleAddManualMarker(item)}
                              className="border border-primary/50 bg-primary/20 px-2 py-0.5 font-semibold text-primary-foreground hover:bg-primary/35"
                            >
                              Add
                            </button>
                            <button
                              type="button"
                              onClick={() => setAddingMarkerTrackId(null)}
                              className="px-1 text-muted-foreground hover:text-foreground"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : null}
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
          4. SAVED HASHTAG PACKS
          ==================================================================== */}
      <Card className="border border-border/70 bg-card/45">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">
                Saved Hashtag Packs ({hashtagPresets.length})
              </CardTitle>
              <CardDescription className="text-xs">
                1-tap tag bundles available inside Quick Tweak.
              </CardDescription>
            </div>
            <Button size="xs" variant="outline" onClick={() => setShowAddPreset((v) => !v)}>
              <IconPlus className="size-3.5" />
              New Pack
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {showAddPreset ? (
            <form
              onSubmit={handleCreatePreset}
              className="flex flex-wrap gap-2 border border-primary/35 bg-background/80 p-3"
            >
              <input
                type="text"
                required
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Pack name (e.g., Zaag Core)"
                className="flex-1 min-w-36 border border-border/70 bg-card/50 px-2.5 py-1 text-xs"
              />
              <input
                type="text"
                required
                value={presetTagsInput}
                onChange={(e) => setPresetTagsInput(e.target.value)}
                placeholder="#uptempohardcore #zaagkick #harddance"
                className="flex-2 min-w-52 border border-border/70 bg-card/50 px-2.5 py-1 text-xs"
              />
              <Button type="submit" size="xs">
                Save Pack
              </Button>
            </form>
          ) : null}

          {hashtagPresets.length === 0 ? (
            <p className="text-xs text-muted-foreground">No saved hashtag packs yet.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
                    onClick={() => void handleDeletePreset(preset.id)}
                  >
                    <IconTrash className="size-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ====================================================================
          5. STORAGE METER, CONVEYOR-BELT CLEANUP & COOLIFY READINESS
          ==================================================================== */}
      <div className="grid gap-6 lg:grid-cols-2">
        {storageStats ? (
          <Card className="border border-border/70 bg-card/45">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    Storage & Conveyor-Belt Retention
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Mode:{" "}
                    <strong>
                      {storageStats.storageMode === "s3_r2"
                        ? "Cloudflare R2 / S3"
                        : "Local Hetzner NVMe"}
                    </strong>{" "}
                    • Auto-cleans every 12h
                  </CardDescription>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={isRunningCleanup}
                  onClick={() => void handleRunCleanupNow()}
                >
                  {isRunningCleanup ? (
                    <IconLoader2 className="size-3.5 animate-spin" />
                  ) : (
                    <IconTrash className="size-3.5" />
                  )}
                  <span>{isRunningCleanup ? "Cleaning..." : "Run Cleanup Now"}</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                const capBytes = Math.max(1, storageCapGb) * 1024 * 1024 * 1024;
                const pct = Math.min(100, Math.round((storageStats.totalBytes / capBytes) * 100));
                return (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground">
                        {formatMb(storageStats.totalBytes)} used
                      </span>
                      <span className="text-muted-foreground">
                        Cap: {storageCapGb} GB ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden bg-muted">
                      <div
                        className={cn(
                          "h-full transition-all",
                          pct >= 85 ? "bg-rose-400" : pct >= 60 ? "bg-amber-400" : "bg-primary",
                        )}
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {(
                  [
                    ["raw", "Raw Takes"],
                    ["rendered", "Final Renders"],
                    ["masters", "Demo Masters"],
                    ["thumbs", "Thumbnails"],
                  ] as const
                ).map(([ns, label]) => {
                  const info = storageStats.byNamespace[ns] ?? { files: 0, bytes: 0 };
                  return (
                    <div
                      key={ns}
                      className="border border-border/60 bg-background/60 p-2 text-center"
                    >
                      <p className="text-[0.64rem] text-muted-foreground">{label}</p>
                      <p className="font-bold text-foreground">{formatMb(info.bytes)}</p>
                      <p className="text-[0.62rem] text-muted-foreground">{info.files} file(s)</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {diagnostics ? (
          <Card className="border border-border/70 bg-card/45">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Production Readiness Diagnostics</CardTitle>
              <CardDescription className="text-xs">
                Live checks for Coolify / Hetzner auto-editing and multi-platform publishing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {[
                {
                  ok: diagnostics.ffmpegAvailable,
                  label: "Native FFmpeg & ffprobe",
                  detail: diagnostics.ffmpegAvailable
                    ? "Installed & ready for audio sync + 1080×1920 rendering"
                    : "Not found in PATH — install ffmpeg in Docker image",
                },
                {
                  ok: diagnostics.geminiConfigured,
                  label: `Gemini AI Director (${diagnostics.geminiModel})`,
                  detail: diagnostics.geminiConfigured
                    ? "API key active (360p @ 2fps token-efficient proxy)"
                    : "Optional: set GEMINI_API_KEY in .env (DSP fallback active)",
                },
                {
                  ok: diagnostics.publicHttpsReady,
                  label: "Public HTTPS URL (Instagram Reels requirement)",
                  detail: diagnostics.publicHttpsReady
                    ? diagnostics.publicBaseUrl
                    : `Currently ${diagnostics.publicBaseUrl} — set PUBLIC_APP_URL=https://... in Coolify for IG Reels`,
                },
                {
                  ok: diagnostics.storageMode === "s3_r2" || true,
                  label: "Media Storage Adapter",
                  detail:
                    diagnostics.storageMode === "s3_r2"
                      ? "Cloudflare R2 / S3 active"
                      : "Local NVMe active (flip to Cloudflare R2 anytime via S3_* env vars)",
                },
                {
                  ok: Boolean(diagnostics.cronSecretConfigured),
                  label: "Unattended Cron Heartbeat (/api/socials/cron)",
                  detail: diagnostics.cronSecretConfigured
                    ? "CRON_SECRET set — worker auto-boots on server start + accepts Bearer/secret pings"
                    : "Worker auto-boots on startup. Set CRON_SECRET in Coolify to enable external POST /api/socials/cron pings",
                },
                {
                  ok: Boolean(diagnostics.discordWebhookConfigured),
                  label: "Discord Autopilot Alerts",
                  detail: diagnostics.discordWebhookConfigured
                    ? "Webhook configured for held clips, failures, TikTok drafts & expiring tokens"
                    : "Optional: paste a Discord webhook URL above to get phone pings while away",
                },
              ].map((row, idx) => (
                <div
                  key={idx}
                  className="flex items-start justify-between gap-3 border border-border/50 bg-background/60 p-2.5"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{row.label}</p>
                    <p className="text-[0.68rem] text-muted-foreground">{row.detail}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 text-[0.62rem]",
                      row.ok
                        ? "border-emerald-500/40 text-emerald-300"
                        : "border-amber-500/40 text-amber-200",
                    )}
                  >
                    {row.ok ? "Ready" : "Action"}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
