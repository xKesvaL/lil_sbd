import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowsShuffle,
  IconCalendar,
  IconCalendarClock,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconDisc,
  IconExternalLink,
  IconLoader2,
  IconRefresh,
  IconRocket,
  IconTrash,
  IconVideo,
} from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import type {
  ArtistCatalogItemRecord,
  ArtistProfileRecord,
  BackgroundJobRecord,
  PublishablePlatform,
  SocialPostRecord,
} from "#/db/schema";
import { cn } from "#/lib/utils";
import {
  deleteSocialPostServerFn,
  publishPostNowServerFn,
  rebalanceAutopilotQueueServerFn,
  retryFailedPublishServerFn,
  updateReviewPostServerFn,
} from "#/server/socials";
import {
  DELIVERY_STATUS_META,
  PLATFORM_META,
  PUBLISHABLE_PLATFORMS,
  type SafeSocialConnection,
  WEEKDAY_OPTIONS,
} from "./social-constants";

interface AutopilotQueueTabProps {
  profile: ArtistProfileRecord;
  posts: SocialPostRecord[];
  catalog: ArtistCatalogItemRecord[];
  connections: SafeSocialConnection[];
  recentJobs: BackgroundJobRecord[];
  onRefresh: () => Promise<void>;
  onNavigateTab: (tab: "create" | "settings") => void;
}

