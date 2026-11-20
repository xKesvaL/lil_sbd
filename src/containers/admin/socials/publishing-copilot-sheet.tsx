import {
  IconBolt,
  IconCalendarClock,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconCopy,
  IconExternalLink,
  IconListCheck,
  IconLoader2,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconRocket,
  IconSparkles,
  IconTrash,
  IconUpload,
  IconVideo,
  IconWand,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "#/components/ui/sheet";
import type {
  ArtistCatalogItemRecord,
  ArtistProfileRecord,
  ContentPillar,
  HashtagPresetRecord,
  PerformanceRating,
  PlatformDeliveries,
  PostStatus,
  PreFlightChecklist,
  PublishablePlatform,
  ReleaseCampaignRecord,
  ShotListItem,
  SocialConnectionMetadata,
  SocialPlatform,
  SocialPostRecord,
} from "#/db/schema";
import { cn } from "#/lib/utils";
import {
  createCustomIdeaTemplateServerFn,
  createHashtagPresetServerFn,
  deleteHashtagPresetServerFn,
  deleteSocialPostServerFn,
  publishPostNowServerFn,
  upsertSocialPostServerFn,
} from "#/server/socials";
import {
  DELIVERY_STATUS_META,
  PERFORMANCE_RATING_META,
  PILLAR_META,
  PLATFORM_META,
  PUBLISHABLE_PLATFORMS,
  STATUS_COLUMNS,
} from "./social-constants";

export interface SafeSocialConnection {
  id: string;
  platform: PublishablePlatform;
  accountName: string;
  externalAccountId: string;
  hasRefreshToken: boolean;
  tokenExpiresAt: Date | string | null;
  metadata: SocialConnectionMetadata;
  updatedAt: Date | string;
}

interface PublishingCopilotSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: SocialPostRecord | null;
  defaultDate?: string;
  defaultStatus?: PostStatus;
  profile: ArtistProfileRecord;
  catalog: ArtistCatalogItemRecord[];
  campaigns: ReleaseCampaignRecord[];
  hashtagPresets: HashtagPresetRecord[];
  connections: SafeSocialConnection[];
  onSaved: () => Promise<void>;
  onNavigateToAccounts?: () => void;
}

const DEFAULT_CHECKLIST: PreFlightChecklist = {
  highResExport: false,
  coverFrameSelected: false,
  audioSynced: false,
  linkInBioUpdated: false,
};

