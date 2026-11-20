import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  IconArrowRight,
  IconCalendar,
  IconCalendarClock,
  IconCalendarEvent,
  IconChevronLeft,
  IconChevronRight,
  IconFlame,
  IconGripVertical,
  IconLayoutKanban,
  IconLoader2,
  IconPlugConnected,
  IconPlus,
  IconRocket,
  IconVideo,
} from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import type {
  ArtistCatalogItemRecord,
  ArtistProfileRecord,
  PostStatus,
  PublishablePlatform,
  SocialPostRecord,
} from "#/db/schema";
import { cn } from "#/lib/utils";
import { publishPostNowServerFn, updatePostStatusServerFn } from "#/server/socials";
import type { SafeSocialConnection } from "./publishing-copilot-sheet";
import {
  DELIVERY_STATUS_META,
  PILLAR_META,
  PLATFORM_META,
  PUBLISHABLE_PLATFORMS,
  STATUS_COLUMNS,
} from "./social-constants";

interface PipelineTabProps {
  profile: ArtistProfileRecord;
  posts: SocialPostRecord[];
  catalog: ArtistCatalogItemRecord[];
  connections: SafeSocialConnection[];
  onOpenPost: (
    post: SocialPostRecord | null,
    defaultDate?: string,
    defaultStatus?: PostStatus,
  ) => void;
  onNavigateTab: (tab: "templates" | "settings") => void;
  onRefresh: () => Promise<void>;
}

