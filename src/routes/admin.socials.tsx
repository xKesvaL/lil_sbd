import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCalendarClock,
  IconDatabase,
  IconLogout,
  IconPlugConnected,
  IconSparkles,
} from "@tabler/icons-react";
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import {
  PLATFORM_META,
  PUBLISHABLE_PLATFORMS,
} from "#/containers/admin/socials/social-constants";
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
  component: SocialAutopilotStudioLayout,
});

type StudioRoutePath = "/admin/socials" | "/admin/socials/queue" | "/admin/socials/settings";

function resolveActivePath(pathname: string): StudioRoutePath {
  if (pathname.startsWith("/admin/socials/queue")) return "/admin/socials/queue";
  if (pathname.startsWith("/admin/socials/settings")) return "/admin/socials/settings";
  return "/admin/socials";
}

function SocialAutopilotStudioLayout() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activePath = resolveActivePath(pathname);

  // Backward-compatible redirect for legacy ?tab=... or OAuth links hitting /admin/socials
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname !== "/admin/socials" && pathname !== "/admin/socials/") return;
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    const connected = params.get("connected");
    const oauthErr = params.get("oauth_error");
    const setup = params.get("setup");

    if (tabParam === "settings" || connected || oauthErr || setup) {
      const nextSearch = new URLSearchParams();
      if (connected) nextSearch.set("connected", connected);
      if (oauthErr) nextSearch.set("oauth_error", oauthErr);
      if (setup) nextSearch.set("setup", setup);
      const qs = nextSearch.toString();
      void navigate({
        href: qs ? `/admin/socials/settings?${qs}` : "/admin/socials/settings",
        replace: true,
      });
    } else if (tabParam === "queue") {
      void navigate({ to: "/admin/socials/queue", replace: true });
    }
  }, [navigate, pathname]);

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out of studio");
    await navigate({ to: "/admin/login" });
  };

  const reviewCount = data.posts.filter(
    (p) =>
      p.status !== "posted" &&
      (p.reviewStatus === "needs_review" ||
        p.reviewStatus === "processing" ||
        p.reviewStatus === "failed"),
  ).length;
  const queuedCount = data.posts.filter(
    (p) => p.status !== "posted" && (p.reviewStatus === "approved" || p.autoPublish),
  ).length;
  const expiringConnections = data.connections.filter(
    (c) => c.tokenHealth === "expired" || c.tokenHealth === "expiring_soon",
  );

  const navItems: Array<{
    to: StudioRoutePath;
    label: string;
    shortLabel: string;
    badge?: number | string;
    Icon: typeof IconSparkles;
  }> = [
    {
      to: "/admin/socials",
      label: "Create & Review",
      shortLabel: "Create",
      badge: reviewCount > 0 ? reviewCount : undefined,
      Icon: IconSparkles,
    },
    {
      to: "/admin/socials/queue",
      label: "Autopilot Queue",
      shortLabel: "Queue",
      badge: queuedCount > 0 ? queuedCount : undefined,
      Icon: IconCalendarClock,
    },
    {
      to: "/admin/socials/settings",
      label: "Tracks & Settings",
      shortLabel: "Settings",
      badge: `${data.connections.length}/3`,
      Icon: IconPlugConnected,
    },
  ];

  const activeItem = navItems.find((n) => n.to === activePath) ?? navItems[0]!;

  return (
    <div className="flex min-h-screen bg-background/40 pb-20 lg:pb-0">
      {/* Desktop Left Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r border-border/70 bg-sidebar/95 p-5 backdrop-blur-2xl lg:flex">
        <div className="space-y-6">
          {/* Brand Header */}
          <div className="flex items-center gap-3 border-b border-border/60 pb-4">
            <img
              src="/logo192.png"
              alt={data.profile.stageName}
              className="size-9 border border-white/15"
            />
            <div className="min-w-0">
              <p className="truncate text-base font-bold">{data.profile.stageName}</p>
              <p className="truncate text-xs text-muted-foreground">Social Autopilot Studio</p>
            </div>
          </div>

          {/* 3-Route Navigation */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = activePath === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "border-l-2 border-primary bg-primary/15 font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <item.Icon className={cn("size-4.5", active && "text-primary")} />
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
                </Link>
              );
            })}
          </nav>

          {/* Connected Channels Mini Status */}
          <div className="space-y-2 border-t border-border/60 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Direct Channels
              </span>
              <Link
                to="/admin/socials/settings"
                className="text-[0.68rem] text-primary hover:underline"
              >
                Configure
              </Link>
            </div>
            <div className="space-y-1.5">
              {PUBLISHABLE_PLATFORMS.map((p) => {
                const m = PLATFORM_META[p];
                const conn = data.connections.find((c) => c.platform === p);
                const dotClass = !conn
                  ? "bg-slate-500"
                  : conn.tokenHealth === "expired"
                    ? "bg-rose-400"
                    : conn.tokenHealth === "expiring_soon"
                      ? "bg-amber-400"
                      : "bg-emerald-400";

                return (
                  <div
                    key={p}
                    className="flex items-center justify-between text-xs text-muted-foreground"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <m.Icon className="size-3.5" />
                      {m.shortLabel}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-[0.68rem]",
                        conn?.tokenHealth === "expired"
                          ? "text-rose-300"
                          : conn?.tokenHealth === "expiring_soon"
                            ? "text-amber-200"
                            : conn
                              ? "text-emerald-300"
                              : "text-muted-foreground/60",
                      )}
                    >
                      <span className={cn("size-1.5 rounded-full", dotClass)} />
                      {conn ? conn.accountName : "Unlinked"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="space-y-3 border-t border-border/60 pt-4">
          <div className="flex items-center justify-between text-[0.7rem] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <IconDatabase className="size-3.5 text-emerald-400" />
              {data.databaseMode === "remote_postgres" ? "Postgres Live" : "Local Postgres"}
            </span>
            <span className="max-w-28 truncate" title={data.user.email}>
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
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border/70 bg-background/90 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/logo192.png"
              alt={data.profile.stageName}
              className="size-7 shrink-0 border border-white/10 lg:hidden"
            />
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold sm:text-xl">{activeItem.label}</h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                {data.profile.stageName} • Drop clips → Auto-Edit → Automatic Multi-Platform
                Publishing
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {expiringConnections.length > 0 ? (
              <Button
                size="xs"
                variant="outline"
                className="border-amber-500/50 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                nativeButton={false}
                render={<Link to="/admin/socials/settings" />}
              >
                <IconAlertTriangle className="size-3.5" />
                <span className="hidden sm:inline">Token Attention</span>
              </Button>
            ) : null}

            <Button
              size="icon-sm"
              variant="ghost"
              className="lg:hidden"
              nativeButton={false}
              render={<Link to="/" />}
              title="Back to Public Site"
            >
              <IconArrowLeft className="size-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              className="lg:hidden"
              onClick={handleSignOut}
              title="Sign Out"
            >
              <IconLogout className="size-4" />
            </Button>
          </div>
        </header>

        {/* Active Child Route Workspace */}
        <div className="mx-auto w-full max-w-[1400px] flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </div>

      {/* Mobile Bottom 3-Route Bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-border/80 bg-background/95 backdrop-blur-2xl lg:hidden">
        {navItems.map((item) => {
          const active = activePath === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 py-2.5 text-[0.7rem] font-medium transition-colors",
                active
                  ? "border-t-2 border-primary bg-primary/12 font-semibold text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.Icon className={cn("size-4.5", active && "text-primary")} />
              <span className="truncate">{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