function toDateTimeLocalString(d?: Date | string | null): string {
  const dateObj = d ? new Date(d) : new Date(Date.now() + 3600_000);
  if (Number.isNaN(dateObj.getTime())) {
    return new Date().toISOString().slice(0, 16);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}T${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type StudioStep = "compose" | "schedule" | "advanced";

export function PublishingCopilotSheet({
  open,
  onOpenChange,
  post,
  defaultDate,
  defaultStatus = "ready",
  profile,
  catalog,
  campaigns,
  hashtagPresets,
  connections,
  onSaved,
  onNavigateToAccounts,
}: PublishingCopilotSheetProps) {
  const [activeStep, setActiveStep] = useState<StudioStep>("compose");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [isPublishingNow, setIsPublishingNow] = useState(false);
  const [publishingPlatform, setPublishingPlatform] = useState<PublishablePlatform | null>(null);
  const [showManualCopyFallback, setShowManualCopyFallback] = useState(false);

  // Core post fields
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<PostStatus>("ready");
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([
    "instagram_reels",
    "tiktok",
    "youtube_shorts",
  ]);
  const [pillar, setPillar] = useState<ContentPillar>("drop_showcase");
  const [catalogItemId, setCatalogItemId] = useState<string>("");
  const [campaignId, setCampaignId] = useState<string>("");
  const [scheduledFor, setScheduledFor] = useState<string>(toDateTimeLocalString());
  const [audioTimestamp, setAudioTimestamp] = useState("");

  // Video & Auto-Publish state
  const [videoUrl, setVideoUrl] = useState("");
  const [videoFileName, setVideoFileName] = useState("");
  const [videoSizeBytes, setVideoSizeBytes] = useState<number | null>(null);
  const [autoPublish, setAutoPublish] = useState(true);
  const [platformDeliveries, setPlatformDeliveries] = useState<PlatformDeliveries>({});

  // Single-language copy fields (no EN/FR split or separate CTA input)
  const [onScreenHook, setOnScreenHook] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState("");
  const [newPresetName, setNewPresetName] = useState("");
  const [showSavePresetInput, setShowSavePresetInput] = useState(false);

  // Advanced: Shot list, checklist, metrics
  const [shotList, setShotList] = useState<ShotListItem[]>([]);
  const [newShotText, setNewShotText] = useState("");
  const [preFlightChecklist, setPreFlightChecklist] =
    useState<PreFlightChecklist>(DEFAULT_CHECKLIST);
  const [publishedUrl, setPublishedUrl] = useState("");
  const [views, setViews] = useState(0);
  const [likes, setLikes] = useState(0);
  const [saves, setSaves] = useState(0);
  const [shares, setShares] = useState(0);
  const [comments, setComments] = useState(0);
  const [performanceRating, setPerformanceRating] = useState<PerformanceRating | "">("");
  const [retrospectiveNotes, setRetrospectiveNotes] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  useEffect(() => {
    if (!open) {
      setIsPlayingPreview(false);
      if (audioRef.current) {
        audioRef.current.pause();
      }
      return;
    }

    if (post && post.id) {
      setTitle(post.title);
      setStatus(post.status);
      const validPlatforms = (post.platforms ?? []).filter((p) =>
        PUBLISHABLE_PLATFORMS.includes(p as PublishablePlatform),
      );
      setPlatforms(
        validPlatforms.length > 0
          ? validPlatforms
          : ["instagram_reels", "tiktok", "youtube_shorts"],
      );
      setPillar(post.pillar);
      setCatalogItemId(post.catalogItemId ?? "");
      setCampaignId(post.campaignId ?? "");
      setScheduledFor(toDateTimeLocalString(post.scheduledFor));
      setAudioTimestamp(post.audioTimestamp ?? "");
      setVideoUrl(post.videoUrl ?? "");
      setVideoFileName(post.videoFileName ?? "");
      setVideoSizeBytes(post.videoSizeBytes ?? null);
      setAutoPublish(post.autoPublish ?? false);
      setPlatformDeliveries(post.platformDeliveries ?? {});
      setOnScreenHook(post.onScreenHookEn || post.onScreenHookFr || "");
      // Merge legacy ctaEn into caption if present and not already inside caption
      const rawCap = post.captionEn || post.captionFr || "";
      const rawCta = post.ctaEn || post.ctaFr || "";
      setCaption(
        rawCta && !rawCap.includes(rawCta) ? `${rawCap}\n\n${rawCta}`.trim() : rawCap,
      );
      setHashtags(post.hashtags ?? []);
      setShotList(post.shotList ?? []);
      setPreFlightChecklist(post.preFlightChecklist ?? DEFAULT_CHECKLIST);
      setPublishedUrl(post.publishedUrl ?? "");
      setViews(post.views ?? 0);
      setLikes(post.likes ?? 0);
      setSaves(post.saves ?? 0);
      setShares(post.shares ?? 0);
      setComments(post.comments ?? 0);
      setPerformanceRating(post.performanceRating ?? "");
      setRetrospectiveNotes(post.retrospectiveNotes ?? "");
    } else {
      setTitle("");
      setStatus(defaultStatus);
      setPlatforms(["instagram_reels", "tiktok", "youtube_shorts"]);
      setPillar("drop_showcase");
      setCatalogItemId(catalog[0]?.id ?? "");
      setCampaignId("");
      setScheduledFor(
        defaultDate ? toDateTimeLocalString(`${defaultDate}T18:00`) : toDateTimeLocalString(),
      );
      setAudioTimestamp("");
      setVideoUrl("");
      setVideoFileName("");
      setVideoSizeBytes(null);
      setAutoPublish(true);
      setPlatformDeliveries({});
      setOnScreenHook("");
      setCaption("");
      setHashtags(["#uptempohardcore", "#zaagkick", "#harddance", "#lilsbd"]);
      setShotList([]);
      setPreFlightChecklist(DEFAULT_CHECKLIST);
      setPublishedUrl("");
      setViews(0);
      setLikes(0);
      setSaves(0);
      setShares(0);
      setComments(0);
      setPerformanceRating("");
      setRetrospectiveNotes("");
    }
    setActiveStep("compose");
    setShowSavePresetInput(false);
    setShowManualCopyFallback(false);
    setNewPresetName("");
  }, [post, open, defaultStatus, defaultDate, catalog]);

  const linkedCatalogItem = catalog.find((c) => c.id === catalogItemId) ?? null;

  const togglePlatform = (p: PublishablePlatform) => {
    setPlatforms((prev) =>
      prev.includes(p)
        ? prev.length > 1
          ? prev.filter((item) => item !== p)
          : prev
        : [...prev, p],
    );
  };

  const handleVideoFileUpload = async (file: File) => {
    setIsUploadingVideo(true);
    try {
      const formData = new FormData();
      formData.append("video", file);
      const res = await fetch("/api/socials/upload", {
        method: "POST",
        body: formData,
      });
      const json = (await res.json()) as {
        videoUrl?: string;
        videoFileName?: string;
        videoSizeBytes?: number;
        error?: string;
      };
      if (!res.ok || !json.videoUrl) {
        throw new Error(json.error || "Video upload failed");
      }
      setVideoUrl(json.videoUrl);
      setVideoFileName(json.videoFileName || file.name);
      setVideoSizeBytes(json.videoSizeBytes ?? file.size);
      if (status !== "posted") {
        setStatus("ready");
      }
      toast.success(`Uploaded "${file.name}" (${formatBytes(file.size)})`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload video");
    } finally {
      setIsUploadingVideo(false);
    }
  };

  const applyHookAngle = (
    angle: "curiosity" | "contrarian" | "tutorial" | "pov" | "showcase",
  ) => {
    const trackName = linkedCatalogItem?.title || title.trim() || "this track";
    const bpm = linkedCatalogItem?.bpm ?? 200;

    const existingVariant = post?.hookVariantsEn?.[angle];
    if (existingVariant) {
      setOnScreenHook(existingVariant);
      toast.success(`Applied ${angle} hook`);
      return;
    }

    const generated: Record<typeof angle, string> = {
      curiosity: `Wait for the 2nd kick switch on ${trackName} (${bpm} BPM)...`,
      contrarian: `Clipping +12dB doesn't make a track hard. Listen to the contrast on ${trackName}:`,
      tutorial: `How I engineered the ${bpm} BPM zaag kick in ${trackName} without muddying the mix:`,
      pov: `POV: It's 4AM at the festival and the DJ drops ${trackName} (${bpm} BPM)`,
      showcase: `${trackName} — ${bpm} BPM Zaag & Melodic Pressure`,
    };
    setOnScreenHook(generated[angle]);
    if (!title.trim()) {
      setTitle(`${trackName} (${angle})`);
    }
    toast.success(`Generated ${angle} hook`);
  };

  const insertLinkIntoCaption = (urlToInsert: string, label: string) => {
    if (!urlToInsert) return;
    setCaption((prev) => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed}\n\n👉 ${urlToInsert}` : `👉 ${urlToInsert}`;
    });
    toast.success(`Inserted ${label} into caption`);
  };

  const togglePresetTags = (presetTags: string[]) => {
    const allPresent = presetTags.every((t) => hashtags.includes(t));
    if (allPresent) {
      setHashtags((prev) => prev.filter((t) => !presetTags.includes(t)));
    } else {
      setHashtags((prev) => Array.from(new Set([...prev, ...presetTags])));
    }
  };

  const addCustomTag = () => {
    const raw = customTagInput.trim();
    if (!raw) return;
    const parts = raw
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith("#") ? t : `#${t}`));
    setHashtags((prev) => Array.from(new Set([...prev, ...parts])));
    setCustomTagInput("");
  };

  const handleSaveHashtagPreset = async () => {
    if (!newPresetName.trim() || hashtags.length === 0) {
      toast.error("Enter a preset name and add at least 1 hashtag first.");
      return;
    }
    try {
      await createHashtagPresetServerFn({
        data: {
          name: newPresetName.trim(),
          platform: "all",
          tags: hashtags,
        },
      });
      await onSaved();
      setNewPresetName("");
      setShowSavePresetInput(false);
      toast.success("Saved hashtag pack!");
    } catch {
      toast.error("Failed to save hashtag pack");
    }
  };

  const handleDeleteHashtagPreset = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteHashtagPresetServerFn({ data: { id } });
      await onSaved();
      toast.success("Removed hashtag pack");
    } catch {
      toast.error("Could not delete preset");
    }
  };

  const addShotStep = () => {
    const text = newShotText.trim();
    if (!text) return;
    setShotList((prev) => [
      ...prev,
      { id: `shot-${Date.now()}`, text, completed: false },
    ]);
    setNewShotText("");
  };

  const copyText = async (text: string, label: string) => {
    if (!text.trim()) {
      toast.error(`Nothing in ${label} to copy yet`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${label}!`);
    } catch {
      toast.error("Could not access clipboard");
    }
  };

  const buildFullAssembledCaption = () => {
    const parts = [
      onScreenHook.trim() && !caption.trim().startsWith(onScreenHook.trim())
        ? onScreenHook.trim()
        : "",
      caption.trim(),
      hashtags.length ? hashtags.join(" ") : "",
    ].filter(Boolean);
    return parts.join("\n\n").trim();
  };

  const persistPostRecord = async (overrideStatus?: PostStatus, overrideAutoPublish?: boolean) => {
    const finalStatus = overrideStatus ?? status;
    const finalAutoPublish = overrideAutoPublish ?? autoPublish;
    const resolvedTitle =
      title.trim() ||
      onScreenHook.trim().slice(0, 60) ||
      linkedCatalogItem?.title ||
      "Untitled Post";

    const res = await upsertSocialPostServerFn({
      data: {
        id: post?.id || undefined,
        campaignId: campaignId || null,
        catalogItemId: catalogItemId || null,
        templateId: post?.templateId ?? null,
        title: resolvedTitle,
        status: finalStatus,
        platforms,
        pillar,
        scheduledFor,
        videoUrl: videoUrl.trim() || null,
        videoFileName: videoFileName.trim() || null,
        videoSizeBytes: videoSizeBytes ?? null,
        autoPublish: finalAutoPublish,
        platformDeliveries,
        onScreenHookEn: onScreenHook,
        onScreenHookFr: onScreenHook,
        shotList,
        audioTimestamp: audioTimestamp.trim() || null,
        captionEn: caption,
        captionFr: caption,
        ctaEn: "",
        ctaFr: "",
        hashtags,
        preFlightChecklist,
        publishedUrl: publishedUrl || null,
        views: Number(views) || 0,
        likes: Number(likes) || 0,
        saves: Number(saves) || 0,
        shares: Number(shares) || 0,
        comments: Number(comments) || 0,
        performanceRating: performanceRating || null,
        retrospectiveNotes: retrospectiveNotes || null,
      },
    });
    return res.id;
  };

  const handleSave = async (overrideStatus?: PostStatus, overrideAutoPublish?: boolean) => {
    if (!title.trim() && !onScreenHook.trim() && !caption.trim() && !videoUrl.trim()) {
      toast.error("Add a video, title, hook, or caption first.");
      return;
    }

    setIsSaving(true);
    try {
      await persistPostRecord(overrideStatus, overrideAutoPublish);
      await onSaved();
      toast.success(
        overrideAutoPublish
          ? "Post pre-programmed for automatic publishing!"
          : post?.id
            ? "Post saved!"
            : "Post added to pipeline!",
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save post");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublishNow = async (targetPlatform?: PublishablePlatform) => {
    if (!videoUrl.trim()) {
      toast.error("Upload or attach a video (.mp4) in Step 1 before publishing.");
      setActiveStep("compose");
      return;
    }

    if (targetPlatform) {
      setPublishingPlatform(targetPlatform);
    } else {
      setIsPublishingNow(true);
    }

    try {
      const savedPostId = await persistPostRecord("ready", autoPublish);
      const result = await publishPostNowServerFn({
        data: {
          postId: savedPostId,
          platforms: targetPlatform ? [targetPlatform] : undefined,
        },
      });

      setPlatformDeliveries(result.deliveries);
      await onSaved();

      if (result.allSucceeded) {
        setStatus("posted");
        toast.success("Published successfully to all selected platforms!");
      } else if (result.anySucceeded) {
        toast.success("Published to connected platforms (check status below for any errors).");
      } else {
        const firstErr = Object.values(result.deliveries).find((d) => d?.error)?.error;
        toast.error(firstErr || "Publishing failed — check platform status below.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publishing failed");
    } finally {
      setIsPublishingNow(false);
      setPublishingPlatform(null);
    }
  };

  const handleSaveAsTemplate = async () => {
    const resolvedTitle = title.trim() || onScreenHook.trim();
    if (!resolvedTitle) {
      toast.error("Add a title or hook before saving as a template.");
      return;
    }
    try {
      await createCustomIdeaTemplateServerFn({
        data: {
          title: resolvedTitle,
          description: caption.slice(0, 120) || `Reusable template from ${resolvedTitle}`,
          category: "kick_sound_design",
          pillar,
          difficulty: "daw_capture",
          recommendedPlatforms: platforms,
          hookFormulaEn: onScreenHook || resolvedTitle,
          hookFormulaFr: onScreenHook || resolvedTitle,
          captionTemplateEn: caption,
          captionTemplateFr: caption,
          defaultCtaEn: "",
          defaultCtaFr: "",
          defaultShotList: shotList.map((s) => s.text),
          suggestedHashtags: hashtags,
          whyItWorks: "Saved from Post Studio.",
        },
      });
      await onSaved();
      toast.success("Saved to Templates!");
    } catch {
      toast.error("Could not save template");
    }
  };

  const handleDelete = async () => {
    if (!post?.id) return;
    try {
      await deleteSocialPostServerFn({ data: { id: post.id } });
      await onSaved();
      toast.success("Post deleted");
      onOpenChange(false);
    } catch {
      toast.error("Could not delete post");
    }
  };

  const toggleAudioPreview = () => {
    if (!audioRef.current) return;
    if (isPlayingPreview) {
      audioRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      void audioRef.current.play();
      setIsPlayingPreview(true);
    }
  };

  const completedShots = shotList.filter((s) => s.completed).length;
  const completedPreFlight = Object.values(preFlightChecklist).filter(Boolean).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex w-full flex-col gap-0 border-l border-border/80 bg-background p-0 sm:max-w-2xl lg:max-w-3xl"
      >
        {/* Top Bar */}
        <div className="border-b border-border/70 bg-card/60 px-4 py-3.5 backdrop-blur-xl sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PostStatus)}
                className="border border-border/80 bg-background/90 px-2.5 py-1 text-xs font-semibold text-foreground focus:border-primary focus:outline-none"
              >
                {STATUS_COLUMNS.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.label}
                  </option>
                ))}
              </select>

              {videoUrl ? (
                <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-200">
                  <IconVideo className="mr-1 size-3" />
                  Video Ready
                </Badge>
              ) : null}

              {autoPublish && status !== "posted" ? (
                <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-200">
                  <IconCalendarClock className="mr-1 size-3" />
                  Pre-Programmed
                </Badge>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                size="xs"
                variant="outline"
                onClick={handleSaveAsTemplate}
                title="Save as reusable template"
              >
                <IconSparkles className="size-3.5" />
                <span className="hidden sm:inline">Save Template</span>
              </Button>
              {post?.id ? (
                <Button
                  size="icon-xs"
                  variant="destructive"
                  onClick={handleDelete}
                  title="Delete post"
                >
                  <IconTrash className="size-3.5" />
                </Button>
              ) : null}
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                title="Close"
              >
                <IconX className="size-4" />
              </Button>
            </div>
          </div>

          {/* Post Title Input */}
          <SheetTitle className="mt-2.5">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Post title (e.g., DEAD OPS 2nd Drop Switch)..."
              className="w-full border-b border-transparent bg-transparent pb-1 text-lg font-bold text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none sm:text-xl"
            />
          </SheetTitle>
          <SheetDescription className="sr-only">
            Upload video, write caption, and pre-program direct publishing to Instagram Reels,
            TikTok, and YouTube Shorts.
          </SheetDescription>

          {/* 3-Step Progressive Navigation Tabs */}
          <div className="mt-3 grid grid-cols-3 gap-1.5 border border-border/70 bg-background/80 p-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveStep("compose")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 font-semibold transition-colors",
                activeStep === "compose"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span>1. Media & Copy</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveStep("schedule")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 font-semibold transition-colors",
                activeStep === "schedule"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span>2. Schedule & Publish</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveStep("advanced")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 font-semibold transition-colors",
                activeStep === "advanced"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span>3. Advanced</span>
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* ================================================================
              STEP 1: MEDIA & COPY
              ================================================================ */}
          {activeStep === "compose" ? (
            <div className="space-y-5">
              {/* 1A. Video Upload & Preview */}
              <div className="space-y-3 border border-border/70 bg-card/35 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Short-Form Video (.MP4 / .MOV)
                    </label>
                    <p className="text-[0.7rem] text-muted-foreground">
                      Upload once — used directly for IG Reels, TikTok, and YouTube Shorts.
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleVideoFileUpload(f);
                    }}
                  />
                  <Button
                    size="sm"
                    variant={videoUrl ? "outline" : "default"}
                    disabled={isUploadingVideo}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploadingVideo ? (
                      <IconLoader2 className="size-3.5 animate-spin" />
                    ) : (
                      <IconUpload className="size-3.5" />
                    )}
                    <span>{isUploadingVideo ? "Uploading..." : videoUrl ? "Replace Video" : "Upload Video"}</span>
                  </Button>
                </div>

                {videoUrl ? (
                  <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                    <div className="overflow-hidden border border-border/70 bg-black">
                      <video
                        src={videoUrl}
                        controls
                        preload="metadata"
                        className="aspect-9/16 max-h-60 w-full object-contain"
                      />
                    </div>
                    <div className="flex flex-col justify-between gap-2 border border-border/50 bg-background/60 p-3 text-xs">
                      <div className="space-y-1">
                        <p className="font-bold text-foreground">
                          {videoFileName || "Attached Video"}
                        </p>
                        {videoSizeBytes ? (
                          <p className="text-muted-foreground">{formatBytes(videoSizeBytes)}</p>
                        ) : null}
                        <p className="break-all font-mono text-[0.68rem] text-muted-foreground">
                          {videoUrl}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => {
                            setVideoUrl("");
                            setVideoFileName("");
                            setVideoSizeBytes(null);
                          }}
                        >
                          Remove Video
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files?.[0];
                      if (f) void handleVideoFileUpload(f);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-border/80 bg-background/50 py-6 text-center transition-colors hover:border-primary/60 hover:bg-primary/5"
                  >
                    <IconVideo className="size-6 text-primary" />
                    <p className="text-xs font-semibold text-foreground">
                      Drop your 9:16 vertical .mp4 here or click to browse
                    </p>
                    <p className="text-[0.68rem] text-muted-foreground">
                      Up to 250 MB • Stored on your server for scheduled publishing
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="Or paste a direct .mp4 URL (https://...)..."
                    className="w-full border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              {/* 1B. Linked Track Quick Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border border-border/60 bg-card/30 p-3">
                <div className="flex flex-1 items-center gap-2.5 min-w-[200px]">
                  <label className="shrink-0 text-xs font-semibold text-muted-foreground">
                    Track:
                  </label>
                  <select
                    value={catalogItemId}
                    onChange={(e) => setCatalogItemId(e.target.value)}
                    className="flex-1 border border-border/70 bg-background/90 px-2.5 py-1.5 text-xs text-foreground"
                  >
                    <option value="">Standalone (No specific track)</option>
                    {catalog.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title} {item.bpm ? `(${item.bpm} BPM)` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {linkedCatalogItem?.audioPreviewUrl ? (
                  <div className="flex items-center gap-1.5">
                    <audio
                      ref={audioRef}
                      src={linkedCatalogItem.audioPreviewUrl}
                      onEnded={() => setIsPlayingPreview(false)}
                    />
                    <Button size="xs" variant="outline" onClick={toggleAudioPreview}>
                      {isPlayingPreview ? (
                        <IconPlayerPause className="size-3.5" />
                      ) : (
                        <IconPlayerPlay className="size-3.5" />
                      )}
                      <span>{isPlayingPreview ? "Pause" : "Audition"}</span>
                    </Button>
                  </div>
                ) : null}
              </div>

              {/* 1C. On-Screen Hook / Short Title */}
              <div className="space-y-2 border border-primary/30 bg-primary/6 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Hook / YouTube Shorts Title
                    </label>
                    <p className="text-[0.68rem] text-muted-foreground">
                      Opening line & Shorts title (auto-adds #Shorts on YouTube).
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[0.65rem]">
                    {onScreenHook.length}/90
                  </Badge>
                </div>

                <textarea
                  rows={2}
                  value={onScreenHook}
                  onChange={(e) => setOnScreenHook(e.target.value)}
                  placeholder="Write your opening hook or click a quick generator below..."
                  className="w-full border border-border/80 bg-background/90 p-2.5 text-sm font-semibold text-foreground focus:border-primary focus:outline-none"
                />

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 inline-flex items-center gap-1 text-[0.68rem] text-muted-foreground">
                    <IconWand className="size-3.5 text-primary" />
                    Generate:
                  </span>
                  {(
                    [
                      ["curiosity", "Curiosity"],
                      ["contrarian", "Hot Take"],
                      ["tutorial", "DAW Breakdown"],
                      ["pov", "Festival POV"],
                      ["showcase", "Showcase"],
                    ] as const
                  ).map(([angle, label]) => (
                    <button
                      key={angle}
                      type="button"
                      onClick={() => applyHookAngle(angle)}
                      className="border border-border/70 bg-background/70 px-2 py-0.5 text-[0.68rem] font-medium text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 1D. Single Caption Body */}
              <div className="space-y-2 border border-border/60 bg-card/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Post Caption & Description
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {linkedCatalogItem?.streamingLinks?.spotify ? (
                      <button
                        type="button"
                        onClick={() =>
                          insertLinkIntoCaption(
                            linkedCatalogItem.streamingLinks.spotify!,
                            "Spotify link",
                          )
                        }
                        className="border border-border/70 bg-background/70 px-2 py-0.5 text-[0.68rem] text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      >
                        + Spotify Link
                      </button>
                    ) : null}
                    {profile.defaultBioLink ? (
                      <button
                        type="button"
                        onClick={() =>
                          insertLinkIntoCaption(profile.defaultBioLink, "Bio link")
                        }
                        className="border border-border/70 bg-background/70 px-2 py-0.5 text-[0.68rem] text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      >
                        + Bio Link
                      </button>
                    ) : null}
                  </div>
                </div>

                <textarea
                  rows={4}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Write your caption here (include any call-to-action or links directly)..."
                  className="w-full border border-border/70 bg-background/85 p-3 text-sm leading-relaxed text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              {/* 1E. Hashtags */}
              <div className="space-y-3 border border-border/60 bg-card/30 p-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Hashtags ({hashtags.length})
                  </label>
                  {hashtags.length > 0 ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setShowSavePresetInput((v) => !v)}
                    >
                      <IconPlus className="size-3.5" />
                      Save as Pack
                    </Button>
                  ) : null}
                </div>

                {showSavePresetInput ? (
                  <div className="flex gap-2 border border-primary/30 bg-primary/10 p-2">
                    <input
                      type="text"
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      placeholder="Pack name (e.g., Uptempo Core)..."
                      className="flex-1 border border-border/70 bg-background/90 px-2.5 py-1 text-xs"
                    />
                    <Button size="xs" onClick={handleSaveHashtagPreset}>
                      Save
                    </Button>
                  </div>
                ) : null}

                {hashtagPresets.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {hashtagPresets.map((preset) => {
                      const active =
                        preset.tags.length > 0 &&
                        preset.tags.every((t) => hashtags.includes(t));
                      return (
                        <div
                          key={preset.id}
                          className={cn(
                            "inline-flex items-center border text-xs font-medium transition-colors",
                            active
                              ? "border-primary bg-primary/20 text-primary-foreground"
                              : "border-border/70 bg-background/60 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => togglePresetTags(preset.tags)}
                            className="px-2.5 py-1"
                          >
                            + {preset.name}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteHashtagPreset(preset.id, e)}
                            className="border-l border-border/50 px-1.5 py-1 text-muted-foreground hover:text-destructive"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {hashtags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {hashtags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 border border-primary/35 bg-primary/12 px-2 py-0.5 text-xs text-primary-foreground"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() =>
                            setHashtags((prev) => prev.filter((item) => item !== tag))
                          }
                          className="ml-0.5 text-muted-foreground hover:text-foreground"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customTagInput}
                    onChange={(e) => setCustomTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomTag();
                      }
                    }}
                    placeholder="Add hashtags (#uptempo #zaagkick)..."
                    className="flex-1 border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs"
                  />
                  <Button size="sm" variant="outline" onClick={addCustomTag}>
                    Add
                  </Button>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => setActiveStep("schedule")}>
                  Next: Schedule & Auto-Publish →
                </Button>
              </div>
            </div>
          ) : null}

          {/* ================================================================
              STEP 2: SCHEDULE & AUTO-PUBLISH
              ================================================================ */}
          {activeStep === "schedule" ? (
            <div className="space-y-5">
              {/* 2A. Target Platforms & Connection Status */}
              <div className="space-y-3 border border-border/70 bg-card/35 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      1. Select Target Platforms
                    </h4>
                    <p className="text-[0.7rem] text-muted-foreground">
                      Choose which short-form channels will receive this post.
                    </p>
                  </div>
                  {onNavigateToAccounts ? (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        onOpenChange(false);
                        onNavigateToAccounts();
                      }}
                    >
                      Manage Accounts
                    </Button>
                  ) : null}
                </div>

                <div className="grid gap-2.5 sm:grid-cols-3">
                  {PUBLISHABLE_PLATFORMS.map((p) => {
                    const meta = PLATFORM_META[p];
                    const selected = platforms.includes(p);
                    const conn = connections.find((c) => c.platform === p);
                    const delivery = platformDeliveries[p];
                    const delivMeta = delivery ? DELIVERY_STATUS_META[delivery.status] : null;

                    return (
                      <div
                        key={p}
                        onClick={() => togglePlatform(p)}
                        className={cn(
                          "flex cursor-pointer flex-col justify-between gap-2.5 border p-3.5 transition-all",
                          selected
                            ? "border-primary bg-primary/12 shadow-sm"
                            : "border-border/60 bg-background/40 opacity-60 hover:opacity-100",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-2 text-xs font-bold text-foreground">
                            <meta.Icon className="size-4 text-primary" />
                            {meta.label}
                          </span>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => {}}
                            className="size-4 accent-primary"
                          />
                        </div>

                        <div className="space-y-1 text-[0.68rem]">
                          {conn ? (
                            <p className="font-medium text-emerald-300">
                              ● Connected: {conn.accountName}
                            </p>
                          ) : (
                            <p className="font-medium text-amber-300">
                              ○ Not connected yet
                            </p>
                          )}
                          <p className="text-muted-foreground">{meta.publishModeHint}</p>
                        </div>

                        {delivMeta ? (
                          <div className="pt-1">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 border px-1.5 py-0.5 text-[0.62rem] font-semibold",
                                delivMeta.badgeClass,
                              )}
                            >
                              <span
                                className={cn("size-1.5 rounded-full", delivMeta.dotClass)}
                              />
                              {delivMeta.label}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2B. Schedule Date & Time + Pre-Program Toggle */}
              <div className="space-y-4 border border-primary/35 bg-primary/8 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      2. Pre-Program Release Date & Time
                    </h4>
                    <p className="text-[0.7rem] text-muted-foreground">
                      The server scheduler checks every 60s and publishes automatically when due.
                    </p>
                  </div>

                  <label className="inline-flex cursor-pointer items-center gap-2 border border-border/70 bg-background/80 px-3 py-1.5 text-xs font-semibold">
                    <input
                      type="checkbox"
                      checked={autoPublish}
                      onChange={(e) => setAutoPublish(e.target.checked)}
                      className="size-4 accent-primary"
                    />
                    <span>Auto-Publish at Scheduled Time</span>
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      Scheduled Date & Time (Local)
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduledFor}
                      onChange={(e) => setScheduledFor(e.target.value)}
                      className="mt-1 w-full border border-border/80 bg-background/95 px-3 py-2 text-sm font-semibold text-foreground focus:border-primary focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-col justify-end gap-1.5">
                    <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      Quick Time Presets
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        ["Today 18:00", 0, 18],
                        ["Tomorrow 12:00", 1, 12],
                        ["Tomorrow 18:00", 1, 18],
                        ["+3 Days 18:00", 3, 18],
                      ].map(([label, addDays, hour]) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => {
                            const d = new Date();
                            d.setDate(d.getDate() + Number(addDays));
                            d.setHours(Number(hour), 0, 0, 0);
                            setScheduledFor(toDateTimeLocalString(d));
                          }}
                          className="border border-border/70 bg-background/80 px-2 py-1 text-[0.68rem] font-medium text-muted-foreground hover:border-primary/60 hover:text-foreground"
                        >
                          <IconClock className="mr-1 inline size-3" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 2C. Direct Publish Now & Per-Platform Delivery Status */}
              <div className="space-y-3 border border-border/70 bg-card/35 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      3. Direct Execution & Platform Status
                    </h4>
                    <p className="text-[0.7rem] text-muted-foreground">
                      Trigger immediate upload or inspect per-platform delivery status.
                    </p>
                  </div>

                  <Button
                    size="sm"
                    disabled={isPublishingNow || !videoUrl}
                    onClick={() => handlePublishNow()}
                    className="gap-1.5"
                  >
                    {isPublishingNow ? (
                      <IconLoader2 className="size-4 animate-spin" />
                    ) : (
                      <IconRocket className="size-4" />
                    )}
                    <span>
                      {isPublishingNow
                        ? "Publishing to Platforms..."
                        : "Publish Now to Selected"}
                    </span>
                  </Button>
                </div>

                <div className="divide-y divide-border/50 border border-border/60 bg-background/60">
                  {PUBLISHABLE_PLATFORMS.filter((p) => platforms.includes(p)).map((p) => {
                    const meta = PLATFORM_META[p];
                    const deliv = platformDeliveries[p];
                    const stMeta = DELIVERY_STATUS_META[deliv?.status ?? "idle"];
                    const isRunningThis = publishingPlatform === p || isPublishingNow;

                    return (
                      <div
                        key={p}
                        className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <meta.Icon className="size-4 shrink-0 text-primary" />
                          <div className="min-w-0">
                            <span className="font-bold text-foreground">{meta.label}</span>
                            {deliv?.error ? (
                              <p className="text-[0.68rem] text-rose-300">{deliv.error}</p>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 border px-2 py-0.5 text-[0.65rem] font-semibold",
                              stMeta.badgeClass,
                            )}
                          >
                            <span className={cn("size-1.5 rounded-full", stMeta.dotClass)} />
                            {stMeta.label}
                          </span>

                          {deliv?.externalUrl ? (
                            <a
                              href={deliv.externalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 border border-border/70 bg-card px-2 py-0.5 text-[0.68rem] text-primary hover:underline"
                            >
                              Open
                              <IconExternalLink className="size-3" />
                            </a>
                          ) : null}

                          <Button
                            size="xs"
                            variant="outline"
                            disabled={isRunningThis || !videoUrl}
                            onClick={() => handlePublishNow(p)}
                          >
                            {publishingPlatform === p ? (
                              <IconLoader2 className="size-3 animate-spin" />
                            ) : (
                              <IconRefresh className="size-3" />
                            )}
                            <span>
                              {deliv?.status === "published" || deliv?.status === "inbox_ready"
                                ? "Re-Push"
                                : "Push Now"}
                            </span>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2D. Collapsible Manual 1-Tap Copy Fallback */}
              <div className="border border-border/60 bg-card/25">
                <button
                  type="button"
                  onClick={() => setShowManualCopyFallback((v) => !v)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <span>Manual Copy Fallback (Assembled Caption & Tags)</span>
                  {showManualCopyFallback ? (
                    <IconChevronUp className="size-4" />
                  ) : (
                    <IconChevronDown className="size-4" />
                  )}
                </button>
                {showManualCopyFallback ? (
                  <div className="space-y-3 border-t border-border/50 p-4">
                    <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap border border-border/50 bg-background/80 p-3 font-sans text-xs text-foreground/90">
                      {buildFullAssembledCaption() || "Write a hook or caption in Step 1..."}
                    </pre>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          copyText(buildFullAssembledCaption(), "Full Caption + Tags")
                        }
                      >
                        <IconCopy className="size-3.5" />
                        Copy Full Caption + Tags
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => copyText(onScreenHook, "On-Screen Hook")}
                      >
                        <IconCopy className="size-3.5" />
                        Copy Hook Only
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* ================================================================
              STEP 3: ADVANCED (SHOTS, CHECKLIST, METRICS)
              ================================================================ */}
          {activeStep === "advanced" ? (
            <div className="space-y-5">
              {/* Metadata: Pillar, Campaign, Audio Timestamp */}
              <div className="grid gap-3 border border-border/60 bg-card/30 p-4 sm:grid-cols-3">
                <div>
                  <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    Content Pillar
                  </label>
                  <select
                    value={pillar}
                    onChange={(e) => setPillar(e.target.value as ContentPillar)}
                    className="mt-1 w-full border border-border/70 bg-background/85 px-2.5 py-1.5 text-xs text-foreground"
                  >
                    {Object.entries(PILLAR_META).map(([key, meta]) => (
                      <option key={key} value={key}>
                        {meta.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    Rollout Campaign
                  </label>
                  <select
                    value={campaignId}
                    onChange={(e) => setCampaignId(e.target.value)}
                    className="mt-1 w-full border border-border/70 bg-background/85 px-2.5 py-1.5 text-xs text-foreground"
                  >
                    <option value="">No campaign</option>
                    {campaigns.map((camp) => (
                      <option key={camp.id} value={camp.id}>
                        {camp.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    Audio Section
                  </label>
                  <input
                    type="text"
                    value={audioTimestamp}
                    onChange={(e) => setAudioTimestamp(e.target.value)}
                    placeholder="e.g., 0:42 - 0:58 (1st Drop)"
                    className="mt-1 w-full border border-border/70 bg-background/85 px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>
              </div>

              {/* Filming & DAW Shot List */}
              <div className="space-y-3 border border-border/60 bg-card/30 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Filming & DAW Shot List ({completedShots}/{shotList.length})
                </h4>

                {shotList.length > 0 ? (
                  <div className="space-y-2">
                    {shotList.map((shot, index) => (
                      <div
                        key={shot.id}
                        className={cn(
                          "flex items-start gap-2.5 border p-2.5 text-xs",
                          shot.completed
                            ? "border-emerald-500/35 bg-emerald-500/10"
                            : "border-border/60 bg-background/60",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={shot.completed}
                          onChange={() =>
                            setShotList((prev) =>
                              prev.map((item) =>
                                item.id === shot.id
                                  ? { ...item, completed: !item.completed }
                                  : item,
                              ),
                            )
                          }
                          className="mt-0.5 size-4 accent-primary"
                        />
                        <span
                          className={cn(
                            "flex-1",
                            shot.completed && "line-through text-muted-foreground",
                          )}
                        >
                          #{index + 1} {shot.text}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setShotList((prev) => prev.filter((item) => item.id !== shot.id))
                          }
                          className="text-muted-foreground hover:text-destructive"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newShotText}
                    onChange={(e) => setNewShotText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addShotStep();
                      }
                    }}
                    placeholder="Add filming step..."
                    className="flex-1 border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs"
                  />
                  <Button size="sm" variant="outline" onClick={addShotStep}>
                    Add Step
                  </Button>
                </div>
              </div>

              {/* Pre-Flight Checklist */}
              <div className="space-y-2.5 border border-border/60 bg-card/30 p-4">
                <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <IconListCheck className="size-4 text-primary" />
                  Pre-Flight Quality Checklist ({completedPreFlight}/4)
                </h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["highResExport", "1080x1920 60fps Export"],
                      ["coverFrameSelected", "Hook inside 4:5 safe zone"],
                      ["audioSynced", "Cut lands on drop transient"],
                      ["linkInBioUpdated", "Bio link updated"],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 border px-3 py-2 text-xs",
                        preFlightChecklist[key]
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                          : "border-border/60 bg-background/50 text-muted-foreground",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={preFlightChecklist[key]}
                        onChange={() =>
                          setPreFlightChecklist((prev) => ({
                            ...prev,
                            [key]: !prev[key],
                          }))
                        }
                        className="size-4 accent-primary"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Post-Publish Performance Log */}
              <div className="space-y-3 border border-border/60 bg-card/30 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Post-Publishing Performance Notes
                </h4>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                  {(
                    [
                      ["Views", views, setViews],
                      ["Likes", likes, setLikes],
                      ["Saves", saves, setSaves],
                      ["Shares", shares, setShares],
                      ["Comments", comments, setComments],
                    ] as const
                  ).map(([label, val, setter]) => (
                    <div key={label}>
                      <label className="text-[0.65rem] text-muted-foreground">{label}</label>
                      <input
                        type="number"
                        min={0}
                        value={val}
                        onChange={(e) => setter(Number(e.target.value) || 0)}
                        className="mt-0.5 w-full border border-border/70 bg-background/80 px-2 py-1 text-xs"
                      />
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(
                    Object.keys(PERFORMANCE_RATING_META) as PerformanceRating[]
                  ).map((ratingKey) => {
                    const m = PERFORMANCE_RATING_META[ratingKey];
                    const active = performanceRating === ratingKey;
                    return (
                      <button
                        key={ratingKey}
                        type="button"
                        onClick={() =>
                          setPerformanceRating((prev) =>
                            prev === ratingKey ? "" : ratingKey,
                          )
                        }
                        className={cn(
                          "border px-2.5 py-1 text-xs font-medium",
                          active
                            ? m.badgeClass
                            : "border-border/60 bg-background/50 text-muted-foreground",
                        )}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Sticky Footer Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 bg-card/90 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="text-xs text-muted-foreground">
            {autoPublish && scheduledFor ? (
              <span className="inline-flex items-center gap-1.5 text-amber-200">
                <IconCalendarClock className="size-4 text-amber-400" />
                Auto-posts {new Date(scheduledFor).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ) : (
              <span>Draft in pipeline</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isSaving}
              onClick={() => handleSave()}
            >
              Save Draft
            </Button>

            <Button
              size="sm"
              disabled={isSaving}
              onClick={() => handleSave("ready", true)}
              className="gap-1.5"
            >
              <IconCheck className="size-4" />
              <span>
                {isSaving
                  ? "Saving..."
                  : autoPublish
                    ? "Save & Pre-Program"
                    : "Save as Ready"}
              </span>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