function KanbanCard({
  post,
  catalog,
  onOpenPost,
  onQuickStatusChange,
  onPublishNow,
  isPublishing,
}: {
  post: SocialPostRecord;
  catalog: ArtistCatalogItemRecord[];
  onOpenPost: (post: SocialPostRecord) => void;
  onQuickStatusChange: (postId: string, nextStatus: PostStatus) => void;
  onPublishNow: (post: SocialPostRecord, e: React.MouseEvent) => void;
  isPublishing: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: post.id,
    data: { post },
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
      }
    : undefined;

  const linkedTrack = catalog.find((c) => c.id === post.catalogItemId);
  const currentColIdx = STATUS_COLUMNS.findIndex((c) => c.id === post.status);
  const nextStatus =
    currentColIdx >= 0 && currentColIdx < STATUS_COLUMNS.length - 1
      ? STATUS_COLUMNS[currentColIdx + 1]?.id
      : null;

  const targetPlatforms = (post.platforms ?? []).filter((p) =>
    PUBLISHABLE_PLATFORMS.includes(p as PublishablePlatform),
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onOpenPost(post)}
      className={cn(
        "group relative flex cursor-pointer flex-col gap-2.5 border border-border/70 bg-background/85 p-3.5 shadow-sm transition-all hover:border-primary/60 hover:bg-background",
        isDragging && "z-50 opacity-75 ring-2 ring-primary",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {post.videoUrl ? (
            <span className="inline-flex items-center gap-1 border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 text-[0.62rem] font-semibold text-emerald-200">
              <IconVideo className="size-3" />
              Video
            </span>
          ) : (
            <span className="border border-border/60 bg-card/50 px-1.5 py-0.5 text-[0.62rem] text-muted-foreground">
              No video
            </span>
          )}
          {post.autoPublish && post.status !== "posted" ? (
            <span className="inline-flex items-center gap-1 border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[0.62rem] font-semibold text-amber-200">
              <IconCalendarClock className="size-3" />
              Auto
            </span>
          ) : null}
          {linkedTrack ? (
            <span className="truncate max-w-28 border border-border/60 bg-card/60 px-1.5 py-0.5 text-[0.62rem] font-medium text-muted-foreground">
              {linkedTrack.title}
            </span>
          ) : null}
        </div>

        <button
          type="button"
          {...listeners}
          {...attributes}
          onClick={(e) => e.stopPropagation()}
          className="hidden cursor-grab touch-none p-0.5 text-muted-foreground opacity-60 hover:text-foreground hover:opacity-100 active:cursor-grabbing lg:inline-flex"
          title="Drag to move column"
        >
          <IconGripVertical className="size-4" />
        </button>
      </div>

      <p className="text-sm font-bold leading-snug text-foreground">{post.title}</p>

      {post.onScreenHookEn ? (
        <p className="line-clamp-2 border-l-2 border-primary/60 pl-2 text-xs text-muted-foreground">
          {post.onScreenHookEn}
        </p>
      ) : null}

      {/* Platforms & Scheduled Time */}
      <div className="mt-1 flex items-center justify-between gap-2 border-t border-border/40 pt-2">
        <div className="flex items-center gap-1">
          {targetPlatforms.map((p) => {
            const pMeta = PLATFORM_META[p];
            const delivStatus = post.platformDeliveries?.[p]?.status;
            const dotClass = delivStatus ? DELIVERY_STATUS_META[delivStatus]?.dotClass : null;
            if (!pMeta) return null;
            return (
              <span
                key={p}
                title={`${pMeta.label}${delivStatus ? ` (${DELIVERY_STATUS_META[delivStatus]?.label})` : ""}`}
                className={cn(
                  "relative inline-flex size-5 items-center justify-center border",
                  pMeta.badgeClass,
                )}
              >
                <pMeta.Icon className="size-3" />
                {dotClass ? (
                  <span
                    className={cn(
                      "absolute -right-0.5 -top-0.5 size-1.5 rounded-full",
                      dotClass,
                    )}
                  />
                ) : null}
              </span>
            );
          })}
        </div>

        {post.scheduledFor ? (
          <span className="inline-flex items-center gap-1 text-[0.68rem] text-muted-foreground">
            <IconCalendarEvent className="size-3" />
            {new Date(post.scheduledFor).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        ) : null}
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between gap-1.5 pt-1">
        {post.videoUrl && post.status !== "posted" ? (
          <button
            type="button"
            disabled={isPublishing}
            onClick={(e) => onPublishNow(post, e)}
            className="inline-flex items-center gap-1 border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-[0.68rem] font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/25"
          >
            {isPublishing ? (
              <IconLoader2 className="size-3 animate-spin" />
            ) : (
              <IconRocket className="size-3" />
            )}
            Publish Now
          </button>
        ) : (
          <span className="text-[0.65rem] text-muted-foreground">
            {PILLAR_META[post.pillar]?.label}
          </span>
        )}

        {nextStatus ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onQuickStatusChange(post.id, nextStatus);
            }}
            className="inline-flex items-center gap-1 border border-primary/35 bg-primary/12 px-2 py-1 text-[0.68rem] font-medium text-primary-foreground transition-colors hover:bg-primary/25"
          >
            Advance
            <IconArrowRight className="size-3" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function KanbanColumn({
  column,
  posts,
  catalog,
  onOpenPost,
  onQuickStatusChange,
  onPublishNow,
  publishingPostId,
}: {
  column: (typeof STATUS_COLUMNS)[number];
  posts: SocialPostRecord[];
  catalog: ArtistCatalogItemRecord[];
  onOpenPost: (
    post: SocialPostRecord | null,
    defaultDate?: string,
    defaultStatus?: PostStatus,
  ) => void;
  onQuickStatusChange: (postId: string, nextStatus: PostStatus) => void;
  onPublishNow: (post: SocialPostRecord, e: React.MouseEvent) => void;
  publishingPostId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[360px] flex-col border border-border/60 bg-card/35 p-3 backdrop-blur-sm transition-colors",
        isOver && "border-primary bg-primary/10",
      )}
    >
      <div className="mb-3 flex items-center justify-between border-b border-border/60 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("size-2 shrink-0 rounded-full", column.dotClass)} />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold">{column.label}</h3>
            <p className="truncate text-[0.68rem] text-muted-foreground">
              {column.description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="text-[0.68rem]">
            {posts.length}
          </Badge>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => onOpenPost(null, undefined, column.id)}
            title={`New post in ${column.label}`}
          >
            <IconPlus className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2.5">
        {posts.length === 0 ? (
          <div className="flex flex-1 items-center justify-center border border-dashed border-border/50 p-4 text-center text-xs text-muted-foreground">
            Drop posts here
          </div>
        ) : (
          posts.map((post) => (
            <KanbanCard
              key={post.id}
              post={post}
              catalog={catalog}
              onOpenPost={onOpenPost}
              onQuickStatusChange={onQuickStatusChange}
              onPublishNow={onPublishNow}
              isPublishing={publishingPostId === post.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function PipelineTab({
  profile,
  posts,
  catalog,
  connections,
  onOpenPost,
  onNavigateTab,
  onRefresh,
}: PipelineTabProps) {
  const [viewMode, setViewMode] = useState<"queue" | "kanban">("queue");
  const [publishingPostId, setPublishingPostId] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  // Weekly stats
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const postedThisWeek = posts.filter((p) => {
    if (p.status !== "posted") return false;
    const dt = p.postedAt
      ? new Date(p.postedAt)
      : p.scheduledFor
        ? new Date(p.scheduledFor)
        : null;
    return dt && dt >= sevenDaysAgo;
  });

  const scheduledAutoPosts = [...posts]
    .filter((p) => p.status !== "posted" && (p.autoPublish || p.status === "ready"))
    .sort((a, b) => {
      const da = a.scheduledFor ? new Date(a.scheduledFor).getTime() : Infinity;
      const dbTime = b.scheduledFor ? new Date(b.scheduledFor).getTime() : Infinity;
      return da - dbTime;
    });

  const handlePublishNow = async (post: SocialPostRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!post.videoUrl) {
      toast.error("Open the post and upload a video (.mp4) first.");
      onOpenPost(post);
      return;
    }

    setPublishingPostId(post.id);
    try {
      const res = await publishPostNowServerFn({ data: { postId: post.id } });
      await onRefresh();
      if (res.allSucceeded) {
        toast.success(`Published "${post.title}" to all selected platforms!`);
      } else if (res.anySucceeded) {
        toast.success(`Published "${post.title}" to connected platforms.`);
      } else {
        const firstErr = Object.values(res.deliveries).find((d) => d?.error)?.error;
        toast.error(firstErr || "Publishing failed — open post to inspect details.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publishing failed");
    } finally {
      setPublishingPostId(null);
    }
  };

  const handleQuickStatusChange = async (postId: string, nextStatus: PostStatus) => {
    try {
      await updatePostStatusServerFn({ data: { id: postId, status: nextStatus } });
      await onRefresh();
      toast.success(`Moved to ${nextStatus}`);
    } catch {
      toast.error("Could not update post status");
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const postId = String(active.id);
    const targetStatus = String(over.id) as PostStatus;
    const post = posts.find((p) => p.id === postId);
    if (!post || post.status === targetStatus) return;
    await handleQuickStatusChange(postId, targetStatus);
  };

  // Calendar grid computation
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calendarCells: Array<{ dateStr: string; dayNumber: number } | null> = [];
  for (let i = 0; i < firstDayOfWeek; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const pad = (n: number) => String(n).padStart(2, "0");
    calendarCells.push({
      dateStr: `${year}-${pad(month + 1)}-${pad(d)}`,
      dayNumber: d,
    });
  }

  const todayStr = (() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  })();

  return (
    <div className="space-y-6">
      {/* Compact Studio KPI & Mode Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border border-border/70 bg-card/45 p-3.5 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center border border-primary/40 bg-primary/15 text-primary">
              <IconFlame className="size-4.5" />
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Weekly Output
              </p>
              <p className="text-sm font-bold text-foreground">
                {postedThisWeek.length} / {profile.weeklyPostTarget || 5} posted
              </p>
            </div>
          </div>

          <div className="h-7 w-px bg-border/60" />

          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center border border-amber-500/40 bg-amber-500/15 text-amber-300">
              <IconCalendarClock className="size-4.5" />
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Pre-Programmed Queue
              </p>
              <p className="text-sm font-bold text-foreground">
                {scheduledAutoPosts.length} ready to publish
              </p>
            </div>
          </div>

          <div className="h-7 w-px bg-border/60" />

          <button
            type="button"
            onClick={() => onNavigateTab("settings")}
            className="flex items-center gap-2.5 text-left transition-opacity hover:opacity-85"
          >
            <div className="flex size-9 items-center justify-center border border-emerald-500/40 bg-emerald-500/15 text-emerald-300">
              <IconPlugConnected className="size-4.5" />
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Connected Platforms
              </p>
              <p className="text-sm font-bold text-foreground">
                {connections.length} / 3 linked →
              </p>
            </div>
          </button>
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-2">
          <div className="inline-flex border border-border/70 bg-background/80 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("queue")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold transition-colors",
                viewMode === "queue"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <IconCalendar className="size-3.5" />
              Queue & Calendar
            </button>
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold transition-colors",
                viewMode === "kanban"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <IconLayoutKanban className="size-3.5" />
              Kanban Board
            </button>
          </div>

          <Button size="sm" onClick={() => onOpenPost(null, undefined, "ready")}>
            <IconPlus className="size-4" />
            Schedule Post
          </Button>
        </div>
      </div>

      {/* ====================================================================
          VIEW 1: PRE-PROGRAMMED QUEUE + INTERACTIVE CALENDAR
          ==================================================================== */}
      {viewMode === "queue" ? (
        <div className="space-y-6">
          {/* Pre-Programmed Auto-Publish Queue */}
          <div className="space-y-3 border border-border/70 bg-card/35 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-foreground">
                  Pre-Programmed Publishing Queue
                </h2>
                <p className="text-xs text-muted-foreground">
                  Posts with Auto-Publish enabled fire automatically at their scheduled time, or click Publish Now.
                </p>
              </div>
              <Button
                size="xs"
                variant="outline"
                onClick={() => onNavigateTab("templates")}
              >
                Use Template / Rollout →
              </Button>
            </div>

            {scheduledAutoPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-border/60 bg-background/40 py-8 text-center">
                <p className="text-sm font-semibold text-foreground">
                  No posts pre-programmed yet
                </p>
                <p className="max-w-md text-xs text-muted-foreground">
                  Click &ldquo;Schedule Post&rdquo; to upload a video, write your caption once, and pre-program IG Reels, TikTok, and YouTube Shorts.
                </p>
                <Button
                  size="sm"
                  className="mt-1"
                  onClick={() => onOpenPost(null, undefined, "ready")}
                >
                  <IconPlus className="size-4" />
                  Schedule Your First Post
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border/60 border border-border/70 bg-background/75">
                {scheduledAutoPosts.map((post) => {
                  const targetPlatforms = (post.platforms ?? []).filter((p) =>
                    PUBLISHABLE_PLATFORMS.includes(p as PublishablePlatform),
                  );
                  const isPublishing = publishingPostId === post.id;

                  return (
                    <div
                      key={post.id}
                      onClick={() => onOpenPost(post)}
                      className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-3.5 transition-colors hover:bg-card/60"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "flex size-10 shrink-0 items-center justify-center border",
                            post.videoUrl
                              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                              : "border-border/60 bg-card text-muted-foreground",
                          )}
                        >
                          <IconVideo className="size-5" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-bold text-foreground">
                              {post.title}
                            </span>
                            {post.autoPublish ? (
                              <Badge className="border-amber-500/40 bg-amber-500/15 text-[0.62rem] text-amber-200">
                                Auto-Scheduled
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[0.62rem]">
                                Ready
                              </Badge>
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {post.scheduledFor
                              ? new Date(post.scheduledFor).toLocaleString(undefined, {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "No date set"}{" "}
                            {post.onScreenHookEn ? `• "${post.onScreenHookEn}"` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          {targetPlatforms.map((p) => {
                            const pMeta = PLATFORM_META[p];
                            const deliv = post.platformDeliveries?.[p];
                            const stMeta = deliv
                              ? DELIVERY_STATUS_META[deliv.status]
                              : null;
                            return (
                              <span
                                key={p}
                                className={cn(
                                  "inline-flex items-center gap-1 border px-2 py-0.5 text-[0.65rem] font-medium",
                                  pMeta.badgeClass,
                                )}
                              >
                                <pMeta.Icon className="size-3" />
                                <span className="hidden sm:inline">{pMeta.shortLabel}</span>
                                {stMeta ? (
                                  <span
                                    className={cn(
                                      "size-1.5 rounded-full",
                                      stMeta.dotClass,
                                    )}
                                  />
                                ) : null}
                              </span>
                            );
                          })}
                        </div>

                        <Button
                          size="xs"
                          disabled={isPublishing}
                          onClick={(e) => handlePublishNow(post, e)}
                        >
                          {isPublishing ? (
                            <IconLoader2 className="size-3.5 animate-spin" />
                          ) : (
                            <IconRocket className="size-3.5" />
                          )}
                          <span>Publish Now</span>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Monthly Schedule Calendar */}
          <div className="space-y-3 border border-border/70 bg-card/35 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {calendarMonth.toLocaleString(undefined, {
                    month: "long",
                    year: "numeric",
                  })}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Click any date to pre-program a post for that day.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="icon-xs"
                  variant="outline"
                  onClick={() =>
                    setCalendarMonth(new Date(year, month - 1, 1))
                  }
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
                  onClick={() =>
                    setCalendarMonth(new Date(year, month + 1, 1))
                  }
                >
                  <IconChevronRight className="size-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-border/60 pb-2 text-center text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {calendarCells.map((cell, idx) => {
                if (!cell) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="min-h-24 border border-transparent bg-background/20"
                    />
                  );
                }

                const dayPosts = posts.filter((p) => {
                  if (!p.scheduledFor) return false;
                  const dt = new Date(p.scheduledFor);
                  const pad = (n: number) => String(n).padStart(2, "0");
                  const pStr = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
                  return pStr === cell.dateStr;
                });

                const isToday = cell.dateStr === todayStr;

                return (
                  <div
                    key={cell.dateStr}
                    onClick={() => onOpenPost(null, cell.dateStr, "ready")}
                    className={cn(
                      "group flex min-h-24 cursor-pointer flex-col justify-between border p-2 transition-colors hover:border-primary/60 hover:bg-background/90",
                      isToday
                        ? "border-primary/70 bg-primary/8"
                        : "border-border/50 bg-background/55",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-xs font-bold",
                          isToday ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {cell.dayNumber}
                      </span>
                      <IconPlus className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>

                    <div className="mt-1 space-y-1">
                      {dayPosts.map((p) => (
                        <div
                          key={p.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenPost(p);
                          }}
                          className={cn(
                            "truncate border px-1.5 py-0.5 text-[0.65rem] font-medium transition-colors",
                            p.status === "posted"
                              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                              : p.autoPublish
                                ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
                                : "border-primary/40 bg-primary/15 text-foreground",
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
        </div>
      ) : (
        /* ====================================================================
           VIEW 2: KANBAN PIPELINE BOARD
           ==================================================================== */
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid gap-3.5 md:grid-cols-3 xl:grid-cols-5">
            {STATUS_COLUMNS.map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                posts={posts.filter((p) => p.status === col.id)}
                catalog={catalog}
                onOpenPost={onOpenPost}
                onQuickStatusChange={handleQuickStatusChange}
                onPublishNow={handlePublishNow}
                publishingPostId={publishingPostId}
              />
            ))}
          </div>
        </DndContext>
      )}
    </div>
  );
}