function formatSlot(dateLike?: Date | string | null): string {
  if (!dateLike) return "Unscheduled";
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "Unscheduled";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AutopilotQueueTab({
  profile,
  posts,
  catalog,
  connections,
  recentJobs,
  onRefresh,
  onNavigateTab,
}: AutopilotQueueTabProps) {
  const [isRebalancing, setIsRebalancing] = useState(false);
  const [publishingPostId, setPublishingPostId] = useState<string | null>(null);
  const [retryingPostId, setRetryingPostId] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  const queuedPosts = [...posts]
    .filter(
      (p) =>
        p.status !== "posted" &&
        (p.reviewStatus === "approved" || p.autoPublish),
    )
    .sort((a, b) => {
      const da = a.scheduledFor ? new Date(a.scheduledFor).getTime() : Infinity;
      const dbTime = b.scheduledFor ? new Date(b.scheduledFor).getTime() : Infinity;
      return da - dbTime;
    });

  const publishedPosts = [...posts]
    .filter((p) => p.status === "posted" || p.reviewStatus === "published")
    .sort((a, b) => {
      const da = a.postedAt ? new Date(a.postedAt).getTime() : 0;
      const dbTime = b.postedAt ? new Date(b.postedAt).getTime() : 0;
      return dbTime - da;
    })
    .slice(0, 12);

  const cadenceDays = profile.cadenceDays?.length ? profile.cadenceDays : [1, 3, 5, 0];
  const cadenceLabel = WEEKDAY_OPTIONS.filter((w) => cadenceDays.includes(w.day))
    .map((w) => w.short)
    .join(" · ");

  const handleRebalance = async () => {
    setIsRebalancing(true);
    try {
      const res = await rebalanceAutopilotQueueServerFn();
      await onRefresh();
      toast.success(
        res.rebalancedCount > 0
          ? `Rebalanced ${res.rebalancedCount} queued post(s) across your cadence!`
          : "No approved posts in queue to rebalance.",
      );
    } catch {
      toast.error("Could not rebalance queue");
    } finally {
      setIsRebalancing(false);
    }
  };

  const handlePublishNow = async (post: SocialPostRecord) => {
    if (!post.videoUrl) {
      toast.error("No video attached to this post.");
      return;
    }
    setPublishingPostId(post.id);
    try {
      const connectedSet = new Set(connections.map((c) => c.platform));
      const targets = (post.platforms ?? []).filter(
        (p): p is PublishablePlatform =>
          PUBLISHABLE_PLATFORMS.includes(p as PublishablePlatform) && connectedSet.has(p as PublishablePlatform),
      );
      if (targets.length === 0) {
        toast.error("Connect at least one target platform in Tracks & Settings first.");
        return;
      }

      const res = await publishPostNowServerFn({
        data: { postId: post.id, platforms: targets },
      });
      await onRefresh();
      if (res.allSucceeded) {
        toast.success(`Published "${post.title}" live!`);
      } else if (res.anySucceeded) {
        toast.success("Published to connected platforms (see per-platform status).");
      } else {
        const firstErr = Object.values(res.deliveries).find((d) => d?.error)?.error;
        toast.error(firstErr || "Publishing failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publishing failed");
    } finally {
      setPublishingPostId(null);
    }
  };

  const handleRetryFailed = async (postId: string) => {
    setRetryingPostId(postId);
    try {
      await retryFailedPublishServerFn({ data: { postId } });
      await onRefresh();
      toast.success("Queued retry job in background worker!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not queue retry");
    } finally {
      setRetryingPostId(null);
    }
  };

  const handleSendToReview = async (postId: string) => {
    try {
      await updateReviewPostServerFn({
        data: { postId, reviewStatus: "needs_review", autoPublish: false },
      });
      await onRefresh();
      toast.success("Moved back to Review Inbox");
      onNavigateTab("create");
    } catch {
      toast.error("Could not move post back to review");
    }
  };

  const handleDelete = async (postId: string) => {
    try {
      await deleteSocialPostServerFn({ data: { id: postId } });
      await onRefresh();
      toast.success("Removed post from queue");
    } catch {
      toast.error("Could not delete post");
    }
  };

  // Calendar grid computation
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7; // Mon = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calendarCells: Array<{ dateStr: string; dayNumber: number; weekday: number } | null> = [];
  for (let i = 0; i < firstDayOfWeek; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const pad = (n: number) => String(n).padStart(2, "0");
    const dt = new Date(year, month, d);
    calendarCells.push({
      dateStr: `${year}-${pad(month + 1)}-${pad(d)}`,
      dayNumber: d,
      weekday: dt.getDay(),
    });
  }

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      {/* ====================================================================
          1. AUTOPILOT CADENCE STRIP
          ==================================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-3 border border-border/70 bg-card/45 p-4 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center border border-primary/40 bg-primary/15 text-primary">
              <IconCalendarClock className="size-4.5" />
            </div>
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Active Cadence ({profile.timezone || "Europe/Paris"})
              </p>
              <p className="text-sm font-bold text-foreground">
                {cadenceLabel} @ {profile.cadenceTime || "18:00"}
              </p>
            </div>
          </div>

          <div className="hidden h-7 w-px bg-border/60 sm:block" />

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {queuedPosts.length} Approved in Queue
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                profile.avoidConsecutiveTrack !== false
                  ? "border-emerald-500/40 text-emerald-300"
                  : "text-muted-foreground",
              )}
            >
              Track Rotation: {profile.avoidConsecutiveTrack !== false ? "ON" : "OFF"}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="xs"
            variant="outline"
            disabled={isRebalancing || queuedPosts.length === 0}
            onClick={handleRebalance}
          >
            <IconArrowsShuffle className={cn("size-3.5", isRebalancing && "animate-spin")} />
            <span>{isRebalancing ? "Rebalancing..." : "Rebalance Queue"}</span>
          </Button>
          <Button size="xs" variant="outline" onClick={() => onNavigateTab("settings")}>
            Edit Cadence
          </Button>
        </div>
      </div>

      {/* ====================================================================
          2. UPCOMING AUTOPILOT FEED
          ==================================================================== */}
      <div className="space-y-3 border border-border/70 bg-card/35 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-foreground">
              Upcoming Autopilot Drops ({queuedPosts.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              Approved clips fire automatically via the persistent background worker with retry
              backoff.
            </p>
          </div>
          <Button size="xs" onClick={() => onNavigateTab("create")}>
            + Drop New Clip
          </Button>
        </div>

        {queuedPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-border/60 bg-background/40 py-8 text-center">
            <p className="text-sm font-semibold text-foreground">No upcoming clips queued</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Drop clips in Create & Review and tap Approve to fill your weekly posting calendar
              automatically.
            </p>
            <Button size="sm" className="mt-1" onClick={() => onNavigateTab("create")}>
              Go to Create & Review
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border/60 border border-border/70 bg-background/75">
            {queuedPosts.map((post) => {
              const track = catalog.find((c) => c.id === post.catalogItemId);
              const targets = (post.platforms ?? []).filter((p): p is PublishablePlatform =>
                PUBLISHABLE_PLATFORMS.includes(p as PublishablePlatform),
              );
              const hasFailure = targets.some(
                (p) => post.platformDeliveries?.[p]?.status === "failed",
              );
              const firstError = targets
                .map((p) => post.platformDeliveries?.[p]?.error)
                .find(Boolean);
              const isPublishing = publishingPostId === post.id;
              const isRetrying = retryingPostId === post.id;

              return (
                <div
                  key={post.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3.5 transition-colors hover:bg-card/50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex size-11 shrink-0 items-center justify-center border border-primary/35 bg-primary/10 text-primary">
                      <IconVideo className="size-5" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-foreground">
                          {post.title}
                        </span>
                        {track ? (
                          <span className="inline-flex items-center gap-1 border border-border/60 bg-card/60 px-1.5 py-0.5 text-[0.64rem] text-muted-foreground">
                            <IconDisc className="size-3 text-primary" />
                            {track.title}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatSlot(post.scheduledFor)}
                        {post.captionEn ? ` • ${post.captionEn.slice(0, 80)}` : ""}
                      </p>
                      {hasFailure && firstError ? (
                        <p className="flex items-center gap-1 text-[0.68rem] text-rose-300">
                          <IconAlertTriangle className="size-3 shrink-0" />
                          <span className="truncate">{firstError}</span>
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1">
                      {targets.map((p) => {
                        const meta = PLATFORM_META[p];
                        const deliv = post.platformDeliveries?.[p];
                        const stMeta = deliv ? DELIVERY_STATUS_META[deliv.status] : null;
                        return (
                          <span
                            key={p}
                            title={`${meta.label}${deliv?.error ? `: ${deliv.error}` : stMeta ? ` (${stMeta.label})` : ""}`}
                            className={cn(
                              "inline-flex items-center gap-1 border px-2 py-0.5 text-[0.65rem] font-medium",
                              meta.badgeClass,
                            )}
                          >
                            <meta.Icon className="size-3" />
                            <span className="hidden sm:inline">{meta.shortLabel}</span>
                            {stMeta ? (
                              <span className={cn("size-1.5 rounded-full", stMeta.dotClass)} />
                            ) : null}
                          </span>
                        );
                      })}
                    </div>

                    {hasFailure ? (
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={isRetrying}
                        onClick={() => void handleRetryFailed(post.id)}
                      >
                        <IconRefresh className={cn("size-3.5", isRetrying && "animate-spin")} />
                        <span>Retry</span>
                      </Button>
                    ) : null}

                    <Button
                      size="xs"
                      disabled={isPublishing}
                      onClick={() => void handlePublishNow(post)}
                    >
                      {isPublishing ? (
                        <IconLoader2 className="size-3.5 animate-spin" />
                      ) : (
                        <IconRocket className="size-3.5" />
                      )}
                      <span>Publish Now</span>
                    </Button>

                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => void handleSendToReview(post.id)}
                      title="Move back to Review Inbox to edit"
                    >
                      <IconArrowBackUp className="size-3.5" />
                    </Button>

                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => void handleDelete(post.id)}
                      title="Delete post"
                    >
                      <IconTrash className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ====================================================================
          3. COMPACT MONTHLY CADENCE CALENDAR
          ==================================================================== */}
      <div className="space-y-3 border border-border/70 bg-card/35 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconCalendar className="size-4.5 text-primary" />
            <div>
              <h3 className="text-sm font-bold text-foreground sm:text-base">
                {calendarMonth.toLocaleString(undefined, { month: "long", year: "numeric" })}
              </h3>
              <p className="text-[0.68rem] text-muted-foreground">
                Highlighted borders mark your active Autopilot cadence days.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="icon-xs"
              variant="outline"
              onClick={() => setCalendarMonth(new Date(year, month - 1, 1))}
            >
              <IconChevronLeft className="size-4" />
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                const n = new Date();
                setCalendarMonth(new Date(n.getFullYear(), n.getMonth(), 1));
              }}
            >
              Today
            </Button>
            <Button
              size="icon-xs"
              variant="outline"
              onClick={() => setCalendarMonth(new Date(year, month + 1, 1))}
            >
              <IconChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-border/60 pb-1.5 text-center text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarCells.map((cell, idx) => {
            if (!cell) {
              return <div key={`e-${idx}`} className="min-h-18 bg-background/15" />;
            }

            const dayPosts = posts.filter((p) => {
              if (!p.scheduledFor) return false;
              const dt = new Date(p.scheduledFor);
              const pStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
              return pStr === cell.dateStr;
            });
            const isToday = cell.dateStr === todayStr;
            const isCadenceDay = cadenceDays.includes(cell.weekday);

            return (
              <div
                key={cell.dateStr}
                className={cn(
                  "flex min-h-18 flex-col justify-between border p-1.5",
                  isToday
                    ? "border-primary bg-primary/10"
                    : isCadenceDay
                      ? "border-primary/30 bg-background/60"
                      : "border-border/40 bg-background/30",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-[0.7rem] font-bold",
                      isToday ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {cell.dayNumber}
                  </span>
                  {isCadenceDay && dayPosts.length === 0 ? (
                    <span
                      className="size-1.5 rounded-full bg-primary/40"
                      title="Open cadence slot"
                    />
                  ) : null}
                </div>
                <div className="mt-1 space-y-0.5">
                  {dayPosts.map((p) => (
                    <div
                      key={p.id}
                      title={p.title}
                      className={cn(
                        "truncate border px-1 py-0.5 text-[0.6rem] font-medium",
                        p.status === "posted"
                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                          : p.reviewStatus === "approved"
                            ? "border-primary/45 bg-primary/15 text-foreground"
                            : "border-amber-500/40 bg-amber-500/15 text-amber-200",
                      )}
                    >
                      {p.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ====================================================================
          4. RECENTLY PUBLISHED & WORKER JOBS (2-COLUMN)
          ==================================================================== */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 border border-border/70 bg-card/35 p-4">
          <h3 className="text-sm font-bold text-foreground">
            Recently Published ({publishedPosts.length})
          </h3>
          {publishedPosts.length === 0 ? (
            <p className="text-xs text-muted-foreground">No published posts yet.</p>
          ) : (
            <div className="space-y-2">
              {publishedPosts.map((post) => (
                <div
                  key={post.id}
                  className="flex items-center justify-between gap-2 border border-border/50 bg-background/60 p-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{post.title}</p>
                    <p className="text-[0.68rem] text-muted-foreground">
                      <IconCheck className="mr-1 inline size-3 text-emerald-400" />
                      {formatSlot(post.postedAt || post.scheduledFor)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {PUBLISHABLE_PLATFORMS.map((p) => {
                      const d = post.platformDeliveries?.[p];
                      if (!d?.externalUrl) return null;
                      const meta = PLATFORM_META[p];
                      return (
                        <a
                          key={p}
                          href={d.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(
                            "inline-flex items-center gap-1 border px-1.5 py-0.5 text-[0.64rem] hover:opacity-80",
                            meta.badgeClass,
                          )}
                        >
                          <meta.Icon className="size-3" />
                          <IconExternalLink className="size-2.5" />
                        </a>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 border border-border/70 bg-card/35 p-4">
          <h3 className="text-sm font-bold text-foreground">
            Background Worker Activity ({recentJobs.length})
          </h3>
          {recentJobs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No background jobs yet.</p>
          ) : (
            <div className="space-y-1.5">
              {recentJobs.slice(0, 8).map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between gap-2 border border-border/50 bg-background/60 px-2.5 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      <span className="font-mono text-[0.68rem] text-primary">{job.jobType}</span>{" "}
                      — {job.stageLabel}
                    </p>
                    {job.error ? (
                      <p className="truncate text-[0.66rem] text-rose-300">{job.error}</p>
                    ) : null}
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 text-[0.62rem]",
                      job.status === "succeeded"
                        ? "border-emerald-500/40 text-emerald-300"
                        : job.status === "failed"
                          ? "border-rose-500/40 text-rose-300"
                          : "border-amber-500/40 text-amber-200",
                    )}
                  >
                    {job.status} {job.status === "running" ? `${job.progress}%` : ""}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
