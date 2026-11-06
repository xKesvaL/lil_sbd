import {
  IconBookmarkPlus,
  IconCheck,
  IconCopy,
  IconDeviceMobile,
  IconListCheck,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconRocket,
  IconSparkles,
  IconTrash,
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
  PostStatus,
  PreFlightChecklist,
  ReleaseCampaignRecord,
  ShotListItem,
  SocialPlatform,
  SocialPostRecord,
} from "#/db/schema";
import { cn } from "#/lib/utils";
import {
  createCustomIdeaTemplateServerFn,
  createHashtagPresetServerFn,
  deleteHashtagPresetServerFn,
  deleteSocialPostServerFn,
  upsertSocialPostServerFn,
} from "#/server/socials";
import {
  PERFORMANCE_RATING_META,
  PILLAR_META,
  PLATFORM_META,
  STATUS_COLUMNS,
} from "./social-constants";

interface PublishingCopilotSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: SocialPostRecord | null;
  defaultStatus?: PostStatus;
  defaultDate?: string;
  profile: ArtistProfileRecord;
  catalog: ArtistCatalogItemRecord[];
  campaigns: ReleaseCampaignRecord[];
  hashtagPresets: HashtagPresetRecord[];
  onSaved: () => Promise<void>;
}

const DEFAULT_CHECKLIST: PreFlightChecklist = {
  highResExport: false,
  coverFrameSelected: false,
  audioSynced: false,
  linkInBioUpdated: false,
};

function toDateInputString(d: Date | string | null | undefined): string {
  if (!d) {
    return new Date().toISOString().slice(0, 10);
  }
  const parsed = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
}

