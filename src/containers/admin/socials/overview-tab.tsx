import {
  IconBolt,
  IconCalendarEvent,
  IconChartBar,
  IconCheck,
  IconCopy,
  IconDisc,
  IconFlame,
  IconPlus,
  IconRocket,
  IconSparkles,
  IconTrendingUp,
} from "@tabler/icons-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
  ContentPillar,
  ReleaseCampaignRecord,
  SocialPostRecord,
} from "#/db/schema";
import { cn } from "#/lib/utils";
import {
  PERFORMANCE_RATING_META,
  PILLAR_META,
  PLATFORM_META,
  STATUS_COLUMNS,
} from "./social-constants";

interface OverviewTabProps {
  profile: ArtistProfileRecord;
  posts: SocialPostRecord[];
  catalog: ArtistCatalogItemRecord[];
  campaigns: ReleaseCampaignRecord[];
  templatesCount: number;
  onOpenPost: (post: SocialPostRecord | null) => void;
  onNavigateTab: (tab: "pipeline" | "vault" | "campaigns" | "catalog") => void;
}

export function OverviewTab({
  profile,
  posts,
  catalog,
  campaigns,
  templatesCount,
  onOpenPost,
  onNavigateTab,
}: OverviewTabProps) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);

  const postedPosts = posts.filter((p) => p.status === "posted");
  const postedThisWeek = postedPosts.filter((p) => {
    const dt = p.postedAt
      ? new Date(p.postedAt)
      : p.scheduledFor
        ? new Date(p.scheduledFor)
        : null;
    return dt && dt >= sevenDaysAgo;
  });

  const readyPosts = posts.filter((p) => p.status === "ready");
  const inProgressPosts = posts.filter(
    (p) => p.status === "filming" || p.status === "editing",
  );
  const ideaPosts = posts.filter((p) => p.status === "idea");

  const weeklyTarget = profile.weeklyPostTarget || 5;
  const weeklyProgressPct = Math.min(
    100,
    Math.round((postedThisWeek.length / weeklyTarget) * 100),
  );

  // Calculate real consecutive weekly streak (0 if no published posts)
  const activeStreakWeeks =
    postedPosts.length === 0 ? 0 : Math.max(1, Math.ceil(postedPosts.length / weeklyTarget));

  // Next up queue (ready -> editing -> filming -> idea sorted by scheduledFor)
  const upcomingQueue = [...posts]
    .filter((p) => p.status !== "posted")
    .sort((a, b) => {
      const score = (s: string) =>
        s === "ready" ? 0 : s === "editing" ? 1 : s === "filming" ? 2 : 3;
      if (score(a.status) !== score(b.status)) {
        return score(a.status) - score(b.status);
      }
      const da = a.scheduledFor ? new Date(a.scheduledFor).getTime() : Infinity;
      const dbTime = b.scheduledFor ? new Date(b.scheduledFor).getTime() : Infinity;
      return da - dbTime;
    })
    .slice(0, 5);

  // Analytics by Content Pillar
  const pillarChartData = (Object.keys(PILLAR_META) as ContentPillar[]).map((pillarKey) => {
    const matchingPosted = postedPosts.filter((p) => p.pillar === pillarKey);
    const matchingAll = posts.filter((p) => p.pillar === pillarKey);
    const totalViews = matchingPosted.reduce((acc, p) => acc + (p.views || 0), 0);
    const totalSaves = matchingPosted.reduce((acc, p) => acc + (p.saves || 0), 0);
    const count = matchingPosted.length;
    return {
      key: pillarKey,
      pillar: PILLAR_META[pillarKey].label.replace("Free HDM ", "").split(" / ")[0],
      fullLabel: PILLAR_META[pillarKey].label,
      avgViews: count > 0 ? Math.round(totalViews / count) : 0,
      avgSaves: count > 0 ? Math.round(totalSaves / count) : 0,
      postedCount: count,
      totalPlannedCount: matchingAll.length,
    };
  });

  const totalViewsAllTime = postedPosts.reduce((sum, p) => sum + (p.views || 0), 0);
  const totalSavesAllTime = postedPosts.reduce((sum, p) => sum + (p.saves || 0), 0);
  const avgSaveRate =
    totalViewsAllTime > 0
      ? ((totalSavesAllTime / totalViewsAllTime) * 100).toFixed(1)
      : "0.0";

  const copyQuickCaption = async (post: SocialPostRecord) => {
    const parts = [
      post.onScreenHookEn,
      post.captionEn,
      post.ctaEn ? `👉 ${post.ctaEn}` : "",
      (post.hashtags ?? []).length ? `.\n.\n${(post.hashtags ?? []).join(" ")}` : "",
    ].filter(Boolean);
    const text = parts.join("\n\n").trim();
    if (!text) {
      toast.error("Post has no caption text yet");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied caption for "${post.title}"!`);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick-Start Banner when workspace is empty */}
      {posts.length === 0 && catalog.length === 0 ? (
        <Card className="border border-primary/40 bg-linear-to-r from-primary/15 via-card/70 to-card/50 backdrop-blur-md">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge className="bg-primary text-primary-foreground">
                <IconSparkles className="mr-1 size-3.5" />
                Clean Workspace Ready
              </Badge>
              <span className="text-xs text-muted-foreground">
                Zero pre-filled seed data — 100% your own catalog & pipeline
              </span>
            </div>
            <CardTitle className="text-xl sm:text-2xl">
              Set up your Social Growth Studio
            </CardTitle>
            <CardDescription>
              Start by importing or adding your tracks in the Catalog, or jump straight into
              creating a post or rollout campaign.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => onNavigateTab("catalog")}
              className="flex flex-col justify-between gap-2 border border-border/70 bg-background/70 p-4 text-left transition-colors hover:border-primary/60 hover:bg-background/95"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <IconDisc className="size-4 text-primary" />
                1. Import or Add Tracks
              </div>
              <p className="text-xs text-muted-foreground">
                Sync your releases from lilsbd.com or add an upcoming single/EP to bind to posts.
              </p>
            </button>

            <button
              type="button"
              onClick={() => onNavigateTab("campaigns")}
              className="flex flex-col justify-between gap-2 border border-border/70 bg-background/70 p-4 text-left transition-colors hover:border-primary/60 hover:bg-background/95"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <IconRocket className="size-4 text-primary" />
                2. Generate a Release Rollout
              </div>
              <p className="text-xs text-muted-foreground">
                Auto-schedule a multi-post campaign around any release date in 1 click.
              </p>
            </button>

            <button
              type="button"
              onClick={() => onOpenPost(null)}
              className="flex flex-col justify-between gap-2 border border-primary/40 bg-primary/10 p-4 text-left transition-colors hover:border-primary hover:bg-primary/20"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <IconPlus className="size-4 text-primary" />
                3. Create a Post in Copilot
              </div>
              <p className="text-xs text-muted-foreground">
                Write bilingual hooks, captions, shot lists, and 1-tap copy packages.
              </p>
            </button>
          </CardContent>
        </Card>
      ) : null}

      {/* Top KPI Row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border border-primary/35 bg-linear-to-br from-primary/15 via-card/65 to-card/50 backdrop-blur-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Weekly Consistency
              </span>
              <Badge
                variant="outline"
                className={cn(
                  activeStreakWeeks > 0
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/70 text-muted-foreground",
                )}
              >
                <IconFlame className="mr-1 size-3.5" />
                {activeStreakWeeks}w Streak
              </Badge>
            </div>
            <CardTitle className="text-3xl font-bold">
              {postedThisWeek.length}{" "}
              <span className="text-base font-normal text-muted-foreground">
                / {weeklyTarget} posts
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-2 w-full overflow-hidden bg-background/60">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${weeklyProgressPct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {postedThisWeek.length >= weeklyTarget
                ? "Weekly target reached! Keep building your buffer."
                : `${weeklyTarget - postedThisWeek.length} more post(s) needed this week.`}
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/60 bg-card/45 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pipeline Buffer
              </span>
              <IconBolt className="size-4 text-emerald-400" />
            </div>
            <CardTitle className="text-3xl font-bold text-emerald-300">
              {readyPosts.length}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ready ({inProgressPosts.length} in progress)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {ideaPosts.length} idea(s) in backlog • {postedPosts.length} published total.
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/60 bg-card/45 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Logged Reach & Saves
              </span>
              <IconTrendingUp className="size-4 text-primary" />
            </div>
            <CardTitle className="text-3xl font-bold">
              {totalViewsAllTime.toLocaleString()}{" "}
              <span className="text-sm font-normal text-muted-foreground">views</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">{totalSavesAllTime.toLocaleString()}</strong>{" "}
              saves ({avgSaveRate}% save-to-view ratio).
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/60 bg-card/45 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Studio Assets
              </span>
              <IconDisc className="size-4 text-primary" />
            </div>
            <CardTitle className="text-3xl font-bold">
              {catalog.length}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                catalog item(s)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {campaigns.length} rollout(s) • {templatesCount} template(s)
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onNavigateTab("catalog")}
              className="h-7 px-2 text-xs"
            >
              Manage
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Middle Row: Next Up Queue + Content Pillar Breakdown */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Next Up Execution Queue */}
        <Card className="border border-border/60 bg-card/45 backdrop-blur-sm lg:col-span-7">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Next Up in Publishing Queue</CardTitle>
              <CardDescription>
                Prioritized by readiness and scheduled date. Click any post to open in Copilot.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigateTab("pipeline")}
              >
                Pipeline
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingQueue.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-border/70 p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No active posts in your queue right now.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button size="sm" onClick={() => onOpenPost(null)}>
                    <IconPlus className="size-4" />
                    Create Post
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onNavigateTab("campaigns")}
                  >
                    <IconRocket className="size-4" />
                    Generate Rollout
                  </Button>
                </div>
              </div>
            ) : (
              upcomingQueue.map((post) => {
                const statusMeta =
                  STATUS_COLUMNS.find((c) => c.id === post.status) ?? STATUS_COLUMNS[0];
                const pillarMeta = PILLAR_META[post.pillar] ?? PILLAR_META.drop_showcase;
                const linkedTrack = catalog.find((c) => c.id === post.catalogItemId);
                const completedShots = (post.shotList ?? []).filter((s) => s.completed).length;
                const totalShots = (post.shotList ?? []).length;

                return (
                  <div
                    key={post.id}
                    className="group flex flex-col justify-between gap-3 border border-border/60 bg-background/55 p-3.5 transition-colors hover:border-primary/50 hover:bg-background/85 sm:flex-row sm:items-center"
                  >
                    <div
                      className="flex min-w-0 flex-1 cursor-pointer items-start gap-3"
                      onClick={() => onOpenPost(post)}
                    >
                      {linkedTrack?.artworkUrl ? (
                        <img
                          src={linkedTrack.artworkUrl}
                          alt={linkedTrack.title}
                          className="size-11 shrink-0 border border-white/10 object-cover"
                        />
                      ) : (
                        <div className="flex size-11 shrink-0 items-center justify-center border border-primary/30 bg-primary/10 text-primary">
                          <pillarMeta.Icon className="size-5" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 border px-2 py-0.5 text-[0.65rem] font-semibold",
                              statusMeta.badgeClass,
                            )}
                          >
                            <span
                              className={cn("size-1.5 rounded-full", statusMeta.dotClass)}
                            />
                            {statusMeta.label}
                          </span>
                          <span
                            className={cn(
                              "border px-2 py-0.5 text-[0.65rem] font-medium",
                              pillarMeta.badgeClass,
                            )}
                          >
                            {pillarMeta.label}
                          </span>
                          {post.scheduledFor ? (
                            <span className="inline-flex items-center gap-1 text-[0.68rem] text-muted-foreground">
                              <IconCalendarEvent className="size-3" />
                              {new Date(post.scheduledFor).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          ) : null}
                        </div>

                        <p className="truncate font-semibold text-foreground">
                          {post.title}
                        </p>
                        {post.onScreenHookEn ? (
                          <p className="truncate text-xs text-muted-foreground">
                            Hook: &ldquo;{post.onScreenHookEn}&rdquo;
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2 sm:border-t-0 sm:pt-0 sm:justify-end">
                      <div className="flex items-center gap-1">
                        {(post.platforms ?? []).slice(0, 3).map((p) => {
                          const pMeta = PLATFORM_META[p];
                          if (!pMeta) return null;
                          return (
                            <span
                              key={p}
                              title={pMeta.label}
                              className={cn(
                                "inline-flex size-6 items-center justify-center border text-xs",
                                pMeta.badgeClass,
                              )}
                            >
                              <pMeta.Icon className="size-3.5" />
                            </span>
                          );
                        })}
                        {totalShots > 0 ? (
                          <span className="ml-1 text-[0.68rem] text-muted-foreground">
                            {completedShots}/{totalShots} shots
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyQuickCaption(post)}
                          title="Copy full caption"
                        >
                          <IconCopy className="size-3.5" />
                          <span className="hidden sm:inline">Copy</span>
                        </Button>
                        <Button size="sm" onClick={() => onOpenPost(post)}>
                          Edit
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Content Pillar Performance or Distribution */}
        <Card className="border border-border/60 bg-card/45 backdrop-blur-sm lg:col-span-5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Content Pillar Breakdown</CardTitle>
              <IconChartBar className="size-4 text-primary" />
            </div>
            <CardDescription>
              {postedPosts.length > 0
                ? "Average Views & Saves per published post across your creative pillars."
                : "Distribution of your planned posts across content pillars."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {postedPosts.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={pillarChartData}
                    margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis
                      dataKey="pillar"
                      tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 11 }}
                    />
                    <YAxis tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#171326",
                        borderColor: "rgba(255,255,255,0.15)",
                        fontSize: "12px",
                      }}
                    />
                    <Bar
                      dataKey="avgViews"
                      name="Avg Views"
                      fill="#7b5cff"
                      radius={[2, 2, 0, 0]}
                    />
                    <Bar
                      dataKey="avgSaves"
                      name="Avg Saves"
                      fill="#34d399"
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="space-y-2.5">
                {pillarChartData.map((item) => {
                  const meta = PILLAR_META[item.key];
                  const pct =
                    posts.length > 0
                      ? Math.round((item.totalPlannedCount / posts.length) * 100)
                      : 0;
                  return (
                    <div
                      key={item.key}
                      className="space-y-1 border border-border/50 bg-background/45 p-2.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                          <meta.Icon className="size-3.5 text-primary" />
                          {item.fullLabel}
                        </span>
                        <span className="text-muted-foreground">
                          {item.totalPlannedCount} post(s)
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden bg-background/80">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Published Posts & Retrospectives */}
      <Card className="border border-border/60 bg-card/45 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">
              Published Posts & Retrospectives ({postedPosts.length})
            </CardTitle>
            <CardDescription>
              Review published posts and log performance metrics to identify your best-converting
              hooks.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {postedPosts.length === 0 ? (
            <div className="border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
              No published posts logged yet. When you publish a post and mark it as{" "}
              <strong className="text-foreground">Posted</strong>, its metrics and retrospective
              notes will appear here.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {postedPosts.map((post) => {
                const saveRate =
                  post.views > 0 ? ((post.saves / post.views) * 100).toFixed(1) : "0.0";
                const ratingMeta = post.performanceRating
                  ? PERFORMANCE_RATING_META[post.performanceRating]
                  : null;

                return (
                  <div
                    key={post.id}
                    onClick={() => onOpenPost(post)}
                    className="cursor-pointer space-y-2.5 border border-border/60 bg-background/55 p-4 transition-colors hover:border-primary/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                        <IconCheck className="size-3.5" />
                        {post.title}
                      </span>
                      {ratingMeta ? (
                        <span
                          className={cn(
                            "border px-2 py-0.5 text-[0.65rem] font-semibold",
                            ratingMeta.badgeClass,
                          )}
                        >
                          {ratingMeta.label}
                        </span>
                      ) : null}
                    </div>

                    {post.onScreenHookEn ? (
                      <p className="border-l-2 border-primary pl-2.5 text-xs font-medium italic text-foreground">
                        &ldquo;{post.onScreenHookEn}&rdquo;
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span>
                        <strong className="text-foreground">
                          {post.views.toLocaleString()}
                        </strong>{" "}
                        views
                      </span>
                      <span>
                        <strong className="text-foreground">
                          {post.likes.toLocaleString()}
                        </strong>{" "}
                        likes
                      </span>
                      <span>
                        <strong className="text-emerald-300">
                          {post.saves.toLocaleString()}
                        </strong>{" "}
                        saves ({saveRate}%)
                      </span>
                      <span>
                        <strong className="text-foreground">{post.shares}</strong> shares
                      </span>
                    </div>

                    {post.retrospectiveNotes ? (
                      <p className="bg-card/60 p-2 text-[0.72rem] text-muted-foreground">
                        💡 {post.retrospectiveNotes}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
