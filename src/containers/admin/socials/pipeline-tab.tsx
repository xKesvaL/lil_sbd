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
  IconCalendarEvent,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconGripVertical,
  IconLayoutKanban,
  IconPlus,
} from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import type {
  ArtistCatalogItemRecord,
  ContentPillar,
  PostStatus,
  SocialPlatform,
  SocialPostRecord,
} from "#/db/schema";
import { cn } from "#/lib/utils";
import { updatePostStatusServerFn } from "#/server/socials";
import { PILLAR_META, PLATFORM_META, STATUS_COLUMNS } from "./social-constants";

interface PipelineTabProps {
  posts: SocialPostRecord[];
  catalog: ArtistCatalogItemRecord[];
  onOpenPost: (post: SocialPostRecord | null, defaultDate?: string) => void;
  onRefresh: () => Promise<void>;
}

function KanbanCard({
  post,
  catalog,
  onOpenPost,
  onQuickStatusChange,
}: {
  post: SocialPostRecord;
  catalog: ArtistCatalogItemRecord[];
  onOpenPost: (post: SocialPostRecord) => void;
  onQuickStatusChange: (postId: string, nextStatus: PostStatus) => void;
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

  const pillarMeta = PILLAR_META[post.pillar] ?? PILLAR_META.drop_showcase;
  const linkedTrack = catalog.find((c) => c.id === post.catalogItemId);
  const completedShots = (post.shotList ?? []).filter((s) => s.completed).length;
  const totalShots = (post.shotList ?? []).length;

  const currentColIdx = STATUS_COLUMNS.findIndex((c) => c.id === post.status);
  const nextStatus =
    currentColIdx >= 0 && currentColIdx < STATUS_COLUMNS.length - 1
      ? STATUS_COLUMNS[currentColIdx + 1]?.id
      : null;

  const copyQuick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = `${post.onScreenHookEn}\n\n${post.captionEn}\n\n👉 ${post.ctaEn}\n.\n.\n${(post.hashtags ?? []).join(" ")}`.trim();
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied full caption + tags!");
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onOpenPost(post)}
      className={cn(
        "group relative flex cursor-pointer flex-col gap-2.5 border border-border/70 bg-background/75 p-3.5 shadow-sm transition-all hover:border-primary/60 hover:bg-background/95",
        isDragging && "z-50 opacity-75 ring-2 ring-primary",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "border px-1.5 py-0.5 text-[0.62rem] font-semibold",
              pillarMeta.badgeClass,
            )}
          >
            {pillarMeta.label}
          </span>
          {linkedTrack ? (
            <span className="border border-border/60 bg-card/60 px-1.5 py-0.5 text-[0.62rem] font-medium text-muted-foreground">
              🎵 {linkedTrack.title}
            </span>
          ) : null}
        </div>

        <button
          type="button"
          {...listeners}
          {...attributes}
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab touch-none p-0.5 text-muted-foreground opacity-60 hover:text-foreground hover:opacity-100 active:cursor-grabbing"
          title="Drag to move column"
        >
          <IconGripVertical className="size-4" />
        </button>
      </div>

      <p className="text-sm font-bold leading-snug text-foreground">{post.title}</p>

      {post.onScreenHookEn ? (
        <p className="line-clamp-2 border-l-2 border-primary/60 pl-2 text-xs text-muted-foreground">
          &ldquo;{post.onScreenHookEn}&rdquo;
        </p>
      ) : null}

      {/* Platforms & Shots Progress */}
      <div className="mt-1 flex items-center justify-between gap-2 pt-1 border-t border-border/40">
        <div className="flex items-center gap-1">
          {(post.platforms ?? []).map((p) => {
            const pMeta = PLATFORM_META[p];
            if (!pMeta) return null;
            return (
              <span
                key={p}
                title={pMeta.label}
                className={cn(
                  "inline-flex size-5 items-center justify-center border",
                  pMeta.badgeClass,
                )}
              >
                <pMeta.Icon className="size-3" />
              </span>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
          {post.scheduledFor ? (
            <span className="inline-flex items-center gap-0.5">
              <IconCalendarEvent className="size-3" />
              {new Date(post.scheduledFor).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          ) : null}
          {totalShots > 0 ? (
            <span>
              • {completedShots}/{totalShots} shots
            </span>
          ) : null}
        </div>
      </div>

      {/* Quick Action Footer */}
      <div className="flex items-center justify-between gap-1.5 pt-1">
        <button
          type="button"
          onClick={copyQuick}
          className="inline-flex items-center gap-1 border border-border/60 bg-card/50 px-2 py-1 text-[0.68rem] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <IconCopy className="size-3" />
          Copy Caption
        </button>

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
}: {
  column: (typeof STATUS_COLUMNS)[number];
  posts: SocialPostRecord[];
  catalog: ArtistCatalogItemRecord[];
  onOpenPost: (post: SocialPostRecord | null) => void;
  onQuickStatusChange: (postId: string, nextStatus: PostStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[520px] flex-col border border-border/60 bg-card/35 p-3 backdrop-blur-sm transition-colors",
        isOver && "border-primary bg-primary/10",
      )}
    >
      <div className="mb-3 flex items-center justify-between border-b border-border/60 pb-2.5">
        <div className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", column.dotClass)} />
          <div>
            <h3 className="text-sm font-bold">{column.label}</h3>
            <p className="text-[0.68rem] text-muted-foreground">{column.description}</p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          {posts.length}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-2.5">
        {posts.map((post) => (
          <KanbanCard
            key={post.id}
            post={post}
            catalog={catalog}
            onOpenPost={onOpenPost}
            onQuickStatusChange={onQuickStatusChange}
          />
        ))}

        {posts.length === 0 ? (
          <div className="flex flex-1 items-center justify-center border border-dashed border-border/50 p-4 text-center text-xs text-muted-foreground/70">
            Drop post here
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PipelineTab({
  posts,
  catalog,
  onOpenPost,
  onRefresh,
}: PipelineTabProps) {
  const [viewMode, setViewMode] = useState<"kanban" | "calendar">("kanban");
  const [platformFilter, setPlatformFilter] = useState<SocialPlatform | "all">("all");
  const [pillarFilter, setPillarFilter] = useState<ContentPillar | "all">("all");
  const [trackFilter, setTrackFilter] = useState<string>("all");

  // Calendar month navigation
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );

  const filteredPosts = posts.filter((post) => {
    if (platformFilter !== "all" && !(post.platforms ?? []).includes(platformFilter)) {
      return false;
    }
    if (pillarFilter !== "all" && post.pillar !== pillarFilter) {
      return false;
    }
    if (trackFilter !== "all" && post.catalogItemId !== trackFilter) {
      return false;
    }
    return true;
  });

  const handleStatusChange = async (postId: string, nextStatus: PostStatus) => {
    try {
      await updatePostStatusServerFn({
        data: { id: postId, status: nextStatus },
      });
      await onRefresh();
      toast.success(
        `Moved to ${STATUS_COLUMNS.find((c) => c.id === nextStatus)?.label ?? nextStatus}`,
      );
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const postId = String(active.id);
    const targetStatus = String(over.id) as PostStatus;

    const currentPost = posts.find((p) => p.id === postId);
    if (!currentPost || currentPost.status === targetStatus) return;

    await handleStatusChange(postId, targetStatus);
  };

  // Build Calendar Days Grid
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingEmptyDays = (firstDayOfWeek + 6) % 7; // Monday-first calendar

  const calendarCells: Array<{ date: Date | null; dateStr: string }> = [];
  for (let i = 0; i < leadingEmptyDays; i++) {
    calendarCells.push({ date: null, dateStr: `empty-${i}` });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    calendarCells.push({ date: d, dateStr: `${yyyy}-${mm}-${dd}` });
  }

  return (
    <div className="space-y-5">
      {/* Top Filter & View Switcher Bar */}
      <div className="flex flex-col justify-between gap-3 border border-border/60 bg-card/45 p-4 backdrop-blur-sm lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex border border-border/70 bg-background/70 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors",
                viewMode === "kanban"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <IconLayoutKanban className="size-4" />
              Kanban Pipeline
            </button>
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors",
                viewMode === "calendar"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <IconCalendar className="size-4" />
              Content Calendar
            </button>
          </div>

          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value as SocialPlatform | "all")}
            className="border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs text-foreground"
          >
            <option value="all">All Platforms</option>
            {Object.entries(PLATFORM_META).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.label}
              </option>
            ))}
          </select>

          <select
            value={pillarFilter}
            onChange={(e) => setPillarFilter(e.target.value as ContentPillar | "all")}
            className="border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs text-foreground"
          >
            <option value="all">All Content Pillars</option>
            {Object.entries(PILLAR_META).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.label}
              </option>
            ))}
          </select>

          <select
            value={trackFilter}
            onChange={(e) => setTrackFilter(e.target.value)}
            className="border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs text-foreground"
          >
            <option value="all">All Tracks & Course Assets</option>
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        <Button onClick={() => onOpenPost(null)}>
          <IconPlus className="size-4" />
          New Post
        </Button>
      </div>

      {/* VIEW 1: KANBAN PIPELINE */}
      {viewMode === "kanban" ? (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {STATUS_COLUMNS.map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                posts={filteredPosts.filter((p) => p.status === col.id)}
                catalog={catalog}
                onOpenPost={onOpenPost}
                onQuickStatusChange={handleStatusChange}
              />
            ))}
          </div>
        </DndContext>
      ) : (
        /* VIEW 2: CONTENT CALENDAR */
        <div className="border border-border/60 bg-card/40 p-4 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">
                {calendarMonth.toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </h3>
              <p className="text-xs text-muted-foreground">
                Click any post to open the Publishing Copilot, or click + on any day to schedule.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="icon-sm"
                variant="outline"
                onClick={() => setCalendarMonth(new Date(year, month - 1, 1))}
              >
                <IconChevronLeft className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const now = new Date();
                  setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                }}
              >
                Today
              </Button>
              <Button
                size="icon-sm"
                variant="outline"
                onClick={() => setCalendarMonth(new Date(year, month + 1, 1))}
              >
                <IconChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px border border-border/60 bg-border/60 text-xs">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((dayName) => (
              <div
                key={dayName}
                className="bg-background/90 px-2 py-2 text-center font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {dayName}
              </div>
            ))}

            {calendarCells.map((cell) => {
              if (!cell.date) {
                return (
                  <div
                    key={cell.dateStr}
                    className="min-h-28 bg-background/30 p-2 opacity-40"
                  />
                );
              }

              const dayPosts = filteredPosts.filter((p) => {
                if (!p.scheduledFor) return false;
                const d = new Date(p.scheduledFor);
                return (
                  d.getFullYear() === cell.date!.getFullYear() &&
                  d.getMonth() === cell.date!.getMonth() &&
                  d.getDate() === cell.date!.getDate()
                );
              });

              const dayReleases = catalog.filter((c) => {
                const d = new Date(c.releaseDate);
                return (
                  d.getFullYear() === cell.date!.getFullYear() &&
                  d.getMonth() === cell.date!.getMonth() &&
                  d.getDate() === cell.date!.getDate()
                );
              });

              const isToday =
                new Date().toDateString() === cell.date.toDateString();

              return (
                <div
                  key={cell.dateStr}
                  className={cn(
                    "group flex min-h-32 flex-col gap-1.5 bg-background/75 p-2 transition-colors hover:bg-background/95",
                    isToday && "ring-1 ring-inset ring-primary bg-primary/8",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "inline-flex size-6 items-center justify-center text-xs font-bold",
                        isToday
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {cell.date.getDate()}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenPost(null, cell.dateStr)}
                      className="opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                      title={`Schedule post on ${cell.dateStr}`}
                    >
                      <IconPlus className="size-3.5" />
                    </button>
                  </div>

                  {/* Release Milestones */}
                  {dayReleases.map((rel) => (
                    <div
                      key={rel.id}
                      className="border border-pink-500/50 bg-pink-500/20 px-1.5 py-0.5 text-[0.65rem] font-bold text-pink-200 truncate"
                    >
                      💿 RELEASE: {rel.title}
                    </div>
                  ))}

                  {/* Scheduled Posts */}
                  {dayPosts.map((post) => {
                    const colMeta =
                      STATUS_COLUMNS.find((c) => c.id === post.status) ??
                      STATUS_COLUMNS[0];
                    return (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => onOpenPost(post)}
                        className={cn(
                          "w-full text-left border px-1.5 py-1 text-[0.68rem] font-medium truncate transition-transform hover:-translate-y-0.5",
                          colMeta.badgeClass,
                        )}
                      >
                        <span
                          className={cn(
                            "mr-1 inline-block size-1.5 rounded-full",
                            colMeta.dotClass,
                          )}
                        />
                        {post.title}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
