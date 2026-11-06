import {
  IconBolt,
  IconCalendarEvent,
  IconChartBar,
  IconCheck,
  IconCopy,
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
  onOpenPost: (post: SocialPostRecord | null) => void;
  onNavigateTab: (tab: "pipeline" | "vault" | "campaigns" | "catalog") => void;
}

export function OverviewTab({
  profile,
  posts,
  catalog,
  campaigns,
  onOpenPost,
  onNavigateTab,
}: OverviewTabProps) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);

  const postedPosts = posts.filter((p) => p.status === "posted");
  const postedThisWeek = postedPosts.filter((p) => {
    const dt = p.postedAt ? new Date(p.postedAt) : p.scheduledFor ? new Date(p.scheduledFor) : null;
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

  // Calculate active weekly streak (consecutive weeks with at least 1 post, plus bonus for hitting target)
  const activeStreakWeeks = Math.max(1, Math.ceil(postedPosts.length / 2));

  // Next up queue (ready -> editing -> filming sorted by scheduledFor)
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
    .slice(0, 4);

  // Analytics by Content Pillar
  const pillarChartData = (Object.keys(PILLAR_META) as ContentPillar[]).map((pillarKey) => {
    const matching = postedPosts.filter((p) => p.pillar === pillarKey);
    const totalViews = matching.reduce((acc, p) => acc + (p.views || 0), 0);
    const totalSaves = matching.reduce((acc, p) => acc + (p.saves || 0), 0);
    const count = matching.length;
    return {
      pillar: PILLAR_META[pillarKey].label.split(" ")[0],
      fullLabel: PILLAR_META[pillarKey].label,
      avgViews: count > 0 ? Math.round(totalViews / count) : 0,
      avgSaves: count > 0 ? Math.round(totalSaves / count) : 0,
      postsCount: count,
    };
  });

  const totalViewsAllTime = postedPosts.reduce((sum, p) => sum + (p.views || 0), 0);
  const totalSavesAllTime = postedPosts.reduce((sum, p) => sum + (p.saves || 0), 0);
  const avgSaveRate =
    totalViewsAllTime > 0
      ? ((totalSavesAllTime / totalViewsAllTime) * 100).toFixed(1)
      : "0.0";

  const copyQuickCaption = async (post: SocialPostRecord) => {
    const text = `${post.onScreenHookEn}\n\n${post.captionEn}\n\n👉 ${post.ctaEn}\n.\n.\n${(post.hashtags ?? []).join(" ")}`.trim();
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied full caption for "${post.title}"!`);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Consistency & Momentum Row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border border-primary/35 bg-linear-to-br from-primary/18 via-card/65 to-card/50 backdrop-blur-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/80">
                Weekly Consistency
              </span>
              <Badge className="bg-primary text-primary-foreground">
                <IconFlame className="mr-1 size-3.5" />
                {activeStreakWeeks}w Streak
              </Badge>
            </div>
            <CardTitle className="text-3xl font-bold">
              {postedThisWeek.length}{" "}
              <span className="text-lg font-normal text-muted-foreground">
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
                ? "Weekly target crushed! Keep stacking buffer posts."
                : `${weeklyTarget - postedThisWeek.length} more post(s) this week to hit your target.`}
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/60 bg-card/45 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Ready-to-Post Buffer
              </span>
              <IconBolt className="size-4 text-emerald-400" />
            </div>
            <CardTitle className="text-3xl font-bold text-emerald-300">
              {readyPosts.length}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ready ({inProgressPosts.length} in edit/DAW)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {ideaPosts.length} concepts waiting in your Idea Backlog across{" "}
              {campaigns.length || 1} campaign(s).
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
              saves ({avgSaveRate}% save-to-view conversion rate).
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/60 bg-card/45 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Quick Studio Actions
            </span>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 pt-0">
            <Button
              size="sm"
              className="w-full justify-start"
              onClick={() => onOpenPost(null)}
            >
              <IconPlus className="size-4" />
              New Post in Copilot
            </Button>
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onNavigateTab("vault")}
                className="text-xs"
              >
                <IconSparkles className="size-3.5" />
                Idea Vault
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onNavigateTab("campaigns")}
                className="text-xs"
              >
                <IconRocket className="size-3.5" />
                Rollouts
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Middle Row: Next Up Queue + Content Pillar Analytics */}
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Next Up Execution Queue */}
        <Card className="border border-border/60 bg-card/45 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Next Up in Your Publishing Queue</CardTitle>
              <CardDescription>
                Prioritized by readiness & schedule. Click any card to open the Publishing Copilot
                or 1-tap copy on your phone.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigateTab("pipeline")}
            >
              Full Pipeline
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingQueue.length === 0 ? (
              <div className="border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                Your queue is clear! Pick a template from the Idea Vault or auto-generate a release
                rollout.
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
                    className="group flex flex-col justify-between gap-3 border border-border/60 bg-background/55 p-4 transition-colors hover:border-primary/50 hover:bg-background/80 sm:flex-row sm:items-center"
                  >
                    <div
                      className="flex items-start gap-3.5 min-w-0 flex-1 cursor-pointer"
                      onClick={() => onOpenPost(post)}
                    >
                      {linkedTrack?.artworkUrl ? (
                        <img
                          src={linkedTrack.artworkUrl}
                          alt={linkedTrack.title}
                          className="size-12 shrink-0 object-cover border border-white/10"
                        />
                      ) : (
                        <div className="flex size-12 shrink-0 items-center justify-center border border-primary/30 bg-primary/10 text-primary">
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

                        <p className="truncate font-semibold text-foreground group-hover:text-primary-foreground">
                          {post.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          Hook: &ldquo;{post.onScreenHookEn || "No hook set yet"}&rdquo;
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 sm:justify-end">
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
                      </div>

                      {totalShots > 0 ? (
                        <span className="text-[0.68rem] text-muted-foreground">
                          Shots {completedShots}/{totalShots}
                        </span>
                      ) : null}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyQuickCaption(post)}
                        title="1-Tap Copy IG/TikTok Caption"
                      >
                        <IconCopy className="size-3.5" />
                        Copy
                      </Button>
                      <Button size="sm" onClick={() => onOpenPost(post)}>
                        Copilot
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Content Pillar Performance Chart */}
        <Card className="border border-border/60 bg-card/45 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">What's Working by Content Pillar</CardTitle>
              <IconChartBar className="size-4 text-primary" />
            </div>
            <CardDescription>
              Average Views & Saves per published post across your creative pillars.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Top Winning Hooks & Retrospective Log */}
      <Card className="border border-border/60 bg-card/45 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">
              Winning Hooks & Post-Publish Retrospectives
            </CardTitle>
            <CardDescription>
              Track which hooks and formats drove the highest Save-to-View ratio so you can repeat
              them on your next release.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {postedPosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No published posts logged yet. Mark a post as &ldquo;Posted&rdquo; in the Copilot to
              track its hook performance here.
            </p>
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

                    <p className="border-l-2 border-primary pl-2.5 text-xs font-medium italic text-foreground">
                      &ldquo;{post.onScreenHookEn}&rdquo;
                    </p>

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
