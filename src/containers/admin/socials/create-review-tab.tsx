import {
  IconAlertTriangle,
  IconArrowsShuffle,
  IconBolt,
  IconCalendarClock,
  IconCheck,
  IconDisc,
  IconEdit,
  IconLoader2,
  IconRefresh,
  IconRocket,
  IconSparkles,
  IconTrash,
  IconUpload,
  IconVideo,
  IconWand,
  IconWaveSine,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import type {
  ArtistCatalogItemRecord,
  ArtistProfileRecord,
  BackgroundJobRecord,
  EditPreset,
  HashtagPresetRecord,
  PublishablePlatform,
  SocialPostRecord,
  SocialRawClipRecord,
} from "#/db/schema";
import { cn } from "#/lib/utils";
import {
  approveReviewPostServerFn,
  createAutoEditPostServerFn,
  createAutopilotDraftServerFn,
  deleteSocialPostServerFn,
  publishPostNowServerFn,
  rerenderPostServerFn,
  rerollPostCopyServerFn,
  rerollPostEditServerFn,
  updateReviewPostServerFn,
} from "#/server/socials";
import {
  PLATFORM_META,
  PUBLISHABLE_PLATFORMS,
  type SafeSocialConnection,
} from "./social-constants";

interface CreateReviewTabProps {
  profile: ArtistProfileRecord;
  catalog: ArtistCatalogItemRecord[];
  posts: SocialPostRecord[];
  rawClips: SocialRawClipRecord[];
  connections: SafeSocialConnection[];
  hashtagPresets: HashtagPresetRecord[];
  recentJobs: BackgroundJobRecord[];
  nextAvailableSlot: string;
  geminiStatus?: { configured: boolean; model: string };
  onRefresh: () => Promise<void>;
  onNavigateTab: (tab: "queue" | "settings") => void;
}

const PRESET_LABELS: Record<EditPreset, { label: string; hint: string }> = {
  subtle: { label: "Subtle", hint: "Light beat zoom + clean grade" },
  punchy: { label: "Punchy", hint: "Beat zooms + kick shakes + drop flash" },
  hard: { label: "Hard", hint: "Half-bar zaag shakes + heavy drop punch" },
};

function formatSlot(dateLike?: Date | string | null): string {
  if (!dateLike) return "Auto-slot pending";
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "Auto-slot pending";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSec(sec?: number | null): string {
  if (sec === null || sec === undefined || Number.isNaN(sec)) return "0:00";
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

function toDateTimeLocal(dateLike?: Date | string | null): string {
  const d = dateLike ? new Date(dateLike) : new Date(Date.now() + 3600_000);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ReviewInboxCard({
  post,
  postRawClips,
  catalog,
  connections,
  hashtagPresets,
  activeJob,
  lastFailedJob,
  onRefresh,
}: {
  post: SocialPostRecord;
  postRawClips: SocialRawClipRecord[];
  catalog: ArtistCatalogItemRecord[];
  connections: SafeSocialConnection[];
  hashtagPresets: HashtagPresetRecord[];
  activeJob?: BackgroundJobRecord;
  lastFailedJob?: BackgroundJobRecord;
  onRefresh: () => Promise<void>;
}) {
  const [title, setTitle] = useState(post.title);
  const [caption, setCaption] = useState(post.captionEn || post.captionFr || "");
  const [hashtags, setHashtags] = useState<string[]>(post.hashtags ?? []);
  const [customTag, setCustomTag] = useState("");
  const [platforms, setPlatforms] = useState<PublishablePlatform[]>(() => {
    const valid = (post.platforms ?? []).filter((p): p is PublishablePlatform =>
      PUBLISHABLE_PLATFORMS.includes(p as PublishablePlatform),
    );
    return valid.length > 0 ? valid : ["youtube_shorts", "instagram_reels", "tiktok"];
  });
  const [catalogItemId, setCatalogItemId] = useState(post.catalogItemId ?? "");
  const [scheduledForLocal, setScheduledForLocal] = useState(() =>
    toDateTimeLocal(post.scheduledFor),
  );

  // Re-render / Auto-Edit tweak state
  const primaryClip = postRawClips[0] ?? null;
  const [editPreset, setEditPreset] = useState<EditPreset>(post.editRecipe?.preset ?? "punchy");
  const [tweakOffsetSec, setTweakOffsetSec] = useState<string>(
    primaryClip?.detectedOffsetSec !== null && primaryClip?.detectedOffsetSec !== undefined
      ? primaryClip.detectedOffsetSec.toFixed(2)
      : "",
  );
  const [tweakStartSec, setTweakStartSec] = useState<string>(
    post.editRecipe ? post.editRecipe.masterStartSec.toFixed(1) : "",
  );
  const [tweakDurationSec, setTweakDurationSec] = useState<string>(
    post.editRecipe
      ? Math.max(4, Math.round(post.editRecipe.masterEndSec - post.editRecipe.masterStartSec)).toString()
      : "18",
  );
  const [burnHookOverlay, setBurnHookOverlay] = useState<boolean>(
    post.editRecipe?.burnHookOverlay ?? false,
  );
  const [hookOverlayText, setHookOverlayText] = useState<string>(
    post.editRecipe?.hookOverlayText || post.onScreenHookEn || "",
  );

  const [showTweak, setShowTweak] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRerendering, setIsRerendering] = useState(false);
  const [isRerollingCopy, setIsRerollingCopy] = useState(false);

  // Keep synced copy, offset & recipe fields fresh after AI Director or re-roll finishes
  useEffect(() => {
    setTitle(post.title);
    setCaption(post.captionEn || post.captionFr || "");
    setHashtags(post.hashtags ?? []);
  }, [post.title, post.captionEn, post.captionFr, post.hashtags]);
  useEffect(() => {
    if (post.editRecipe) {
      setEditPreset(post.editRecipe.preset);
      setTweakStartSec(post.editRecipe.masterStartSec.toFixed(1));
      setTweakDurationSec(
        Math.max(4, Math.round(post.editRecipe.masterEndSec - post.editRecipe.masterStartSec)).toString(),
      );
      setBurnHookOverlay(post.editRecipe.burnHookOverlay);
      if (post.editRecipe.hookOverlayText) {
        setHookOverlayText(post.editRecipe.hookOverlayText);
      }
    }
  }, [post.editRecipe]);

  useEffect(() => {
    if (primaryClip?.detectedOffsetSec !== null && primaryClip?.detectedOffsetSec !== undefined) {
      setTweakOffsetSec(primaryClip.detectedOffsetSec.toFixed(2));
    }
  }, [primaryClip?.detectedOffsetSec]);

  const track = catalog.find((c) => c.id === catalogItemId) ?? null;
  const connectedPlatforms = new Set(connections.map((c) => c.platform));
  const isProcessing = post.reviewStatus === "processing" || Boolean(activeJob);
  const isFailed = post.reviewStatus === "failed";

  const togglePlatform = (p: PublishablePlatform) => {
    setPlatforms((prev) =>
      prev.includes(p)
        ? prev.length > 1
          ? prev.filter((x) => x !== p)
          : prev
        : [...prev, p],
    );
  };

  const addTags = () => {
    const raw = customTag.trim();
    if (!raw) return;
    const parsed = raw
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith("#") ? t : `#${t}`));
    setHashtags((prev) => Array.from(new Set([...prev, ...parsed])));
    setCustomTag("");
  };

  const saveChanges = async (silent = false) => {
    setIsSaving(true);
    try {
      await updateReviewPostServerFn({
        data: {
          postId: post.id,
          title,
          caption,
          onScreenHook: hookOverlayText,
          hashtags,
          platforms,
          catalogItemId: catalogItemId || null,
          scheduledFor: scheduledForLocal ? new Date(scheduledForLocal).toISOString() : null,
        },
      });
      if (!silent) {
        await onRefresh();
        toast.success("Saved changes");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save changes");
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const handleRerender = async (overridePreset?: EditPreset) => {
    setIsRerendering(true);
    try {
      const targetPreset = overridePreset ?? editPreset;
      setEditPreset(targetPreset);
      const parsedOffset = tweakOffsetSec.trim() !== "" ? Number(tweakOffsetSec) : undefined;
      const parsedStart = tweakStartSec.trim() !== "" ? Number(tweakStartSec) : undefined;
      const parsedDuration = tweakDurationSec.trim() !== "" ? Number(tweakDurationSec) : undefined;

      await rerenderPostServerFn({
        data: {
          postId: post.id,
          preset: targetPreset,
          ...(parsedOffset !== undefined && Number.isFinite(parsedOffset)
            ? { overrideOffsetSec: parsedOffset }
            : {}),
          ...(overridePreset === undefined && parsedStart !== undefined && Number.isFinite(parsedStart)
            ? { overrideMasterStartSec: parsedStart }
            : {}),
          ...(overridePreset === undefined &&
          parsedDuration !== undefined &&
          Number.isFinite(parsedDuration)
            ? { overrideDurationSec: Math.max(4, Math.min(35, parsedDuration)) }
            : {}),
          burnHookOverlay,
          hookOverlayText,
        },
      });
      await onRefresh();
      toast.success(`Re-rendering with "${PRESET_LABELS[targetPreset].label}" preset...`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start re-render");
    } finally {
      setIsRerendering(false);
    }
  };

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await saveChanges(true);
      const res = await approveReviewPostServerFn({
        data: {
          postId: post.id,
          scheduledFor: scheduledForLocal ? new Date(scheduledForLocal).toISOString() : null,
        },
      });
      await onRefresh();
      toast.success(`Approved! Auto-scheduled for ${formatSlot(res.scheduledFor)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not approve post");
    } finally {
      setIsApproving(false);
    }
  };

  const handlePublishNow = async () => {
    const linkedTargets = platforms.filter((p) => connectedPlatforms.has(p));
    if (linkedTargets.length === 0) {
      toast.error("Connect at least one selected platform in Tracks & Settings first.");
      return;
    }

    setIsPublishing(true);
    try {
      await saveChanges(true);
      const res = await publishPostNowServerFn({
        data: { postId: post.id, platforms: linkedTargets },
      });
      await onRefresh();
      if (res.allSucceeded) {
        toast.success(`Published "${title}" live!`);
      } else if (res.anySucceeded) {
        toast.success("Published to connected platform(s); check Queue for any errors.");
      } else {
        const firstErr = Object.values(res.deliveries).find((d) => d?.error)?.error;
        toast.error(firstErr || "Publishing failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDiscard = async () => {
    try {
      await deleteSocialPostServerFn({ data: { id: post.id } });
      await onRefresh();
      toast.success("Discarded draft");
    } catch {
      toast.error("Could not delete draft");
    }
  };

  const handleRerollCopy = async () => {
    setIsRerollingCopy(true);
    try {
      const res = await rerollPostCopyServerFn({ data: { postId: post.id } });
      await onRefresh();
      toast.success(
        res.source === "gemini"
          ? `Fresh copy generated by ${res.model}`
          : "Generated fresh copy variation!",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not re-roll copy");
    } finally {
      setIsRerollingCopy(false);
    }
  };

  const handleRerollEdit = async () => {
    setIsRerendering(true);
    try {
      await rerollPostEditServerFn({ data: { postId: post.id } });
      await onRefresh();
      toast.success("AI Director picking an alternate cut & re-rendering...");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not re-roll edit");
    } finally {
      setIsRerendering(false);
    }
  };

  const handleShuffleMultiTakeCuts = async () => {
    setIsRerendering(true);
    try {
      await rerenderPostServerFn({
        data: {
          postId: post.id,
          preset: post.editRecipe?.preset ?? editPreset,
          variationSeed: Math.floor(Math.random() * 1000) + 1,
        },
      });
      await onRefresh();
      toast.success("Shuffling multi-take angle cuts & re-rendering...");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not shuffle cuts");
    } finally {
      setIsRerendering(false);
    }
  };

  const isMultiTake = postRawClips.length > 1 || post.editMode === "multi_take";
  const cutCount = post.editRecipe?.segments?.length ?? 0;

  const syncPct =
    primaryClip?.syncConfidence !== null && primaryClip?.syncConfidence !== undefined
      ? Math.round(primaryClip.syncConfidence * 100)
      : null;

  return (
    <div className="grid gap-4 border border-border/70 bg-card/45 p-4 backdrop-blur-md md:grid-cols-[240px_1fr] lg:grid-cols-[270px_1fr]">
      {/* Left: Vertical 9:16 Video Preview */}
      <div className="flex flex-col gap-2">
        <div className="relative overflow-hidden border border-border/80 bg-black">
          {post.videoUrl && !isProcessing ? (
            <video
              key={post.videoUrl}
              src={post.videoUrl}
              poster={post.thumbnailUrl ?? undefined}
              controls
              playsInline
              loop
              preload="metadata"
              className="aspect-9/16 max-h-[420px] w-full object-contain"
            />
          ) : (
            <div className="flex aspect-9/16 max-h-[360px] flex-col items-center justify-center gap-2.5 px-4 text-center text-xs text-muted-foreground">
              {isFailed ? (
                <>
                  <IconAlertTriangle className="size-8 text-rose-400" />
                  <p className="font-semibold text-rose-300">Auto-edit failed</p>
                  {lastFailedJob?.error ? (
                    <p className="line-clamp-3 text-[0.68rem] text-rose-200/80">
                      {lastFailedJob.error}
                    </p>
                  ) : null}
                  {primaryClip ? (
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={isRerendering}
                      onClick={() => void handleRerender()}
                    >
                      <IconRefresh className="size-3.5" />
                      Retry Render
                    </Button>
                  ) : null}
                </>
              ) : (
                <>
                  <IconLoader2 className="size-8 animate-spin text-primary" />
                  <p className="font-semibold text-foreground">
                    {activeJob?.stageLabel || "Preparing auto-edit..."}
                  </p>
                  <p className="text-[0.68rem] text-muted-foreground">
                    Syncing audio & rendering beat-synced 1080×1920 video
                  </p>
                </>
              )}
            </div>
          )}

          {activeJob ? (
            <div className="absolute inset-x-0 bottom-0 bg-background/90 p-2.5 backdrop-blur-md">
              <div className="flex items-center justify-between text-[0.68rem]">
                <span className="truncate font-semibold text-foreground">
                  {activeJob.stageLabel}
                </span>
                <span className="ml-2 shrink-0 font-mono text-primary">{activeJob.progress}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${Math.max(6, activeJob.progress)}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between text-[0.68rem] text-muted-foreground">
          <span className="truncate">
            {post.videoFileName || primaryClip?.fileName || "Uploaded clip"}
          </span>
          {post.videoSizeBytes ? (
            <span className="shrink-0 font-mono">{formatBytes(post.videoSizeBytes)}</span>
          ) : null}
        </div>
      </div>

      {/* Right: Quick Review Controls & 1-Tap Approve */}
      <div className="flex flex-col justify-between gap-4">
        <div className="space-y-3">
          {/* Header Badges */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge className="border-amber-500/40 bg-amber-500/15 text-[0.68rem] text-amber-200">
                <IconCalendarClock className="mr-1 size-3" />
                Auto-slot: {formatSlot(scheduledForLocal || post.scheduledFor)}
              </Badge>
              {track ? (
                <Badge variant="outline" className="text-[0.68rem]">
                  <IconDisc className="mr-1 size-3 text-primary" />
                  {track.title} ({track.bpm ?? 200} BPM)
                </Badge>
              ) : null}
              {primaryClip && primaryClip.detectedOffsetSec !== null ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[0.65rem]",
                    (syncPct ?? 0) >= 35
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-200",
                  )}
                >
                  <IconWaveSine className="mr-1 size-3" />
                  {(syncPct ?? 0) >= 35
                    ? `Synced @ ${formatSec(primaryClip.detectedOffsetSec)} (${syncPct}%)`
                    : `Drop-Snap @ ${formatSec(primaryClip.detectedOffsetSec)}`}
                </Badge>
              ) : null}
              {isMultiTake ? (
                <Badge className="border-fuchsia-500/40 bg-fuchsia-500/15 text-[0.65rem] text-fuchsia-200">
                  <IconArrowsShuffle className="mr-1 size-3" />
                  {postRawClips.length} Angles{cutCount > 1 ? ` · ${cutCount} Beat Cuts` : ""}
                </Badge>
              ) : null}
              {post.editRecipe ? (
                <Badge variant="outline" className="border-primary/40 text-[0.65rem] text-primary">
                  <IconBolt className="mr-0.5 size-3" />
                  {PRESET_LABELS[post.editRecipe.preset]?.label ?? post.editRecipe.preset} •{" "}
                  {Math.round(post.editRecipe.masterEndSec - post.editRecipe.masterStartSec)}s
                </Badge>
              ) : null}
            </div>

            <div className="flex items-center gap-1">
              <Button size="xs" variant="ghost" onClick={() => setShowTweak((v) => !v)}>
                <IconEdit className="size-3.5" />
                <span>{showTweak ? "Hide Tweak" : "Quick Tweak"}</span>
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={handleDiscard}
                title="Discard draft"
              >
                <IconTrash className="size-3.5 text-destructive" />
              </Button>
            </div>
          </div>

          {/* 1-Click Preset & AI Re-Roll Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 border border-border/50 bg-background/50 px-3 py-2 text-xs">
            {primaryClip ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[0.7rem] font-semibold text-muted-foreground">
                  <IconWand className="size-3.5 text-primary" />
                  Beat FX:
                </span>
                {(["subtle", "punchy", "hard"] as EditPreset[]).map((p) => {
                  const active = (post.editRecipe?.preset ?? editPreset) === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={isProcessing || isRerendering}
                      onClick={() => void handleRerender(p)}
                      className={cn(
                        "border px-2 py-0.5 text-[0.68rem] font-semibold transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/60 bg-card/50 text-muted-foreground hover:border-primary/50 hover:text-foreground",
                      )}
                    >
                      {PRESET_LABELS[p].label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <span className="text-[0.68rem] text-muted-foreground">Direct Upload</span>
            )}

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={isProcessing || isRerollingCopy}
                onClick={() => void handleRerollCopy()}
              >
                {isRerollingCopy ? (
                  <IconLoader2 className="size-3 animate-spin" />
                ) : (
                  <IconSparkles className="size-3 text-primary" />
                )}
                <span>Re-roll Copy</span>
              </Button>
              {isMultiTake ? (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={isProcessing || isRerendering}
                  onClick={() => void handleShuffleMultiTakeCuts()}
                >
                  <IconArrowsShuffle className="size-3 text-fuchsia-300" />
                  <span>Shuffle Cuts</span>
                </Button>
              ) : null}
              {primaryClip ? (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={isProcessing || isRerendering}
                  onClick={() => void handleRerollEdit()}
                >
                  <IconRefresh className={cn("size-3", isRerendering && "animate-spin")} />
                  <span>Re-roll Edit</span>
                </Button>
              ) : null}
            </div>
          </div>

          {isMultiTake && postRawClips.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-[0.65rem]">
              {postRawClips.map((c, idx) => {
                const pct =
                  c.syncConfidence !== null && c.syncConfidence !== undefined
                    ? Math.round(c.syncConfidence * 100)
                    : null;
                return (
                  <span
                    key={c.id}
                    className="border border-border/60 bg-background/60 px-2 py-0.5 text-muted-foreground"
                  >
                    Take {idx + 1}
                    {c.detectedOffsetSec !== null && c.detectedOffsetSec !== undefined
                      ? ` @ ${formatSec(c.detectedOffsetSec)}${pct !== null ? ` (${pct}%)` : ""}`
                      : " (syncing...)"}
                  </span>
                );
              })}
            </div>
          ) : null}

          {post.editRecipe?.aiDirector?.directorNotes ? (
            <div className="flex items-start gap-2 border-l-2 border-primary/60 bg-primary/8 px-2.5 py-1.5 text-[0.68rem] text-muted-foreground">
              <IconSparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <div>
                <span className="font-semibold text-foreground">
                  {post.editRecipe.aiDirector.source === "gemini"
                    ? `Gemini Director (${post.editRecipe.aiDirector.model})`
                    : "DSP Director"}
                  :{" "}
                </span>
                <span>{post.editRecipe.aiDirector.directorNotes}</span>
              </div>
            </div>
          ) : null}

          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Video / YouTube Shorts title..."
            className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm font-bold text-foreground focus:border-primary focus:outline-none"
          />

          {/* Caption */}
          <div>
            <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Caption
            </label>
            <textarea
              rows={3}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Direct, human caption..."
              className="mt-1 w-full resize-none border border-border/70 bg-background/80 p-2.5 text-xs leading-relaxed text-foreground focus:border-primary focus:outline-none"
            />
          </div>

          {/* Target Platform Toggles */}
          <div className="flex flex-wrap items-center gap-1.5">
            {PUBLISHABLE_PLATFORMS.map((p) => {
              const meta = PLATFORM_META[p];
              const active = platforms.includes(p);
              const isLinked = connectedPlatforms.has(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  className={cn(
                    "inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-medium transition-colors",
                    active
                      ? meta.badgeClass
                      : "border-border/60 bg-background/40 text-muted-foreground opacity-60 hover:opacity-100",
                  )}
                >
                  <meta.Icon className="size-3.5" />
                  <span>{meta.shortLabel}</span>
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      isLinked ? "bg-emerald-400" : "bg-slate-500",
                    )}
                    title={isLinked ? "Account connected" : "Account not connected yet"}
                  />
                </button>
              );
            })}
          </div>

          {/* Hashtags Preview */}
          <div className="flex flex-wrap items-center gap-1">
            {hashtags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 border border-border/60 bg-background/60 px-2 py-0.5 text-[0.68rem] text-muted-foreground"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => setHashtags((prev) => prev.filter((t) => t !== tag))}
                  className="hover:text-foreground"
                >
                  <IconX className="size-2.5" />
                </button>
              </span>
            ))}
          </div>

          {/* Collapsible Quick Tweak Section */}
          {showTweak ? (
            <div className="space-y-3 border border-primary/35 bg-background/70 p-3">
              {primaryClip ? (
                <div className="space-y-2.5 border-b border-border/50 pb-3">
                  <p className="text-[0.68rem] font-bold uppercase tracking-wider text-primary">
                    Sync, Trim & Beat FX Re-Render
                  </p>
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    <div>
                      <label className="text-[0.65rem] font-semibold text-muted-foreground">
                        Sync Offset (sec in track)
                      </label>
                      <input
                        type="number"
                        step="0.05"
                        value={tweakOffsetSec}
                        onChange={(e) => setTweakOffsetSec(e.target.value)}
                        className="mt-1 w-full border border-border/70 bg-card/50 px-2 py-1 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[0.65rem] font-semibold text-muted-foreground">
                        Clip Start (sec in track)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        value={tweakStartSec}
                        onChange={(e) => setTweakStartSec(e.target.value)}
                        className="mt-1 w-full border border-border/70 bg-card/50 px-2 py-1 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[0.65rem] font-semibold text-muted-foreground">
                        Length (sec)
                      </label>
                      <input
                        type="number"
                        min={4}
                        max={35}
                        value={tweakDurationSec}
                        onChange={(e) => setTweakDurationSec(e.target.value)}
                        className="mt-1 w-full border border-border/70 bg-card/50 px-2 py-1 text-xs"
                      />
                    </div>
                  </div>

                  {track?.audioAnalysis?.drops?.length ? (
                    <div className="flex flex-wrap items-center gap-1.5 text-[0.66rem]">
                      <span className="text-muted-foreground">Snap to drop:</span>
                      {track.audioAnalysis.drops.map((d, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setTweakOffsetSec(d.startSec.toFixed(2));
                            setTweakStartSec(d.startSec.toFixed(1));
                          }}
                          className="border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary-foreground hover:bg-primary/25"
                        >
                          {d.label} ({formatSec(d.dropImpactSec)})
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={burnHookOverlay}
                        onChange={(e) => setBurnHookOverlay(e.target.checked)}
                        className="accent-primary"
                      />
                      <span>Burn hook text</span>
                    </label>
                    {burnHookOverlay ? (
                      <input
                        type="text"
                        value={hookOverlayText}
                        onChange={(e) => setHookOverlayText(e.target.value)}
                        placeholder="On-screen safe-zone hook text..."
                        className="flex-1 min-w-44 border border-border/70 bg-card/50 px-2.5 py-1 text-xs"
                      />
                    ) : null}
                    <Button
                      type="button"
                      size="xs"
                      disabled={isProcessing || isRerendering}
                      onClick={() => void handleRerender()}
                    >
                      {isRerendering ? (
                        <IconLoader2 className="size-3.5 animate-spin" />
                      ) : (
                        <IconRefresh className="size-3.5" />
                      )}
                      <span>Re-Render Video</span>
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    Override Auto-Slot
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledForLocal}
                    onChange={(e) => setScheduledForLocal(e.target.value)}
                    className="mt-1 w-full border border-border/70 bg-card/50 px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    Linked Track
                  </label>
                  <select
                    value={catalogItemId}
                    onChange={(e) => setCatalogItemId(e.target.value)}
                    className="mt-1 w-full border border-border/70 bg-card/50 px-2.5 py-1.5 text-xs text-foreground"
                  >
                    <option value="">No track linked</option>
                    {catalog.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title} ({item.bpm ?? 200} BPM)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  type="text"
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTags();
                    }
                  }}
                  placeholder="Add #hashtags..."
                  className="flex-1 min-w-36 border border-border/70 bg-card/50 px-2.5 py-1 text-xs"
                />
                <Button type="button" size="xs" variant="outline" onClick={addTags}>
                  Add Tags
                </Button>
                {hashtagPresets.slice(0, 3).map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      setHashtags((prev) => Array.from(new Set([...prev, ...preset.tags])))
                    }
                  >
                    + {preset.name}
                  </Button>
                ))}
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={isSaving}
                  onClick={() => void saveChanges(false)}
                >
                  {isSaving ? "Saving..." : "Save Copy & Slot"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Bottom 1-Tap Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3">
          <Button
            size="sm"
            variant="outline"
            disabled={isProcessing || isPublishing || isApproving || !post.videoUrl}
            onClick={handlePublishNow}
          >
            {isPublishing ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconRocket className="size-4" />
            )}
            <span>{isPublishing ? "Publishing..." : "Publish Now"}</span>
          </Button>

          <Button
            size="sm"
            className="shadow-lg shadow-primary/20"
            disabled={isProcessing || isApproving || isPublishing || !post.videoUrl}
            onClick={handleApprove}
          >
            {isApproving ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconCheck className="size-4" />
            )}
            <span>{isApproving ? "Scheduling..." : "Approve for Autopilot"}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CreateReviewTab({
  profile,
  catalog,
  posts,
  rawClips,
  connections,
  hashtagPresets,
  recentJobs,
  nextAvailableSlot,
  geminiStatus,
  onRefresh,
  onNavigateTab,
}: CreateReviewTabProps) {
  const [selectedTrackId, setSelectedTrackId] = useState<string>(catalog[0]?.id ?? "");
  const [ingestMode, setIngestMode] = useState<"auto_edit" | "direct_upload">(() =>
    catalog.some((c) => c.masterAudioPath || c.audioPreviewUrl) ? "auto_edit" : "direct_upload",
  );
  const [multiFileBehavior, setMultiFileBehavior] = useState<"mashup" | "separate">("mashup");
  const [selectedPreset, setSelectedPreset] = useState<EditPreset>(
    profile.defaultEditPreset || "punchy",
  );
  const [selectedPlatforms, setSelectedPlatforms] = useState<PublishablePlatform[]>(() => {
    const connected = connections.map((c) => c.platform);
    if (connected.length > 0) return connected;
    const fromProfile = (profile.targetPlatforms ?? []).filter((p): p is PublishablePlatform =>
      PUBLISHABLE_PLATFORMS.includes(p as PublishablePlatform),
    );
    return fromProfile.length > 0 ? fromProfile : ["youtube_shorts", "instagram_reels", "tiktok"];
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadCountText, setUploadCountText] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reviewPosts = posts.filter(
    (p) =>
      p.status !== "posted" &&
      (p.reviewStatus === "needs_review" ||
        p.reviewStatus === "processing" ||
        p.reviewStatus === "failed"),
  );

  // Live poll every 2.5s ONLY while an auto-edit render job is actively running/queued
  const hasActiveRender =
    reviewPosts.some((p) => p.reviewStatus === "processing") ||
    recentJobs.some(
      (j) => j.jobType === "render_video" && (j.status === "queued" || j.status === "running"),
    );

  useEffect(() => {
    if (!hasActiveRender) return;
    const timer = setInterval(() => {
      void onRefresh();
    }, 2500);
    return () => clearInterval(timer);
  }, [hasActiveRender, onRefresh]);

  const selectedTrack = catalog.find((c) => c.id === selectedTrackId) ?? null;
  const trackHasMasterAudio = Boolean(
    selectedTrack?.masterAudioPath || selectedTrack?.audioPreviewUrl,
  );

  const togglePlatform = (p: PublishablePlatform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p)
        ? prev.length > 1
          ? prev.filter((item) => item !== p)
          : prev
        : [...prev, p],
    );
  };

  const handleFilesSelected = async (files: FileList | File[]) => {
    const videoFiles = Array.from(files).filter(
      (f) => f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(f.name),
    );
    if (videoFiles.length === 0) {
      toast.error("Drop or select an .MP4 or .MOV video file.");
      return;
    }

    const useAutoEdit = ingestMode === "auto_edit" && selectedTrack && trackHasMasterAudio;
    if (ingestMode === "auto_edit" && !useAutoEdit) {
      toast.error("Pick a track with master audio first (or switch to Direct Upload).");
      return;
    }

    setIsUploading(true);
    let createdCount = 0;
    const isMultiTakeMashup =
      useAutoEdit && videoFiles.length >= 2 && videoFiles.length <= 6 && multiFileBehavior === "mashup";

    try {
      if (isMultiTakeMashup && selectedTrack) {
        const uploadedTakes: Array<{
          storageKey: string;
          fileName: string;
          sizeBytes: number;
          durationSec?: number | null;
          width?: number | null;
          height?: number | null;
          fps?: number | null;
        }> = [];

        for (let i = 0; i < videoFiles.length; i++) {
          const file = videoFiles[i]!;
          setUploadCountText(
            `Uploading take ${i + 1}/${videoFiles.length} for mashup: ${file.name}...`,
          );
          const formData = new FormData();
          formData.append("video", file);
          const res = await fetch("/api/socials/raw-upload", {
            method: "POST",
            body: formData,
          });
          const json = (await res.json()) as {
            storageKey?: string;
            fileName?: string;
            sizeBytes?: number;
            durationSec?: number;
            width?: number | null;
            height?: number | null;
            fps?: number | null;
            error?: string;
          };
          if (!res.ok || !json.storageKey) {
            throw new Error(json.error || `Failed to upload take ${file.name}`);
          }
          uploadedTakes.push({
            storageKey: json.storageKey,
            fileName: json.fileName || file.name,
            sizeBytes: json.sizeBytes ?? file.size,
            durationSec: json.durationSec ?? null,
            width: json.width ?? null,
            height: json.height ?? null,
            fps: json.fps ?? null,
          });
        }

        await createAutoEditPostServerFn({
          data: {
            catalogItemId: selectedTrack.id,
            rawClips: uploadedTakes,
            preset: selectedPreset,
            platforms: selectedPlatforms,
          },
        });
        await onRefresh();
        toast.success(
          `Queued ${uploadedTakes.length}-angle beat-cut mashup (${PRESET_LABELS[selectedPreset].label}) for ${selectedTrack.title}!`,
        );
        return;
      }

      for (let i = 0; i < videoFiles.length; i++) {
        const file = videoFiles[i]!;
        setUploadCountText(
          videoFiles.length > 1
            ? `Uploading ${i + 1}/${videoFiles.length}: ${file.name}...`
            : `Uploading ${file.name} (${formatBytes(file.size)})...`,
        );

        const formData = new FormData();
        formData.append("video", file);

        if (useAutoEdit && selectedTrack) {
          const res = await fetch("/api/socials/raw-upload", {
            method: "POST",
            body: formData,
          });
          const json = (await res.json()) as {
            storageKey?: string;
            fileName?: string;
            sizeBytes?: number;
            durationSec?: number;
            width?: number | null;
            height?: number | null;
            fps?: number | null;
            error?: string;
          };
          if (!res.ok || !json.storageKey) {
            throw new Error(json.error || `Failed to upload raw clip ${file.name}`);
          }

          await createAutoEditPostServerFn({
            data: {
              catalogItemId: selectedTrack.id,
              rawClips: [
                {
                  storageKey: json.storageKey,
                  fileName: json.fileName || file.name,
                  sizeBytes: json.sizeBytes ?? file.size,
                  durationSec: json.durationSec ?? null,
                  width: json.width ?? null,
                  height: json.height ?? null,
                  fps: json.fps ?? null,
                },
              ],
              preset: selectedPreset,
              platforms: selectedPlatforms,
            },
          });
        } else {
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
            throw new Error(json.error || `Failed to upload ${file.name}`);
          }

          await createAutopilotDraftServerFn({
            data: {
              catalogItemId: selectedTrackId || null,
              videoUrl: json.videoUrl,
              videoFileName: json.videoFileName || file.name,
              videoSizeBytes: json.videoSizeBytes ?? file.size,
              platforms: selectedPlatforms,
              editMode: "manual",
            },
          });
        }
        createdCount++;
      }

      await onRefresh();
      toast.success(
        useAutoEdit
          ? `Queued auto-sync & ${PRESET_LABELS[selectedPreset].label} edit for ${createdCount} clip(s)!`
          : `Added ${createdCount} clip(s) to Review Inbox!`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
      setUploadCountText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      {/* ====================================================================
          1. FAST DROP ZONE (AUTO-EDIT OR DIRECT UPLOAD)
          ==================================================================== */}
      <div className="space-y-4 border border-primary/40 bg-linear-to-br from-primary/12 via-card/65 to-card/45 p-4 backdrop-blur-md sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary text-[0.65rem] text-primary-foreground">
                <IconSparkles className="mr-1 size-3" />
                Zero-Planning Drop Zone
              </Badge>
              {geminiStatus ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[0.65rem]",
                    geminiStatus.configured
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : "text-muted-foreground",
                  )}
                >
                  {geminiStatus.configured
                    ? `Gemini AI: ${geminiStatus.model}`
                    : "DSP Mode (add GEMINI_API_KEY for AI)"}
                </Badge>
              ) : null}
              <span className="text-xs text-muted-foreground">
                Next slot:{" "}
                <strong className="text-foreground">{formatSlot(nextAvailableSlot)}</strong>
              </span>
            </div>
            <h2 className="mt-1.5 text-lg font-bold text-foreground sm:text-xl">
              Drop raw phone dancing clip(s) → Auto-Sync & Beat-Synced Edit
            </h2>
            <p className="text-xs text-muted-foreground">
              Auto-Edit matches your room audio to the master WAV/MP3, swaps clean audio at full
              uptempo loudness ({profile.audioHeadroomDb ?? -1.5} dB trim), and renders beat-synced
              zooms & shakes.
            </p>
          </div>

          {/* Mode Toggle */}
          <div className="inline-flex border border-border/70 bg-background/80 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setIngestMode("auto_edit")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold transition-colors",
                ingestMode === "auto_edit"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <IconWand className="size-3.5" />
              Auto-Edit
            </button>
            <button
              type="button"
              onClick={() => setIngestMode("direct_upload")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold transition-colors",
                ingestMode === "direct_upload"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <IconVideo className="size-3.5" />
              Direct Upload
            </button>
          </div>
        </div>

        {/* Track + FX Preset + Platforms Selector Row */}
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
          <div className="space-y-1">
            <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Track / Demo {ingestMode === "auto_edit" ? "(required for sync)" : ""}
            </label>
            <div className="flex items-center gap-2">
              <select
                value={selectedTrackId}
                onChange={(e) => setSelectedTrackId(e.target.value)}
                className="w-full border border-border/80 bg-background/85 px-3 py-2 text-xs font-semibold text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">No track linked</option>
                {catalog.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} ({item.bpm ?? 200} BPM)
                    {item.audioAnalysis ? " ✓ Analyzed" : ""}
                  </option>
                ))}
              </select>
              {catalog.length === 0 ? (
                <Button size="xs" variant="outline" onClick={() => onNavigateTab("settings")}>
                  Sync Tracks
                </Button>
              ) : null}
            </div>
          </div>

          {ingestMode === "auto_edit" ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Beat FX Preset
                </label>
                <div className="flex items-center gap-1">
                  {(["subtle", "punchy", "hard"] as EditPreset[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      title={PRESET_LABELS[p].hint}
                      onClick={() => setSelectedPreset(p)}
                      className={cn(
                        "border px-2.5 py-2 text-xs font-semibold transition-colors",
                        selectedPreset === p
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/70 bg-background/60 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {PRESET_LABELS[p].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  2–6 Clips Dropped
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setMultiFileBehavior("mashup")}
                    title="Sync all takes to the track and beat-cut between angles into 1 video"
                    className={cn(
                      "border px-2.5 py-2 text-xs font-semibold transition-colors",
                      multiFileBehavior === "mashup"
                        ? "border-fuchsia-500/60 bg-fuchsia-500/20 text-fuchsia-200"
                        : "border-border/70 bg-background/60 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Beat-Cut Mashup
                  </button>
                  <button
                    type="button"
                    onClick={() => setMultiFileBehavior("separate")}
                    title="Create one separate single-take post per uploaded video"
                    className={cn(
                      "border px-2.5 py-2 text-xs font-semibold transition-colors",
                      multiFileBehavior === "separate"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/70 bg-background/60 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Separate Posts
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-1">
            <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Target Channels
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {PUBLISHABLE_PLATFORMS.map((p) => {
                const meta = PLATFORM_META[p];
                const active = selectedPlatforms.includes(p);
                const isLinked = connections.some((c) => c.platform === p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    className={cn(
                      "inline-flex items-center gap-1.5 border px-2.5 py-2 text-xs font-semibold transition-colors",
                      active
                        ? meta.badgeClass
                        : "border-border/70 bg-background/60 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <meta.Icon className="size-3.5" />
                    <span>{meta.shortLabel}</span>
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        isLinked ? "bg-emerald-400" : "bg-slate-500",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Drag & Drop / Mobile Tap Target */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/mp4,video/quicktime,video/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void handleFilesSelected(e.target.files);
          }}
        />
        <div
          role="button"
          tabIndex={0}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !isUploading) {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (!isUploading && e.dataTransfer.files?.length) {
              void handleFilesSelected(e.dataTransfer.files);
            }
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed px-4 py-8 text-center transition-all",
            isDragging
              ? "border-primary bg-primary/15"
              : "border-border/70 bg-background/50 hover:border-primary/60 hover:bg-background/75",
            isUploading && "pointer-events-none opacity-80",
          )}
        >
          {isUploading ? (
            <>
              <IconLoader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm font-bold text-foreground">{uploadCountText}</p>
              <p className="text-xs text-muted-foreground">
                {ingestMode === "auto_edit"
                  ? "Uploading raw clip & queuing acoustic auto-sync + FFmpeg render..."
                  : "Uploading video & reserving next Autopilot slot..."}
              </p>
            </>
          ) : (
            <>
              <div className="flex size-11 items-center justify-center border border-primary/40 bg-primary/15 text-primary">
                <IconUpload className="size-5" />
              </div>
              <p className="text-sm font-bold text-foreground">
                {ingestMode === "auto_edit"
                  ? "Drop raw dancing clip(s) here or tap to pick from phone"
                  : "Drop edited vertical video(s) here or tap to pick"}
              </p>
              <p className="max-w-lg text-xs text-muted-foreground">
                MP4 / MOV up to 250 MB •{" "}
                {ingestMode === "auto_edit"
                  ? selectedTrack && trackHasMasterAudio
                    ? multiFileBehavior === "mashup"
                      ? `Drop 1 clip for Single-Take or 2–6 takes of ${selectedTrack.title} for a Beat-Cut Mashup`
                      : `Auto-syncs each clip to ${selectedTrack.title} as separate posts`
                    : "Select a track with audio above (or sync site releases in Settings)"
                  : "Uploads directly into Review Inbox without re-encoding"}
              </p>
            </>
          )}
        </div>
      </div>

      {/* ====================================================================
          2. 1-TAP VERTICAL REVIEW INBOX
          ==================================================================== */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-foreground">
              Review Inbox ({reviewPosts.length})
            </h3>
            <p className="text-xs text-muted-foreground">
              Watch your finished beat-synced edit, switch FX preset in 1 click if desired, and tap{" "}
              <strong className="text-foreground">Approve for Autopilot</strong>.
            </p>
          </div>
          {hasActiveRender ? (
            <Badge className="border-primary/40 bg-primary/15 text-xs text-primary">
              <IconLoader2 className="mr-1.5 size-3.5 animate-spin" />
              Rendering in background...
            </Badge>
          ) : null}
        </div>

        {reviewPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-border/60 bg-card/25 py-10 text-center">
            <IconCheck className="size-7 text-emerald-400/70" />
            <p className="text-sm font-semibold text-foreground">Review Inbox is clear</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Drop a raw phone clip above to auto-sync and edit it, or view scheduled drops in your
              Autopilot Queue.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {reviewPosts.map((post) => {
              const postClips = rawClips.filter((c) => c.postId === post.id);
              const activeJob = recentJobs.find(
                (j) =>
                  j.postId === post.id && (j.status === "queued" || j.status === "running"),
              );
              const lastFailedJob = recentJobs.find(
                (j) => j.postId === post.id && j.status === "failed",
              );
              return (
                <ReviewInboxCard
                  key={post.id}
                  post={post}
                  postRawClips={postClips}
                  catalog={catalog}
                  connections={connections}
                  hashtagPresets={hashtagPresets}
                  activeJob={activeJob}
                  lastFailedJob={lastFailedJob}
                  onRefresh={onRefresh}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
