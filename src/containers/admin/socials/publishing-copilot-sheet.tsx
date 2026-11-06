import {
  IconBolt,
  IconBookmarkPlus,
  IconCheck,
  IconCopy,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconRocket,
  IconSparkles,
  IconTrash,
  IconWand,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
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
  profile,
  catalog,
  campaigns,
  hashtagPresets,
  onSaved,
}: PublishingCopilotSheetProps) {
  const [activeLang, setActiveLang] = useState<"en" | "fr">(
    profile.primaryLanguage === "fr" ? "fr" : "en",
  );
  const [copilotSection, setCopilotSection] = useState<
    "copy" | "shots" | "publish" | "metrics"
  >("copy");
  const [isSaving, setIsSaving] = useState(false);

  // Form states
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
  const [audioTimestamp, setAudioTimestamp] = useState("0:42 - 0:58 (Main Drop)");

  const [onScreenHookEn, setOnScreenHookEn] = useState("");
  const [onScreenHookFr, setOnScreenHookFr] = useState("");
  const [captionEn, setCaptionEn] = useState("");
  const [captionFr, setCaptionFr] = useState("");
  const [ctaEn, setCtaEn] = useState(
    `Stream on all platforms & check out the free HDM course — ${profile.defaultBioLink}`,
  );
  const [ctaFr, setCtaFr] = useState(
    `Écoute sur toutes les plateformes & découvre le cours HDM gratuit — ${profile.defaultBioLink}`,
  );
  const [hashtags, setHashtags] = useState<string[]>([
    "#uptempohardcore",
    "#zaagkick",
    "#harddance",
    "#lilsbd",
  ]);
  const [customTagInput, setCustomTagInput] = useState("");
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
    if (post) {
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
      setAudioTimestamp(post.audioTimestamp ?? "0:42 - 0:58 (Main Drop)");
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
      const defaultTrack = catalog[0];
      setTitle("");
      setStatus("idea");
      setPlatforms(["instagram_reels", "tiktok", "youtube_shorts"]);
      setPillar("drop_showcase");
      setCatalogItemId(defaultTrack?.id ?? "");
      setCampaignId("");
      setScheduledFor(toDateInputString(new Date()));
      setAudioTimestamp("0:42 - 0:58 (Main Drop)");
      setOnScreenHookEn(
        defaultTrack
          ? `Wait for the 2nd kick switch on ${defaultTrack.title} (${defaultTrack.bpm ?? 200} BPM)...`
          : "",
      );
      setOnScreenHookFr(
        defaultTrack
          ? `Attends le 2ème switch de kick sur ${defaultTrack.title} (${defaultTrack.bpm ?? 200} BPM)...`
          : "",
      );
      setCaptionEn("");
      setCaptionFr("");
      setCtaEn("Stream the full track & free HDM course — link in bio.");
      setCtaFr("Écoute le son complet & le cours HDM gratuit — lien en bio.");
      setHashtags(["#uptempohardcore", "#zaagkick", "#harddance", "#lilsbd"]);
      setShotList([
        {
          id: "shot-1",
          text: "0-3s: Start 2 bars before the drop with hook text centered",
          completed: false,
        },
        {
          id: "shot-2",
          text: "3-12s: Cut to DAW mixer or studio reaction as the zaag kick lands",
          completed: false,
        },
      ]);
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
    setIsPlayingPreview(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, [post, catalog, open]);

  const linkedCatalogItem = catalog.find((c) => c.id === catalogItemId) ?? null;

  const togglePlatform = (p: SocialPlatform) => {
    setPlatforms((prev) =>
      prev.includes(p) ? (prev.length > 1 ? prev.filter((item) => item !== p) : prev) : [...prev, p],
    );
  };

  const applyHookAngle = (
    angle: "curiosity" | "contrarian" | "tutorial" | "pov" | "showcase",
  ) => {
    const trackName = linkedCatalogItem?.title ?? "this track";
    const bpm = linkedCatalogItem?.bpm ?? 200;

    if (activeLang === "en") {
      const existingVariant = post?.hookVariantsEn?.[angle];
      if (existingVariant) {
        setOnScreenHookEn(existingVariant);
        toast.success(`Applied ${angle} hook angle (EN)`);
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
    const formatted = raw.startsWith("#") ? raw : `#${raw.replace(/\s+/g, "")}`;
    if (!hashtags.includes(formatted)) {
      setHashtags((prev) => [...prev, formatted]);
    }
    setCustomTagInput("");
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
      currentCaption.split("\n").find((l) => l.trim().length > 0) ?? currentHook;
    const topTags = hashtags.slice(0, 5).join(" ");
    return `${firstLine}\n\n${currentCta}\n${topTags}`.trim();
  };

  const buildShortsPackage = () => {
    const shortTitle = `${currentHook || title} #shorts #uptempo #harddance`.slice(0, 98);
    return `TITLE:\n${shortTitle}\n\nDESCRIPTION:\n${currentCaption}\n\n${currentCta}\n\n${hashtags.join(" ")}`;
  };

  const handleSave = async (overrideStatus?: PostStatus) => {
    if (!title.trim() && !onScreenHookEn.trim()) {
      toast.error("Please give this post a title or on-screen hook.");
      return;
    }

    setIsSaving(true);
    try {
      const finalStatus = overrideStatus ?? status;
      await upsertSocialPostServerFn({
        data: {
          id: post?.id,
          campaignId: campaignId || null,
          catalogItemId: catalogItemId || null,
          templateId: post?.templateId ?? null,
          title: title.trim() || onScreenHookEn.slice(0, 50) || "Untitled Post",
          status: finalStatus,
          platforms,
          pillar,
          scheduledFor,
          onScreenHookEn,
          onScreenHookFr: onScreenHookFr || onScreenHookEn,
          shotList,
          audioTimestamp,
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
          ? "Marked as Posted! Consistency streak updated."
          : post
            ? "Post updated!"
            : "Added to your content pipeline!",
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save post");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    try {
      await createCustomIdeaTemplateServerFn({
        data: {
          title: title.trim() || "Custom Producer Idea",
          description: `Saved from post: ${title.trim() || onScreenHookEn}`,
          category: "kick_sound_design",
          pillar,
          difficulty: "daw_capture",
          recommendedPlatforms: platforms,
          hookFormulaEn: onScreenHookEn || title,
          hookFormulaFr: onScreenHookFr || onScreenHookEn || title,
          captionTemplateEn: captionEn,
          captionTemplateFr: captionFr || captionEn,
          defaultCtaEn: ctaEn,
          defaultCtaFr: ctaFr || ctaEn,
          defaultShotList: shotList.map((s) => s.text),
          suggestedHashtags: hashtags,
          whyItWorks: retrospectiveNotes || "Custom reusable producer format.",
        },
      });
      await onSaved();
      toast.success("Saved to your personal Idea Vault!");
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
      toast.success("Post removed from pipeline");
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
      audioRef.current.currentTime = 40; // Jump right near the drop!
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
        className="w-full sm:max-w-2xl overflow-y-auto border-l border-border/80 bg-background/95 p-0 backdrop-blur-2xl"
      >
        <div className="sticky top-0 z-20 border-b border-border/70 bg-background/90 px-5 py-4 backdrop-blur-xl">
          <SheetHeader className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-primary/40 bg-primary/15 text-primary-foreground text-[0.68rem] uppercase tracking-widest"
                >
                  <IconSparkles className="mr-1 size-3" />
                  Publishing Copilot
                </Badge>
                <div className="inline-flex border border-border/70 bg-card/60 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveLang("en")}
                    className={cn(
                      "px-2.5 py-1 font-medium transition-colors",
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
                      "px-2.5 py-1 font-medium transition-colors",
                      activeLang === "fr"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    FR
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveAsTemplate}
                  title="Save structure to Idea Vault"
                >
                  <IconBookmarkPlus className="size-4" />
                  <span className="hidden sm:inline">Save Template</span>
                </Button>
                {post?.id ? (
                  <Button
                    size="icon-sm"
                    variant="outline"
                    className="text-destructive hover:bg-destructive/15"
                    onClick={handleDelete}
                    disabled={isSaving}
                  >
                    <IconTrash className="size-4" />
                  </Button>
                ) : null}
              </div>
            </div>

            <SheetTitle className="mt-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Post working title (e.g., KINO — Zaag Kick EQ Breakdown)..."
                className="w-full bg-transparent text-lg font-bold text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
              />
            </SheetTitle>
            <SheetDescription className="sr-only">
              Configure hooks, captions, shot list, hashtags, and publishing checklist.
            </SheetDescription>
          </SheetHeader>

          {/* Status & Schedule Bar */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {STATUS_COLUMNS.map((col) => (
              <button
                key={col.id}
                type="button"
                onClick={() => setStatus(col.id)}
                className={cn(
                  "flex items-center gap-1.5 border px-2.5 py-1 text-xs font-medium transition-all",
                  status === col.id
                    ? col.badgeClass
                    : "border-border/60 bg-card/30 text-muted-foreground hover:text-foreground",
                )}
              >
                <span className={cn("size-1.5 rounded-full", col.dotClass)} />
                {col.label}
              </button>
            ))}

            <input
              type="date"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="ml-auto border border-border/70 bg-card/60 px-2.5 py-1 text-xs text-foreground"
            />
          </div>

          {/* Sub-navigation tabs */}
          <div className="mt-3 grid grid-cols-4 gap-1 border border-border/60 bg-card/40 p-1 text-xs">
            <button
              type="button"
              onClick={() => setCopilotSection("copy")}
              className={cn(
                "py-1.5 font-medium transition-colors",
                copilotSection === "copy"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              1. Hook & Copy
            </button>
            <button
              type="button"
              onClick={() => setCopilotSection("shots")}
              className={cn(
                "py-1.5 font-medium transition-colors",
                copilotSection === "shots"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              2. Shot List ({completedShots}/{shotList.length})
            </button>
            <button
              type="button"
              onClick={() => setCopilotSection("publish")}
              className={cn(
                "py-1.5 font-medium transition-colors",
                copilotSection === "publish"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              3. Publish ({completedPreFlight}/4)
            </button>
            <button
              type="button"
              onClick={() => setCopilotSection("metrics")}
              className={cn(
                "py-1.5 font-medium transition-colors",
                copilotSection === "metrics"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              4. Results
            </button>
          </div>
        </div>

        <div className="space-y-6 p-5">
          {/* Linked Track / Course Asset + Platforms Bar */}
          <div className="grid gap-3 border border-border/60 bg-card/35 p-3.5 sm:grid-cols-2">
            <div>
              <label className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Linked Track / Course Asset
              </label>
              <select
                value={catalogItemId}
                onChange={(e) => setCatalogItemId(e.target.value)}
                className="mt-1 w-full border border-border/70 bg-background/80 px-2.5 py-1.5 text-sm text-foreground"
              >
                <option value="">No specific track linked</option>
                {catalog.map((item) => (
                  <option key={item.id} value={item.id}>
                    [{item.type === "course_lesson" ? "COURSE" : "TRACK"}] {item.title}{" "}
                    {item.bpm ? `(${item.bpm} BPM)` : ""}
                  </option>
                ))}
              </select>

              {linkedCatalogItem ? (
                <div className="mt-2 flex items-center justify-between gap-2 border border-primary/25 bg-primary/10 p-2">
                  <div className="flex items-center gap-2 min-w-0">
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
                        {linkedCatalogItem.bpm ?? 200} BPM • {audioTimestamp}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {linkedCatalogItem.audioPreviewUrl ? (
                      <>
                        <audio
                          ref={audioRef}
                          src={linkedCatalogItem.audioPreviewUrl}
                          onEnded={() => setIsPlayingPreview(false)}
                        />
                        <Button
                          size="icon-sm"
                          variant="outline"
                          onClick={toggleAudioPreview}
                          title="Audition drop snippet (starts at 0:40)"
                        >
                          {isPlayingPreview ? (
                            <IconPlayerPause className="size-3.5" />
                          ) : (
                            <IconPlayerPlay className="size-3.5" />
                          )}
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
                            "Spotify Track Link",
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
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Content Pillar
                </label>
                <select
                  value={pillar}
                  onChange={(e) => setPillar(e.target.value as ContentPillar)}
                  className="mt-1 w-full border border-border/70 bg-background/80 px-2.5 py-1.5 text-sm text-foreground"
                >
                  {Object.entries(PILLAR_META).map(([key, meta]) => (
                    <option key={key} value={key}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Target Platforms
                </label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {(Object.keys(PLATFORM_META) as SocialPlatform[]).map((p) => {
                    const meta = PLATFORM_META[p];
                    const active = platforms.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => togglePlatform(p)}
                        className={cn(
                          "inline-flex items-center gap-1 border px-2 py-1 text-[0.7rem] font-medium transition-all",
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
            </div>
          </div>

          {/* SECTION 1: HOOK & COPY STUDIO */}
          {copilotSection === "copy" ? (
            <div className="space-y-5">
              {/* On-Screen Video Hook */}
              <div className="space-y-2 border border-primary/30 bg-primary/8 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-primary-foreground">
                      On-Screen Video Text Hook ({activeLang.toUpperCase()})
                    </label>
                    <p className="text-[0.72rem] text-muted-foreground">
                      Appears in the first 2.5 seconds of your Reel / TikTok / Short. Keep it under
                      75 chars.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[0.68rem]",
                        currentHook.length > 80
                          ? "border-amber-500/40 text-amber-300"
                          : "border-emerald-500/40 text-emerald-300",
                      )}
                    >
                      {currentHook.length} chars • ~
                      {Math.max(1, Math.round(currentHook.split(/\s+/).filter(Boolean).length / 3.5))}
                      s read
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
                  placeholder="e.g., Why 90% of zaag kicks sound like muddy noise (and how I fixed mine on KINO)"
                  className="w-full border border-border/80 bg-background/90 p-3 text-base font-semibold text-foreground focus:border-primary focus:outline-none"
                />

                {/* 5 Hook Angle Switchers */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="mr-1 inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground">
                    <IconWand className="size-3.5 text-primary" />
                    Generate Angle:
                  </span>
                  {(
                    [
                      ["curiosity", "Curiosity Loop"],
                      ["contrarian", "Hot Take"],
                      ["tutorial", "DAW Value"],
                      ["pov", "Festival / Gym POV"],
                      ["showcase", "Direct Showcase"],
                    ] as const
                  ).map(([angle, label]) => (
                    <button
                      key={angle}
                      type="button"
                      onClick={() => applyHookAngle(angle)}
                      className="border border-border/70 bg-background/70 px-2 py-1 text-[0.7rem] font-medium text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Caption Body */}
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
                  rows={5}
                  value={activeLang === "en" ? captionEn : captionFr}
                  onChange={(e) =>
                    activeLang === "en"
                      ? setCaptionEn(e.target.value)
                      : setCaptionFr(e.target.value)
                  }
                  placeholder="Write direct, non-corny context about the kick design, drop contrast, or production lesson..."
                  className="w-full border border-border/70 bg-card/40 p-3 text-sm leading-relaxed text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              {/* Call to Action (CTA) */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Call-To-Action Line ({activeLang.toUpperCase()})
                </label>
                <input
                  type="text"
                  value={activeLang === "en" ? ctaEn : ctaFr}
                  onChange={(e) =>
                    activeLang === "en" ? setCtaEn(e.target.value) : setCtaFr(e.target.value)
                  }
                  className="w-full border border-border/70 bg-card/40 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              {/* Hashtag Pack Selector */}
              <div className="space-y-3 border border-border/60 bg-card/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Smart Hashtag Set ({hashtags.length} active)
                    </label>
                    <p className="text-[0.7rem] text-muted-foreground">
                      3–6 targeted niche tags outperform 30 spam tags on Reels & TikTok.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyText(hashtags.join(" "), "Hashtags")}
                  >
                    <IconCopy className="size-3.5" />
                    Copy Tags
                  </Button>
                </div>

                {/* Preset Pack Pills */}
                <div className="flex flex-wrap gap-1.5">
                  {hashtagPresets.map((preset) => {
                    const active = preset.tags.every((t) => hashtags.includes(t));
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => togglePresetTags(preset.tags)}
                        className={cn(
                          "border px-2.5 py-1 text-xs font-medium transition-colors",
                          active
                            ? "border-primary bg-primary/20 text-primary-foreground"
                            : "border-border/70 bg-background/60 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        + {preset.name}
                      </button>
                    );
                  })}
                </div>

                {/* Active tag chips */}
                <div className="flex flex-wrap gap-1.5 pt-1">
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
                    placeholder="Add tag (e.g. #rawstyle)..."
                    className="flex-1 border border-border/70 bg-background/70 px-2.5 py-1.5 text-xs"
                  />
                  <Button size="sm" variant="outline" onClick={addCustomTag}>
                    Add
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {/* SECTION 2: SHOT LIST & DAW RECORDING CUES */}
          {copilotSection === "shots" ? (
            <div className="space-y-4">
              <div className="border border-border/60 bg-card/35 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold">
                      Filming & DAW Screen-Recording Shot List
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Step-by-step capture plan so you can batch-record in 10 minutes.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Target Audio Cue:</span>
                    <input
                      type="text"
                      value={audioTimestamp}
                      onChange={(e) => setAudioTimestamp(e.target.value)}
                      className="border border-border/70 bg-background/80 px-2.5 py-1 text-xs font-medium"
                    />
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {shotList.map((shot, index) => (
                    <div
                      key={shot.id}
                      className={cn(
                        "flex items-start gap-3 border p-3 transition-colors",
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
                        className="mt-1 size-4 accent-primary"
                      />
                      <div className="flex-1 text-sm">
                        <span className="mr-2 font-mono text-xs text-primary">
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
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex gap-2">
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
                    placeholder="Add filming cue (e.g., 'Zoom on Pro-Q3 notch at 320Hz')..."
                    className="flex-1 border border-border/70 bg-background/80 px-3 py-2 text-sm"
                  />
                  <Button variant="outline" onClick={addShotStep}>
                    <IconPlus className="size-4" />
                    Add Shot
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {/* SECTION 3: MOBILE POCKET PUBLISHER & PRE-FLIGHT CHECKLIST */}
          {copilotSection === "publish" ? (
            <div className="space-y-5">
              {/* 1-Tap Copy Cards for Phone Publishing */}
              <div className="space-y-3 border border-primary/35 bg-primary/10 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold">
                      1-Tap Mobile Publishing Packs ({activeLang.toUpperCase()})
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Open this drawer on your phone, tap Copy, and paste straight into the app.
                    </p>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    variant="default"
                    className="justify-start gap-2 h-auto py-3"
                    onClick={() => copyText(currentHook, "On-Screen Text Overlay")}
                  >
                    <IconCopy className="size-4 shrink-0" />
                    <div className="text-left">
                      <div className="text-xs font-bold">1. Copy Video Overlay Hook</div>
                      <div className="text-[0.68rem] opacity-80">
                        Paste into IG / TikTok / CapCut text box
                      </div>
                    </div>
                  </Button>

                  <Button
                    variant="outline"
                    className="justify-start gap-2 h-auto py-3 border-pink-500/40 bg-pink-500/10 hover:bg-pink-500/20"
                    onClick={() => copyText(buildFullIgPackage(), "Full Instagram Caption")}
                  >
                    <IconCopy className="size-4 shrink-0 text-pink-300" />
                    <div className="text-left">
                      <div className="text-xs font-bold text-pink-200">
                        2. Copy Instagram Reel / Carousel
                      </div>
                      <div className="text-[0.68rem] text-pink-300/80">
                        Hook + Caption + CTA + Spacer + Tags
                      </div>
                    </div>
                  </Button>

                  <Button
                    variant="outline"
                    className="justify-start gap-2 h-auto py-3 border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20"
                    onClick={() => copyText(buildTikTokPackage(), "TikTok Caption")}
                  >
                    <IconCopy className="size-4 shrink-0 text-cyan-300" />
                    <div className="text-left">
                      <div className="text-xs font-bold text-cyan-200">
                        3. Copy TikTok Punchy Caption
                      </div>
                      <div className="text-[0.68rem] text-cyan-300/80">
                        Short hook + CTA + top 5 niche tags
                      </div>
                    </div>
                  </Button>

                  <Button
                    variant="outline"
                    className="justify-start gap-2 h-auto py-3 border-red-500/40 bg-red-500/10 hover:bg-red-500/20"
                    onClick={() => copyText(buildShortsPackage(), "YouTube Shorts Package")}
                  >
                    <IconCopy className="size-4 shrink-0 text-red-300" />
                    <div className="text-left">
                      <div className="text-xs font-bold text-red-200">
                        4. Copy YT Shorts Title & Desc
                      </div>
                      <div className="text-[0.68rem] text-red-300/80">
                        Under 100-char title + #shorts description
                      </div>
                    </div>
                  </Button>
                </div>
              </div>

              {/* Pre-Flight Quality Checklist */}
              <div className="space-y-3 border border-border/60 bg-card/35 p-4">
                <h4 className="text-sm font-semibold">Pre-Flight Quality Checklist</h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      [
                        "highResExport",
                        "1080x1920 60fps Export (WAV/320kbps AAC audio)",
                      ],
                      [
                        "coverFrameSelected",
                        "Clean Cover Frame + Title inside 4:5 grid safe zone",
                      ],
                      [
                        "audioSynced",
                        "Visual cut lands on the exact transient of the zaag drop",
                      ],
                      [
                        "linkInBioUpdated",
                        "Link in bio points to latest track & Free HDM Course",
                      ],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 border p-3 text-xs transition-colors",
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

              {/* One-Click Mark as Posted */}
              <div className="flex items-center justify-between border border-emerald-500/40 bg-emerald-500/10 p-4">
                <div>
                  <p className="text-sm font-bold text-emerald-200">
                    Ready to push live on socials?
                  </p>
                  <p className="text-xs text-emerald-300/80">
                    Marking as Posted logs today's timestamp and counts toward your weekly streak.
                  </p>
                </div>
                <Button
                  onClick={() => handleSave("posted")}
                  disabled={isSaving}
                  className="bg-emerald-600 text-white hover:bg-emerald-500"
                >
                  <IconRocket className="size-4" />
                  Mark as Posted
                </Button>
              </div>
            </div>
          ) : null}

          {/* SECTION 4: POST PERFORMANCE & RETROSPECTIVE LOG */}
          {copilotSection === "metrics" ? (
            <div className="space-y-4 border border-border/60 bg-card/35 p-4">
              <div>
                <h4 className="text-sm font-semibold">
                  Performance & Algorithm Feedback Loop
                </h4>
                <p className="text-xs text-muted-foreground">
                  Log numbers 48h after posting so the Overview tab can rank which hooks & pillars
                  convert best for {profile.stageName}.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {(
                  [
                    ["Views", views, setViews],
                    ["Likes", likes, setLikes],
                    ["Saves", saves, setSaves],
                    ["Shares", shares, setShares],
                    ["Comments", comments, setComments],
                  ] as const
                ).map(([label, val, setter]) => (
                  <div key={label} className="border border-border/60 bg-background/60 p-2.5">
                    <label className="text-[0.68rem] uppercase tracking-wider text-muted-foreground">
                      {label}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={val}
                      onChange={(e) => setter(Number(e.target.value) || 0)}
                      className="mt-1 w-full bg-transparent text-base font-bold text-foreground focus:outline-none"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Quick Outcome Rating
                </label>
                <div className="mt-1.5 flex flex-wrap gap-2">
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
                          "border px-3 py-1.5 text-xs font-medium transition-all",
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
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  What Worked / Retrospective Notes
                </label>
                <textarea
                  rows={3}
                  value={retrospectiveNotes}
                  onChange={(e) => setRetrospectiveNotes(e.target.value)}
                  placeholder="e.g., High save rate (3.5%) because of the EQ screenshot in second 3. Repeat this format for LOCK THE DOORS."
                  className="mt-1 w-full border border-border/70 bg-background/70 p-2.5 text-sm"
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* Sticky Footer Save Bar */}
        <div className="sticky bottom-0 z-20 flex items-center justify-between gap-3 border-t border-border/80 bg-background/95 px-5 py-3.5 backdrop-blur-xl">
          <div className="text-xs text-muted-foreground">
            {linkedCatalogItem ? (
              <span>
                Linked: <strong className="text-foreground">{linkedCatalogItem.title}</strong>
              </span>
            ) : (
              <span>Standalone Artist Post</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => handleSave()} disabled={isSaving}>
              <IconCheck className="size-4" />
              {isSaving ? "Saving..." : post ? "Save Changes" : "Create Post"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
