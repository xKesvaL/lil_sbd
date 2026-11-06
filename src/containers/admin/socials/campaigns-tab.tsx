import {
  IconCalendarEvent,
  IconCheck,
  IconRocket,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";
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
  CampaignType,
  ReleaseCampaignRecord,
  SocialPostRecord,
} from "#/db/schema";
import { CAMPAIGN_ROLLOUT_BLUEPRINTS } from "#/lib/social-blueprints";
import { cn } from "#/lib/utils";
import {
  deleteCampaignServerFn,
  generateReleaseCampaignServerFn,
} from "#/server/socials";
import { PILLAR_META, PLATFORM_META, STATUS_COLUMNS } from "./social-constants";

interface CampaignsTabProps {
  campaigns: ReleaseCampaignRecord[];
  catalog: ArtistCatalogItemRecord[];
  posts: SocialPostRecord[];
  onOpenPost: (post: SocialPostRecord) => void;
  onRefresh: () => Promise<void>;
}

export function CampaignsTab({
  campaigns,
  catalog,
  posts,
  onOpenPost,
  onRefresh,
}: CampaignsTabProps) {
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>(
    catalog[0]?.id ?? "",
  );
  const [campaignType, setCampaignType] = useState<CampaignType>("single_release");
  const [customTitle, setCustomTitle] = useState("");
  const [releaseDate, setReleaseDate] = useState(() => {
    const first = catalog[0]?.releaseDate
      ? new Date(catalog[0].releaseDate)
      : new Date();
    return first.toISOString().slice(0, 10);
  });
  const [isGenerating, setIsGenerating] = useState(false);

  const selectedCatalogItem =
    catalog.find((c) => c.id === selectedCatalogId) ?? catalog[0];
  const activeBlueprint = CAMPAIGN_ROLLOUT_BLUEPRINTS[campaignType];

  const handleCatalogChange = (id: string) => {
    setSelectedCatalogId(id);
    const item = catalog.find((c) => c.id === id);
    if (item) {
      if (item.type === "course_lesson") {
        setCampaignType("course_promo");
      } else {
        setCampaignType("single_release");
      }
      if (item.releaseDate) {
        setReleaseDate(new Date(item.releaseDate).toISOString().slice(0, 10));
      }
    }
  };

  const handleGenerateCampaign = async () => {
    setIsGenerating(true);
    try {
      const titleToUse =
        customTitle.trim() ||
        `${selectedCatalogItem?.title ?? "Release"} — ${activeBlueprint.label.split("(")[0].trim()}`;

      const res = await generateReleaseCampaignServerFn({
        data: {
          catalogItemId: selectedCatalogItem?.id ?? null,
          campaignType,
          title: titleToUse,
          releaseDate,
        },
      });
      await onRefresh();
      setCustomTitle("");
      toast.success(
        `Generated ${res.generatedPostsCount} scheduled posts for "${titleToUse}"!`,
      );
    } catch {
      toast.error("Failed to generate campaign");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteCampaign = async (id: string, deletePosts: boolean) => {
    try {
      await deleteCampaignServerFn({ data: { id, deletePosts } });
      await onRefresh();
      toast.success(
        deletePosts
          ? "Deleted campaign and its scheduled posts"
          : "Removed campaign container",
      );
    } catch {
      toast.error("Could not delete campaign");
    }
  };

  return (
    <div className="space-y-6">
      {/* Campaign Auto-Generator Studio Card */}
      <Card className="border border-primary/35 bg-linear-to-br from-primary/15 via-card/65 to-card/50 backdrop-blur-md">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge className="bg-primary text-primary-foreground">
              <IconRocket className="mr-1 size-3.5" />
              Release Campaign Auto-Generator
            </Badge>
            <span className="text-xs text-muted-foreground">
              Auto-populates hooks, EN/FR captions, DAW shot lists, and calendar dates
            </span>
          </div>
          <CardTitle className="text-2xl">
            Turn any track or course module into a multi-week rollout in 1 click
          </CardTitle>
          <CardDescription>
            Pick a track from your catalog, choose a rollout blueprint, set your anchor date, and
            let the studio schedule the entire campaign into your Kanban & Calendar.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                1. Select Track / Course Asset
              </label>
              <select
                value={selectedCatalogId}
                onChange={(e) => handleCatalogChange(e.target.value)}
                className="w-full border border-border/70 bg-background/85 px-3 py-2 text-sm font-medium text-foreground"
              >
                {catalog.map((item) => (
                  <option key={item.id} value={item.id}>
                    [{item.type === "course_lesson" ? "COURSE" : "TRACK"}] {item.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                2. Rollout Blueprint
              </label>
              <select
                value={campaignType}
                onChange={(e) => setCampaignType(e.target.value as CampaignType)}
                className="w-full border border-border/70 bg-background/85 px-3 py-2 text-sm font-medium text-foreground"
              >
                {(
                  Object.entries(CAMPAIGN_ROLLOUT_BLUEPRINTS) as Array<
                    [CampaignType, (typeof CAMPAIGN_ROLLOUT_BLUEPRINTS)[CampaignType]]
                  >
                ).map(([key, bp]) => (
                  <option key={key} value={key}>
                    {bp.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                3. Release / Anchor Date
              </label>
              <input
                type="date"
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
                className="w-full border border-border/70 bg-background/85 px-3 py-2 text-sm text-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                4. Custom Campaign Name (Optional)
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder={`${selectedCatalogItem?.title ?? "ASCENSION"} Rollout`}
                className="w-full border border-border/70 bg-background/85 px-3 py-2 text-sm text-foreground"
              />
            </div>
          </div>

          {/* Live Rollout Timeline Preview */}
          <div className="space-y-2.5 border border-border/70 bg-background/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-primary-foreground">
                Blueprint Preview: {activeBlueprint.label} (
                {activeBlueprint.steps.length} Scheduled Posts)
              </span>
              <span className="text-xs text-muted-foreground">
                {activeBlueprint.description}
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {activeBlueprint.steps.map((step, idx) => {
                const stepDate = new Date(
                  new Date(releaseDate).getTime() + step.dayOffset * 86_400_000,
                );
                const dayBadge =
                  step.dayOffset === 0
                    ? "RELEASE DAY"
                    : step.dayOffset < 0
                      ? `Day ${step.dayOffset}`
                      : `Day +${step.dayOffset}`;
                const pillarMeta = PILLAR_META[step.pillar];

                return (
                  <div
                    key={idx}
                    className={cn(
                      "flex flex-col justify-between gap-2 border p-3 text-xs",
                      step.dayOffset === 0
                        ? "border-primary bg-primary/15"
                        : "border-border/60 bg-card/50",
                    )}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span
                          className={cn(
                            "font-mono text-[0.68rem] font-bold",
                            step.dayOffset === 0
                              ? "text-primary-foreground"
                              : "text-primary",
                          )}
                        >
                          {dayBadge}
                        </span>
                        <span className="text-[0.65rem] text-muted-foreground">
                          {stepDate.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                      <p className="font-semibold text-foreground">
                        {step.titleSuffix.replaceAll(
                          "{title}",
                          selectedCatalogItem?.title ?? "Track",
                        )}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span
                        className={cn(
                          "border px-1.5 py-0.5 text-[0.6rem]",
                          pillarMeta.badgeClass,
                        )}
                      >
                        {pillarMeta.label}
                      </span>
                      <div className="flex gap-1">
                        {step.platforms.slice(0, 3).map((p) => {
                          const pMeta = PLATFORM_META[p];
                          return (
                            <pMeta.Icon
                              key={p}
                              className="size-3.5 text-muted-foreground"
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              size="lg"
              disabled={isGenerating}
              onClick={handleGenerateCampaign}
            >
              <IconSparkles className="size-4" />
              {isGenerating
                ? "Generating Campaign..."
                : `Generate ${activeBlueprint.steps.length}-Post Rollout for ${selectedCatalogItem?.title ?? "Track"}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active & Past Campaigns List */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold">
          Active Rollout Campaigns ({campaigns.length})
        </h3>

        {campaigns.length === 0 ? (
          <div className="border border-dashed border-border/70 bg-card/30 p-8 text-center text-sm text-muted-foreground">
            No campaigns generated yet. Choose a track or course lesson above and click{" "}
            <strong className="text-foreground">Generate Rollout</strong> to build your first
            multi-week campaign!
          </div>
        ) : (
          campaigns.map((camp) => {
            const campPosts = posts
              .filter((p) => p.campaignId === camp.id)
              .sort((a, b) => {
                const da = a.scheduledFor ? new Date(a.scheduledFor).getTime() : 0;
                const dbTime = b.scheduledFor ? new Date(b.scheduledFor).getTime() : 0;
                return da - dbTime;
              });
            const postedCount = campPosts.filter((p) => p.status === "posted").length;
            const pct =
              campPosts.length > 0
                ? Math.round((postedCount / campPosts.length) * 100)
                : 0;
            const linkedAsset = catalog.find((c) => c.id === camp.catalogItemId);

            return (
              <Card
                key={camp.id}
                className="border border-border/60 bg-card/45 backdrop-blur-sm"
              >
                <CardHeader className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3.5">
                    {linkedAsset?.artworkUrl ? (
                      <img
                        src={linkedAsset.artworkUrl}
                        alt={linkedAsset.title}
                        className="size-14 object-cover border border-white/15"
                      />
                    ) : null}
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{camp.title}</CardTitle>
                        <Badge variant="outline" className="text-xs">
                          {postedCount}/{campPosts.length} Posted ({pct}%)
                        </Badge>
                      </div>
                      <CardDescription>
                        Anchor Date:{" "}
                        {new Date(camp.releaseDate).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}{" "}
                        • {camp.notes}
                      </CardDescription>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/15"
                      onClick={() => handleDeleteCampaign(camp.id, true)}
                    >
                      <IconTrash className="size-4" />
                      Delete Rollout
                    </Button>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                    {campPosts.map((post) => {
                      const statusMeta =
                        STATUS_COLUMNS.find((c) => c.id === post.status) ??
                        STATUS_COLUMNS[0];

                      return (
                        <div
                          key={post.id}
                          onClick={() => onOpenPost(post)}
                          className="cursor-pointer space-y-2 border border-border/60 bg-background/60 p-3 transition-colors hover:border-primary/50"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className={cn(
                                "border px-1.5 py-0.5 text-[0.62rem] font-semibold",
                                statusMeta.badgeClass,
                              )}
                            >
                              {post.status === "posted" ? (
                                <IconCheck className="mr-0.5 inline size-3" />
                              ) : null}
                              {statusMeta.label}
                            </span>
                            {post.scheduledFor ? (
                              <span className="inline-flex items-center gap-1 text-[0.68rem] text-muted-foreground">
                                <IconCalendarEvent className="size-3" />
                                {new Date(post.scheduledFor).toLocaleDateString(
                                  undefined,
                                  {
                                    month: "short",
                                    day: "numeric",
                                  },
                                )}
                              </span>
                            ) : null}
                          </div>

                          <p className="text-xs font-bold leading-snug text-foreground">
                            {post.title}
                          </p>
                          <p className="line-clamp-2 text-[0.7rem] text-muted-foreground">
                            &ldquo;{post.onScreenHookEn}&rdquo;
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