export function PublishingCopilotSheet({
  open,
  onOpenChange,
  post,
  defaultStatus = "idea",
  defaultDate,
  profile,
  catalog,
  campaigns,
  hashtagPresets,
  onSaved,
}: PublishingCopilotSheetProps) {
  const [activeLang, setActiveLang] = useState<"en" | "fr">(
    profile.primaryLanguage === "fr" ? "fr" : "en",
  );
  // Mobile view switcher (on lg+ desktop, both columns are visible simultaneously)
  const [mobilePane, setMobilePane] = useState<"compose" | "publish" | "metrics">("compose");
  const [isSaving, setIsSaving] = useState(false);

  // Core post fields
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<PostStatus>("idea");
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([
    "instagram_reels",
    "tiktok",
    "youtube_shorts",
  ]);
  const [pillar, setPillar] = useState<ContentPillar>("drop_showcase");
  const [catalogItemId, setCatalogItemId] = useState<string>("");
  const [campaignId, setCampaignId] = useState<string>("");
  const [scheduledFor, setScheduledFor] = useState<string>(toDateInputString(new Date()));
  const [audioTimestamp, setAudioTimestamp] = useState("");

  // Copy fields
  const [onScreenHookEn, setOnScreenHookEn] = useState("");
  const [onScreenHookFr, setOnScreenHookFr] = useState("");
  const [captionEn, setCaptionEn] = useState("");
  const [captionFr, setCaptionFr] = useState("");
  const [ctaEn, setCtaEn] = useState("");
  const [ctaFr, setCtaFr] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState("");
  const [newPresetName, setNewPresetName] = useState("");
  const [showSavePresetInput, setShowSavePresetInput] = useState(false);

  // Shot list & checklist
  const [shotList, setShotList] = useState<ShotListItem[]>([]);
  const [newShotText, setNewShotText] = useState("");
  const [preFlightChecklist, setPreFlightChecklist] =
    useState<PreFlightChecklist>(DEFAULT_CHECKLIST);

  // Metrics state
  const [publishedUrl, setPublishedUrl] = useState("");
  const [views, setViews] = useState(0);
  const [likes, setLikes] = useState(0);
  const [saves, setSaves] = useState(0);
  const [shares, setShares] = useState(0);
  const [comments, setComments] = useState(0);
  const [performanceRating, setPerformanceRating] = useState<PerformanceRating | "">("");
  const [retrospectiveNotes, setRetrospectiveNotes] = useState("");

  // Inline audio preview player
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
      setPlatforms(
        post.platforms?.length
          ? post.platforms
          : ["instagram_reels", "tiktok", "youtube_shorts"],
      );
      setPillar(post.pillar);
      setCatalogItemId(post.catalogItemId ?? "");
      setCampaignId(post.campaignId ?? "");
      setScheduledFor(toDateInputString(post.scheduledFor));
      setAudioTimestamp(post.audioTimestamp ?? "");
      setOnScreenHookEn(post.onScreenHookEn ?? "");
      setOnScreenHookFr(post.onScreenHookFr ?? "");
      setCaptionEn(post.captionEn ?? "");
      setCaptionFr(post.captionFr ?? "");
      setCtaEn(post.ctaEn ?? "");
      setCtaFr(post.ctaFr ?? "");
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
      setCatalogItemId("");
      setCampaignId("");
      setScheduledFor(defaultDate ? toDateInputString(defaultDate) : toDateInputString(new Date()));
      setAudioTimestamp("");
      setOnScreenHookEn("");
      setOnScreenHookFr("");
      setCaptionEn("");
      setCaptionFr("");
      setCtaEn(
        profile.defaultBioLink
          ? `Full track & free HDM course — ${profile.defaultBioLink}`
          : "",
      );
      setCtaFr(
        profile.defaultBioLink
          ? `Son complet & cours HDM gratuit — ${profile.defaultBioLink}`
          : "",
      );
      setHashtags([]);
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
    setMobilePane("compose");
    setShowSavePresetInput(false);
    setNewPresetName("");
  }, [post, open, defaultStatus, defaultDate, profile.defaultBioLink]);

  const linkedCatalogItem = catalog.find((c) => c.id === catalogItemId) ?? null;

  const togglePlatform = (p: SocialPlatform) => {
    setPlatforms((prev) =>
      prev.includes(p)
        ? prev.length > 1
          ? prev.filter((item) => item !== p)
          : prev
        : [...prev, p],
    );
  };

  const applyHookAngle = (
    angle: "curiosity" | "contrarian" | "tutorial" | "pov" | "showcase",
  ) => {
    const trackName = linkedCatalogItem?.title || title.trim() || "this track";
    const bpm = linkedCatalogItem?.bpm ?? 200;

    if (activeLang === "en") {
      const existingVariant = post?.hookVariantsEn?.[angle];
      if (existingVariant) {
        setOnScreenHookEn(existingVariant);
        toast.success(`Applied ${angle} hook (EN)`);
        return;
      }
      const generated: Record<typeof angle, string> = {
        curiosity: `Wait for the 2nd kick switch on ${trackName} (${bpm} BPM)...`,
        contrarian: `Clipping +12dB doesn't make a track hard. Listen to the contrast on ${trackName}:`,
        tutorial: `How I engineered the ${bpm} BPM zaag kick in ${trackName} without muddying the mix:`,
        pov: `POV: It's 4AM at the festival and the DJ drops ${trackName} (${bpm} BPM)`,
        showcase: `${trackName} — ${bpm} BPM Zaag & Melodic Pressure`,
      };
      setOnScreenHookEn(generated[angle]);
      toast.success(`Generated ${angle} hook (EN)`);
    } else {
      const existingVariant = post?.hookVariantsFr?.[angle];
      if (existingVariant) {
        setOnScreenHookFr(existingVariant);
        toast.success(`Angle "${angle}" appliqué (FR)`);
        return;
      }
      const generated: Record<typeof angle, string> = {
        curiosity: `Attends le 2ème switch de kick sur ${trackName} (${bpm} BPM)...`,
        contrarian: `Clipper à +12dB ne rend pas un son lourd. Écoute plutôt le contraste sur ${trackName} :`,
        tutorial: `Comment j'ai sculpté le zaag kick à ${bpm} BPM de ${trackName} sans noyer le mix :`,
        pov: `POV : Il est 4h du mat en festival et le DJ lâche ${trackName} (${bpm} BPM)`,
        showcase: `${trackName} — Pression Zaag & Mélodie à ${bpm} BPM`,
      };
      setOnScreenHookFr(generated[angle]);
      toast.success(`Hook "${angle}" généré (FR)`);
    }
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
      toast.success("Saved hashtag preset!");
    } catch {
      toast.error("Failed to save hashtag preset");
    }
  };

  const handleDeleteHashtagPreset = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteHashtagPresetServerFn({ data: { id } });
      await onSaved();
      toast.success("Removed hashtag preset");
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
      toast.success(`Copied ${label} to clipboard!`);
    } catch {
      toast.error("Could not access clipboard");
    }
  };

  const currentHook = activeLang === "en" ? onScreenHookEn : onScreenHookFr;
  const currentCaption = activeLang === "en" ? captionEn : captionFr;
  const currentCta = activeLang === "en" ? ctaEn : ctaFr;

  const buildFullIgPackage = () => {
    const parts = [
      currentHook ? `${currentHook}` : "",
      currentCaption ? `\n${currentCaption}` : "",
      currentCta ? `\n\n👉 ${currentCta}` : "",
      hashtags.length ? `\n.\n.\n${hashtags.join(" ")}` : "",
    ];
    return parts.filter(Boolean).join("").trim();
  };

  const buildTikTokPackage = () => {
    const firstLine =
      currentCaption.split("\n").find((l) => l.trim().length > 0) || currentHook;
    const topTags = hashtags.slice(0, 5).join(" ");
    return [firstLine, currentCta, topTags].filter(Boolean).join("\n\n").trim();
  };

  const buildShortsPackage = () => {
    const baseTitle = currentHook || title || "New Post";
    const shortTitle = `${baseTitle} #shorts`.slice(0, 98);
    const descParts = [currentCaption, currentCta, hashtags.join(" ")].filter(Boolean);
    return `TITLE:\n${shortTitle}\n\nDESCRIPTION:\n${descParts.join("\n\n")}`.trim();
  };

  const handleSave = async (overrideStatus?: PostStatus) => {
    if (!title.trim() && !onScreenHookEn.trim() && !onScreenHookFr.trim()) {
      toast.error("Please enter a post title or an on-screen hook.");
      return;
    }

    setIsSaving(true);
    try {
      const finalStatus = overrideStatus ?? status;
      const resolvedTitle =
        title.trim() ||
        onScreenHookEn.trim().slice(0, 60) ||
        onScreenHookFr.trim().slice(0, 60) ||
        "Untitled Post";

      await upsertSocialPostServerFn({
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
          onScreenHookEn,
          onScreenHookFr: onScreenHookFr || onScreenHookEn,
          shotList,
          audioTimestamp: audioTimestamp.trim() || null,
          captionEn,
          captionFr: captionFr || captionEn,
          ctaEn,
          ctaFr: ctaFr || ctaEn,
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
      await onSaved();
      toast.success(
        overrideStatus === "posted"
          ? "Marked as Posted!"
          : post?.id
            ? "Post updated!"
            : "Post added to your pipeline!",
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save post");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    const resolvedTitle = title.trim() || onScreenHookEn.trim();
    if (!resolvedTitle) {
      toast.error("Add a title or hook before saving as a template.");
      return;
    }
    try {
      await createCustomIdeaTemplateServerFn({
        data: {
          title: resolvedTitle,
          description: captionEn.slice(0, 120) || `Reusable template from ${resolvedTitle}`,
          category: "kick_sound_design",
          pillar,
          difficulty: "daw_capture",
          recommendedPlatforms: platforms,
          hookFormulaEn: onScreenHookEn || resolvedTitle,
          hookFormulaFr: onScreenHookFr || onScreenHookEn || resolvedTitle,
          captionTemplateEn: captionEn,
          captionTemplateFr: captionFr || captionEn,
          defaultCtaEn: ctaEn,
          defaultCtaFr: ctaFr || ctaEn,
          defaultShotList: shotList.map((s) => s.text),
          suggestedHashtags: hashtags,
          whyItWorks: retrospectiveNotes || "Custom producer template.",
        },
      });
      await onSaved();
      toast.success("Saved to your Idea Vault!");
    } catch {
      toast.error("Could not save template");
    }
  };

  const handleDelete = async () => {
    if (!post?.id) return;
    setIsSaving(true);
    try {
      await deleteSocialPostServerFn({ data: { id: post.id } });
      await onSaved();
      toast.success("Post deleted");
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleAudioPreview = () => {
    if (!audioRef.current) return;
    if (isPlayingPreview) {
      audioRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      audioRef.current.currentTime = 40;
      audioRef.current.play().catch(() => {});
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
        className="flex h-dvh w-full max-w-none flex-col overflow-hidden border-l border-border/80 bg-background/98 p-0 backdrop-blur-2xl sm:w-[92vw] sm:max-w-3xl lg:w-[88vw] lg:max-w-5xl xl:max-w-6xl"
      >
        {/* Top Studio Header */}
        <div className="shrink-0 border-b border-border/70 bg-card/60 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-primary/40 bg-primary/15 text-primary-foreground text-[0.68rem] uppercase tracking-wider"
              >
                <IconSparkles className="mr-1 size-3" />
                {post?.id ? "Edit Post" : "New Post"}
              </Badge>

              {/* Language Switcher */}
              <div className="inline-flex border border-border/70 bg-background/80 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveLang("en")}
                  className={cn(
                    "px-2.5 py-0.5 font-semibold transition-colors",
                    activeLang === "en"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLang("fr")}
                  className={cn(
                    "px-2.5 py-0.5 font-semibold transition-colors",
                    activeLang === "fr"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  FR
                </button>
              </div>

              {/* Status Selector Pills on Desktop / Compact Select on Mobile */}
              <div className="hidden items-center gap-1 md:flex">
                {STATUS_COLUMNS.map((col) => (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => setStatus(col.id)}
                    className={cn(
                      "flex items-center gap-1.5 border px-2.5 py-1 text-xs font-medium transition-all",
                      status === col.id
                        ? col.badgeClass
                        : "border-border/60 bg-background/50 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", col.dotClass)} />
                    {col.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                aria-label="Scheduled date"
                className="border border-border/70 bg-background/80 px-2.5 py-1 text-xs text-foreground"
              />

              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveAsTemplate}
                title="Save structure to Idea Vault"
                className="hidden sm:inline-flex"
              >
                <IconBookmarkPlus className="size-3.5" />
                <span>Save as Template</span>
              </Button>

              {post?.id ? (
                <Button
                  size="icon-sm"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/15"
                  onClick={handleDelete}
                  disabled={isSaving}
                  title="Delete post"
                >
                  <IconTrash className="size-4" />
                </Button>
              ) : null}

              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                aria-label="Close Copilot"
              >
                <IconX className="size-4.5" />
              </Button>
            </div>
          </div>

          {/* Mobile Status Row */}
          <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 md:hidden">
            {STATUS_COLUMNS.map((col) => (
              <button
                key={col.id}
                type="button"
                onClick={() => setStatus(col.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 border px-2.5 py-1 text-xs font-medium transition-all",
                  status === col.id
                    ? col.badgeClass
                    : "border-border/60 bg-background/50 text-muted-foreground",
                )}
              >
                <span className={cn("size-1.5 rounded-full", col.dotClass)} />
                {col.label}
              </button>
            ))}
          </div>

          {/* Working Title Input */}
          <SheetTitle className="mt-2.5">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Post working title (e.g., Zaag Kick EQ Breakdown)..."
              className="w-full border-b border-transparent bg-transparent pb-1 text-lg font-bold text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none sm:text-xl"
            />
          </SheetTitle>
          <SheetDescription className="sr-only">
            Compose social post hooks, captions, shot list, and publishing checklist.
          </SheetDescription>

          {/* Mobile-Only Pane Switcher (Hidden on lg+ where 2-column studio layout is shown) */}
          <div className="mt-3 grid grid-cols-3 gap-1 border border-border/70 bg-background/70 p-1 text-xs lg:hidden">
            <button
              type="button"
              onClick={() => setMobilePane("compose")}
              className={cn(
                "py-1.5 font-semibold transition-colors",
                mobilePane === "compose"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              1. Write & Shots
            </button>
            <button
              type="button"
              onClick={() => setMobilePane("publish")}
              className={cn(
                "py-1.5 font-semibold transition-colors",
                mobilePane === "publish"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              2. Copy & Check ({completedPreFlight}/4)
            </button>
            <button
              type="button"
              onClick={() => setMobilePane("metrics")}
              className={cn(
                "py-1.5 font-semibold transition-colors",
                mobilePane === "metrics"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              3. Results
            </button>
          </div>
        </div>

        {/* Main Studio Body — 2-Column Workspace on Desktop (lg+), Clean Tabbed Panes on Mobile */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid min-h-full lg:grid-cols-12">
            {/* LEFT COLUMN: Metadata + Copy Editor + Hashtags + Shot List */}
            <div
              className={cn(
                "space-y-6 p-4 sm:p-6 lg:col-span-7 lg:border-r lg:border-border/60",
                mobilePane !== "compose" && "hidden lg:block",
              )}
            >
              {/* Post Context & Target Platforms */}
              <div className="space-y-3.5 border border-border/60 bg-card/35 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      Linked Track / Asset
                    </label>
                    <select
                      value={catalogItemId}
                      onChange={(e) => setCatalogItemId(e.target.value)}
                      className="mt-1 w-full border border-border/70 bg-background/85 px-2.5 py-1.5 text-xs text-foreground"
                    >
                      <option value="">Standalone (No track)</option>
                      {catalog.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title} {item.bpm ? `(${item.bpm} BPM)` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

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
                </div>

                {linkedCatalogItem ? (
                  <div className="flex items-center justify-between gap-2 border border-primary/25 bg-primary/10 p-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {linkedCatalogItem.artworkUrl ? (
                        <img
                          src={linkedCatalogItem.artworkUrl}
                          alt={linkedCatalogItem.title}
                          className="size-9 shrink-0 object-cover border border-white/15"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold">{linkedCatalogItem.title}</p>
                        <p className="text-[0.68rem] text-muted-foreground">
                          {linkedCatalogItem.bpm ?? 200} BPM • {linkedCatalogItem.genreTag}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {linkedCatalogItem.audioPreviewUrl ? (
                        <>
                          <audio
                            ref={audioRef}
                            src={linkedCatalogItem.audioPreviewUrl}
                            onEnded={() => setIsPlayingPreview(false)}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={toggleAudioPreview}
                            title="Audition audio preview"
                          >
                            {isPlayingPreview ? (
                              <IconPlayerPause className="size-3.5" />
                            ) : (
                              <IconPlayerPlay className="size-3.5" />
                            )}
                            <span>{isPlayingPreview ? "Pause" : "Preview"}</span>
                          </Button>
                        </>
                      ) : null}
                      {linkedCatalogItem.streamingLinks?.spotify ? (
                        <Button
                          size="icon-sm"
                          variant="outline"
                          onClick={() =>
                            copyText(
                              linkedCatalogItem.streamingLinks.spotify!,
                              "Spotify Link",
                            )
                          }
                          title="Copy Spotify link"
                        >
                          <IconCopy className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="space-y-1">
                    <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      Target Platforms
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(PLATFORM_META) as SocialPlatform[]).map((p) => {
                        const meta = PLATFORM_META[p];
                        const active = platforms.includes(p);
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => togglePlatform(p)}
                            className={cn(
                              "inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-medium transition-all",
                              active
                                ? meta.badgeClass
                                : "border-border/50 bg-background/40 text-muted-foreground opacity-60 hover:opacity-100",
                            )}
                          >
                            <meta.Icon className="size-3.5" />
                            {meta.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      Audio Timestamp / Section
                    </label>
                    <input
                      type="text"
                      value={audioTimestamp}
                      onChange={(e) => setAudioTimestamp(e.target.value)}
                      placeholder="e.g., 0:42 - 0:58 (1st Drop)"
                      className="border border-border/70 bg-background/85 px-2.5 py-1 text-xs text-foreground"
                    />
                  </div>
                </div>
              </div>

              {/* 1. On-Screen Video Hook */}
              <div className="space-y-2.5 border border-primary/30 bg-primary/6 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-foreground">
                      On-Screen Video Text Hook ({activeLang.toUpperCase()})
                    </label>
                    <p className="text-[0.7rem] text-muted-foreground">
                      Text overlay for the first 2.5 seconds of your video.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[0.68rem]",
                        currentHook.length > 80
                          ? "border-amber-500/40 text-amber-300"
                          : "border-border/70 text-muted-foreground",
                      )}
                    >
                      {currentHook.length} chars
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyText(currentHook, "On-Screen Hook")}
                    >
                      <IconCopy className="size-3.5" />
                      Copy Hook
                    </Button>
                  </div>
                </div>

                <textarea
                  rows={2}
                  value={activeLang === "en" ? onScreenHookEn : onScreenHookFr}
                  onChange={(e) =>
                    activeLang === "en"
                      ? setOnScreenHookEn(e.target.value)
                      : setOnScreenHookFr(e.target.value)
                  }
                  placeholder="Write your opening hook overlay..."
                  className="w-full border border-border/80 bg-background/90 p-3 text-sm font-semibold text-foreground focus:border-primary focus:outline-none sm:text-base"
                />

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 inline-flex items-center gap-1 text-[0.68rem] text-muted-foreground">
                    <IconWand className="size-3.5 text-primary" />
                    Quick Angle:
                  </span>
                  {(
                    [
                      ["curiosity", "Curiosity Loop"],
                      ["contrarian", "Hot Take"],
                      ["tutorial", "DAW Breakdown"],
                      ["pov", "Festival / Gym POV"],
                      ["showcase", "Direct Showcase"],
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

              {/* 2. Caption & Call-To-Action */}
              <div className="space-y-4 border border-border/60 bg-card/30 p-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Post Caption Body ({activeLang.toUpperCase()})
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyText(currentCaption, "Caption Body")}
                    >
                      <IconCopy className="size-3.5" />
                      Copy Body
                    </Button>
                  </div>
                  <textarea
                    rows={4}
                    value={activeLang === "en" ? captionEn : captionFr}
                    onChange={(e) =>
                      activeLang === "en"
                        ? setCaptionEn(e.target.value)
                        : setCaptionFr(e.target.value)
                    }
                    placeholder="Write direct context about the track, sound design, or drop..."
                    className="w-full border border-border/70 bg-background/80 p-3 text-sm leading-relaxed text-foreground focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Call-To-Action Line ({activeLang.toUpperCase()})
                  </label>
                  <input
                    type="text"
                    value={activeLang === "en" ? ctaEn : ctaFr}
                    onChange={(e) =>
                      activeLang === "en" ? setCtaEn(e.target.value) : setCtaFr(e.target.value)
                    }
                    placeholder="e.g., Stream on all platforms — link in bio."
                    className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              {/* 3. Hashtags & Saved Packs */}
              <div className="space-y-3 border border-border/60 bg-card/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Hashtags ({hashtags.length})
                    </label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {hashtags.length > 0 ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowSavePresetInput((v) => !v)}
                      >
                        <IconPlus className="size-3.5" />
                        Save as Pack
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyText(hashtags.join(" "), "Hashtags")}
                    >
                      <IconCopy className="size-3.5" />
                      Copy Tags
                    </Button>
                  </div>
                </div>

                {showSavePresetInput ? (
                  <div className="flex gap-2 border border-primary/30 bg-primary/10 p-2.5">
                    <input
                      type="text"
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      placeholder="Preset pack name (e.g., Uptempo Core)..."
                      className="flex-1 border border-border/70 bg-background/90 px-2.5 py-1 text-xs"
                    />
                    <Button size="sm" onClick={handleSaveHashtagPreset}>
                      Save Pack
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
                            title="Delete preset pack"
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
                    placeholder="Add hashtags (e.g. #uptempo #zaagkick)..."
                    className="flex-1 border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs"
                  />
                  <Button size="sm" variant="outline" onClick={addCustomTag}>
                    Add
                  </Button>
                </div>
              </div>

              {/* 4. Filming & DAW Shot List */}
              <div className="space-y-3 border border-border/60 bg-card/30 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Filming & DAW Capture Shot List ({completedShots}/{shotList.length})
                    </h4>
                  </div>
                </div>

                {shotList.length > 0 ? (
                  <div className="space-y-2">
                    {shotList.map((shot, index) => (
                      <div
                        key={shot.id}
                        className={cn(
                          "flex items-start gap-2.5 border p-2.5 text-xs transition-colors",
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
                        <div className="flex-1">
                          <span className="mr-1.5 font-mono text-[0.68rem] text-primary">
                            #{index + 1}
                          </span>
                          <span
                            className={cn(
                              shot.completed && "line-through text-muted-foreground",
                            )}
                          >
                            {shot.text}
                          </span>
                        </div>
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
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No shot list steps added yet. Add capture steps below if needed.
                  </p>
                )}

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
                    placeholder="Add filming step (e.g., Solo kick chain then drop into full mix)..."
                    className="flex-1 border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs"
                  />
                  <Button size="sm" variant="outline" onClick={addShotStep}>
                    <IconPlus className="size-3.5" />
                    Add Step
                  </Button>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Live Package Preview + 1-Tap Copy + Checklist + Metrics */}
            <div
              className={cn(
                "space-y-6 bg-card/20 p-4 sm:p-6 lg:col-span-5",
                mobilePane === "compose" && "hidden lg:block",
              )}
            >
              {/* Publish & Pre-Flight Section (Visible on lg+ OR when mobilePane === "publish") */}
              <div
                className={cn(
                  "space-y-5",
                  mobilePane === "metrics" && "hidden lg:block",
                )}
              >
                {/* Live Assembled Caption Preview */}
                <div className="space-y-2.5 border border-border/70 bg-background/80 p-4">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground">
                      <IconDeviceMobile className="size-3.5 text-primary" />
                      Live Post Package Preview ({activeLang.toUpperCase()})
                    </span>
                    <Badge variant="outline" className="text-[0.65rem]">
                      {buildFullIgPackage().length} chars
                    </Badge>
                  </div>
                  <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap border border-border/50 bg-card/50 p-3 font-sans text-xs leading-relaxed text-foreground/90">
                    {buildFullIgPackage() || "As you type your hook, caption, CTA, and hashtags, your ready-to-paste package previews here..."}
                  </pre>
                </div>

                {/* 1-Tap Copy Packs */}
                <div className="space-y-2.5 border border-primary/30 bg-primary/8 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    1-Tap Copy for Publishing ({activeLang.toUpperCase()})
                  </h4>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <Button
                      variant="default"
                      className="h-auto justify-start gap-2.5 py-2.5 text-left"
                      onClick={() => copyText(currentHook, "Video Overlay Hook")}
                    >
                      <IconCopy className="size-4 shrink-0" />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold">Copy Video Hook</div>
                        <div className="truncate text-[0.65rem] opacity-80">
                          On-screen text overlay
                        </div>
                      </div>
                    </Button>

                    <Button
                      variant="outline"
                      className="h-auto justify-start gap-2.5 border-pink-500/40 bg-pink-500/10 py-2.5 text-left hover:bg-pink-500/20"
                      onClick={() => copyText(buildFullIgPackage(), "Instagram Package")}
                    >
                      <IconCopy className="size-4 shrink-0 text-pink-300" />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold text-pink-200">
                          Copy IG Reel / Carousel
                        </div>
                        <div className="truncate text-[0.65rem] text-pink-300/80">
                          Hook + Caption + CTA + Tags
                        </div>
                      </div>
                    </Button>

                    <Button
                      variant="outline"
                      className="h-auto justify-start gap-2.5 border-cyan-500/40 bg-cyan-500/10 py-2.5 text-left hover:bg-cyan-500/20"
                      onClick={() => copyText(buildTikTokPackage(), "TikTok Package")}
                    >
                      <IconCopy className="size-4 shrink-0 text-cyan-300" />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold text-cyan-200">
                          Copy TikTok Caption
                        </div>
                        <div className="truncate text-[0.65rem] text-cyan-300/80">
                          Short hook + CTA + top 5 tags
                        </div>
                      </div>
                    </Button>

                    <Button
                      variant="outline"
                      className="h-auto justify-start gap-2.5 border-red-500/40 bg-red-500/10 py-2.5 text-left hover:bg-red-500/20"
                      onClick={() => copyText(buildShortsPackage(), "YouTube Shorts Package")}
                    >
                      <IconCopy className="size-4 shrink-0 text-red-300" />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold text-red-200">
                          Copy YT Shorts Pack
                        </div>
                        <div className="truncate text-[0.65rem] text-red-300/80">
                          Title + #shorts description
                        </div>
                      </div>
                    </Button>
                  </div>
                </div>

                {/* Pre-Flight Checklist */}
                <div className="space-y-2.5 border border-border/60 bg-card/35 p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <IconListCheck className="size-4 text-primary" />
                      Pre-Flight Quality Checklist ({completedPreFlight}/4)
                    </h4>
                  </div>
                  <div className="grid gap-2">
                    {(
                      [
                        [
                          "highResExport",
                          "1080x1920 60fps Export (High-bitrate audio)",
                        ],
                        [
                          "coverFrameSelected",
                          "Cover frame & hook text inside 4:5 safe zone",
                        ],
                        [
                          "audioSynced",
                          "Visual cut lands on the exact drop transient",
                        ],
                        [
                          "linkInBioUpdated",
                          "Bio link points to latest release / course",
                        ],
                      ] as const
                    ).map(([key, label]) => (
                      <label
                        key={key}
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 border px-3 py-2 text-xs transition-colors",
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
              </div>

              {/* Performance & Retrospective Log (Visible on lg+ OR when mobilePane === "metrics") */}
              <div
                className={cn(
                  "space-y-4 border border-border/60 bg-card/35 p-4",
                  mobilePane === "publish" && "hidden lg:block",
                )}
              >
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Post-Publish Performance & Notes
                  </h4>
                  <p className="text-[0.7rem] text-muted-foreground">
                    Log results after publishing to track which hooks and pillars convert best.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5 lg:grid-cols-3 xl:grid-cols-5">
                  {(
                    [
                      ["Views", views, setViews],
                      ["Likes", likes, setLikes],
                      ["Saves", saves, setSaves],
                      ["Shares", shares, setShares],
                      ["Comments", comments, setComments],
                    ] as const
                  ).map(([label, val, setter]) => (
                    <div key={label} className="border border-border/60 bg-background/60 p-2">
                      <label className="block text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                        {label}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={val}
                        onChange={(e) => setter(Number(e.target.value) || 0)}
                        className="mt-0.5 w-full bg-transparent text-sm font-bold text-foreground focus:outline-none"
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    Published Post URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={publishedUrl}
                    onChange={(e) => setPublishedUrl(e.target.value)}
                    placeholder="https://www.instagram.com/reel/..."
                    className="mt-1 w-full border border-border/70 bg-background/70 px-2.5 py-1.5 text-xs"
                  />
                </div>

                <div>
                  <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    Outcome Rating
                  </label>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {(Object.keys(PERFORMANCE_RATING_META) as PerformanceRating[]).map((r) => {
                      const meta = PERFORMANCE_RATING_META[r];
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() =>
                            setPerformanceRating((prev) => (prev === r ? "" : r))
                          }
                          className={cn(
                            "border px-2.5 py-1 text-xs font-medium transition-all",
                            performanceRating === r
                              ? meta.badgeClass
                              : "border-border/60 bg-background/50 text-muted-foreground",
                          )}
                        >
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    Retrospective Notes
                  </label>
                  <textarea
                    rows={2}
                    value={retrospectiveNotes}
                    onChange={(e) => setRetrospectiveNotes(e.target.value)}
                    placeholder="What worked or what to adjust next time..."
                    className="mt-1 w-full border border-border/70 bg-background/70 p-2.5 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Footer Action Bar */}
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t border-border/80 bg-card/80 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-2">
            {status !== "posted" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleSave("posted")}
                disabled={isSaving}
                className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
              >
                <IconRocket className="size-3.5" />
                <span>Mark as Posted</span>
              </Button>
            ) : (
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40">
                <IconCheck className="mr-1 size-3" />
                Published
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => handleSave()} disabled={isSaving}>
              <IconCheck className="size-4" />
              {isSaving ? "Saving..." : post?.id ? "Save Changes" : "Create Post"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
