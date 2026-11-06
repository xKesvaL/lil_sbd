import {
  IconArrowLeft,
  IconChartBar,
  IconDatabase,
  IconDisc,
  IconFlame,
  IconLayoutKanban,
  IconLogout,
  IconPlus,
  IconRocket,
  IconSparkles,
} from "@tabler/icons-react";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { CampaignsTab } from "#/containers/admin/socials/campaigns-tab";
import { CatalogTab } from "#/containers/admin/socials/catalog-tab";
import { IdeaVaultTab } from "#/containers/admin/socials/idea-vault-tab";
import { OverviewTab } from "#/containers/admin/socials/overview-tab";
import { PipelineTab } from "#/containers/admin/socials/pipeline-tab";
import { PublishingCopilotSheet } from "#/containers/admin/socials/publishing-copilot-sheet";
import type { SocialPostRecord } from "#/db/schema";
import { signOut } from "#/lib/auth-client";
import { cn } from "#/lib/utils";
import { getStudioDashboardServerFn } from "#/server/socials";

export const Route = createFileRoute("/admin/socials")({
  loader: async () => {
    try {
      return await getStudioDashboardServerFn();
    } catch {
      throw redirect({ to: "/admin/login" });
    }
  },
  component: SocialGrowthStudioPage,
});

type StudioTab = "overview" | "pipeline" | "vault" | "campaigns" | "catalog";

function SocialGrowthStudioPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<StudioTab>("overview");
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<SocialPostRecord | null>(null);

  const refreshStudioData = async () => {
    await router.invalidate();
  };

  const handleOpenPost = (post: SocialPostRecord | null, defaultDate?: string) => {
    if (post) {
      setSelectedPost(post);
    } else if (defaultDate) {
      setSelectedPost({
        id: "",
        userId: data.user.id,
        campaignId: null,
        catalogItemId: data.catalog[0]?.id ?? null,
        templateId: null,
        title: "",
        status: "idea",
        platforms: ["instagram_reels", "tiktok", "youtube_shorts"],
        pillar: "drop_showcase",
        scheduledFor: new Date(defaultDate),
        postedAt: null,
        sortOrder: 0,
        onScreenHookEn: "",
        onScreenHookFr: "",
        hookVariantsEn: {},
        hookVariantsFr: {},
        shotList: [],
        audioTimestamp: "0:42 - 0:58 (Main Drop)",
        captionEn: "",
        captionFr: "",
        ctaEn: `Stream on all platforms & check out the free HDM course — ${data.profile.defaultBioLink}`,
        ctaFr: `Écoute sur toutes les plateformes & découvre le cours HDM gratuit — ${data.profile.defaultBioLink}`,
        hashtags: ["#uptempohardcore", "#zaagkick", "#harddance", "#lilsbd"],
        preFlightChecklist: {
          highResExport: false,
          coverFrameSelected: false,
          audioSynced: false,
          linkInBioUpdated: false,
        },
        publishedUrl: null,
        views: 0,
        likes: 0,
        saves: 0,
        shares: 0,
        comments: 0,
        performanceRating: null,
        retrospectiveNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      setSelectedPost(null);
    }
    setCopilotOpen(true);
  };

  const handleOpenCreatedPostById = async (postId: string) => {
    await router.invalidate();
    const fresh = await getStudioDashboardServerFn();
    const found = fresh.posts.find((p) => p.id === postId) ?? null;
    if (found) {
      setSelectedPost(found);
      setCopilotOpen(true);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out of studio");
    await navigate({ to: "/admin/login" });
  };

  const readyCount = data.posts.filter((p) => p.status === "ready").length;
  const activePipelineCount = data.posts.filter((p) => p.status !== "posted").length;

  const navItems: Array<{
    id: StudioTab;
    label: string;
    shortLabel: string;
    badge?: number;
    Icon: typeof IconChartBar;
  }> = [
    {
      id: "overview",
      label: "Command & Streaks",
      shortLabel: "Overview",
      badge: readyCount > 0 ? readyCount : undefined,
      Icon: IconFlame,
    },
    {
      id: "pipeline",
      label: "Kanban & Calendar",
      shortLabel: "Pipeline",
      badge: activePipelineCount,
      Icon: IconLayoutKanban,
    },
    {
      id: "vault",
      label: "Hard Dance Idea Vault",
      shortLabel: "Vault",
      badge: data.templates.length,
      Icon: IconSparkles,
    },
    {
      id: "campaigns",
      label: "Release Rollouts",
      shortLabel: "Rollouts",
      badge: data.campaigns.length || undefined,
      Icon: IconRocket,
    },
    {
      id: "catalog",
      label: "Catalog & Brand",
      shortLabel: "Catalog",
      badge: data.catalog.length,
      Icon: IconDisc,
    },
  ];

  return (
    <div className="flex min-h-screen bg-background/40 pb-20 lg:pb-0">
      {/* Desktop Left Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-68 shrink-0 flex-col justify-between border-r border-border/70 bg-sidebar/90 p-5 backdrop-blur-2xl lg:flex">
        <div className="space-y-6">
          {/* Brand Header */}
          <div className="flex items-center gap-3 border-b border-border/60 pb-4">
            <img
              src="/logo192.png"
              alt={data.profile.stageName}
              className="size-9 border border-white/15"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-base font-bold">{data.profile.stageName}</p>
                <Badge className="bg-primary/25 text-primary-foreground text-[0.6rem] px-1.5 py-0">
                  PRO
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                Social Growth Studio
              </p>
            </div>
          </div>

          {/* Primary New Post Button */}
          <Button
            size="lg"
            className="w-full justify-start gap-2.5 shadow-lg shadow-primary/20"
            onClick={() => handleOpenPost(null)}
          >
            <IconPlus className="size-4" />
            New Post in Copilot
          </Button>

          {/* Navigation */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "border-l-2 border-primary bg-primary/15 text-foreground font-semibold"
                      : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <item.Icon
                      className={cn("size-4.5", active && "text-primary")}
                    />
                    {item.label}
                  </span>
                  {item.badge !== undefined ? (
                    <span
                      className={cn(
                        "px-1.5 py-0.5 text-[0.68rem] font-semibold",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-card/80 text-muted-foreground",
                      )}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="space-y-3 border-t border-border/60 pt-4">
          <div className="flex items-center justify-between text-[0.7rem] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <IconDatabase className="size-3.5 text-emerald-400" />
              {data.databaseMode === "remote_postgres"
                ? "Postgres Live"
                : "Local Postgres"}
            </span>
            <span className="truncate max-w-28" title={data.user.email}>
              {data.user.email}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to="/" />}
            >
              <IconArrowLeft className="size-3.5" />
              Public Site
            </Button>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <IconLogout className="size-3.5" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Studio Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-border/70 bg-background/85 px-4 py-3.5 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/logo192.png"
              alt={data.profile.stageName}
              className="size-7 lg:hidden"
            />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold sm:text-xl">
                {navItems.find((n) => n.id === activeTab)?.label}
              </h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                {data.profile.stageName} • {data.profile.genre} • Target:{" "}
                {data.profile.weeklyPostTarget} posts/week
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="hidden sm:inline-flex"
              onClick={() => setActiveTab("vault")}
            >
              <IconSparkles className="size-4 text-primary" />
              Browse {data.templates.length} Ideas
            </Button>
            <Button size="sm" onClick={() => handleOpenPost(null)}>
              <IconPlus className="size-4" />
              <span>New Post</span>
            </Button>
          </div>
        </header>

        {/* Active Tab Workspace */}
        <div className="flex-1 p-4 sm:p-6 lg:p-8">
          {activeTab === "overview" ? (
            <OverviewTab
              profile={data.profile}
              posts={data.posts}
              catalog={data.catalog}
              campaigns={data.campaigns}
              onOpenPost={(p) => handleOpenPost(p)}
              onNavigateTab={(t) => setActiveTab(t)}
            />
          ) : null}

          {activeTab === "pipeline" ? (
            <PipelineTab
              posts={data.posts}
              catalog={data.catalog}
              onOpenPost={handleOpenPost}
              onRefresh={refreshStudioData}
            />
          ) : null}

          {activeTab === "vault" ? (
            <IdeaVaultTab
              templates={data.templates}
              catalog={data.catalog}
              profile={data.profile}
              posts={data.posts}
              onRefresh={refreshStudioData}
              onOpenCreatedPost={handleOpenCreatedPostById}
            />
          ) : null}

          {activeTab === "campaigns" ? (
            <CampaignsTab
              campaigns={data.campaigns}
              catalog={data.catalog}
              posts={data.posts}
              onOpenPost={(p) => handleOpenPost(p)}
              onRefresh={refreshStudioData}
            />
          ) : null}

          {activeTab === "catalog" ? (
            <CatalogTab
              profile={data.profile}
              catalog={data.catalog}
              onRefresh={refreshStudioData}
            />
          ) : null}
        </div>
      </div>

      {/* Mobile Bottom Tab Bar (Thumb-Friendly Pocket Mode) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border/80 bg-background/95 backdrop-blur-2xl lg:hidden">
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2.5 text-[0.68rem] font-medium transition-colors",
                active
                  ? "border-t-2 border-primary text-primary-foreground bg-primary/10"
                  : "text-muted-foreground",
              )}
            >
              <item.Icon className={cn("size-4.5", active && "text-primary")} />
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* Slide-Over Publishing Copilot Drawer */}
      <PublishingCopilotSheet
        open={copilotOpen}
        onOpenChange={setCopilotOpen}
        post={selectedPost?.id ? selectedPost : null}
        profile={data.profile}
        catalog={data.catalog}
        campaigns={data.campaigns}
        hashtagPresets={data.hashtagPresets}
        onSaved={refreshStudioData}
      />
    </div>
  );
}
