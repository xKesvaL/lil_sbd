import {
  IconArrowLeft,
  IconBrandDiscord,
  IconBrandGithub,
  IconLock,
  IconSparkles,
} from "@tabler/icons-react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
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
import { signIn, signUp } from "#/lib/auth-client";
import { cn } from "#/lib/utils";
import { getAuthSessionServerFn } from "#/server/socials";

export const Route = createFileRoute("/admin/login")({
  loader: async () => {
    const status = await getAuthSessionServerFn();
    if (status.user) {
      throw redirect({ to: "/admin/socials" });
    }
    return status;
  },
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const { authConfig, databaseMode } = Route.useLoaderData();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [name, setName] = useState("LIL SBD");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (mode === "signup") {
        const res = await signUp.email({
          name: name.trim() || "LIL SBD",
          email: email.trim(),
          password,
        });
        if (res.error) {
          toast.error(res.error.message || "Could not create account");
          return;
        }
        toast.success("Producer workspace initialized! Entering studio...");
        await navigate({ to: "/admin/socials" });
      } else {
        const res = await signIn.email({
          email: email.trim(),
          password,
        });
        if (res.error) {
          toast.error(res.error.message || "Invalid email or password");
          return;
        }
        toast.success("Welcome back to Social Growth Studio!");
        await navigate({ to: "/admin/socials" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSocialLogin = async (provider: "github" | "discord") => {
    try {
      await signIn.social({
        provider,
        callbackURL: "/admin/socials",
      });
    } catch {
      toast.error(`Configure ${provider.toUpperCase()} OAuth credentials in .env first`);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="mb-6 flex w-full max-w-md items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
          Back to lilsbd.com
        </Link>
        <Badge variant="outline" className="border-primary/40 bg-primary/10 text-xs">
          <IconSparkles className="mr-1 size-3.5 text-primary" />
          Producer Social Studio
        </Badge>
      </div>

      <Card className="w-full max-w-md border border-border/70 bg-card/65 backdrop-blur-2xl">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <img src="/logo192.png" alt="LIL SBD" className="size-9 border border-white/15" />
            <div>
              <CardTitle className="text-xl font-bold">
                Artist Social Growth Studio
              </CardTitle>
              <CardDescription className="text-xs">
                Multi-producer command center for planning, hooks, rollouts & publishing
              </CardDescription>
            </div>
          </div>

          <div className="grid grid-cols-2 border border-border/70 bg-background/60 p-1 text-xs">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={cn(
                "py-1.5 font-semibold transition-colors",
                mode === "signin"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={cn(
                "py-1.5 font-semibold transition-colors",
                mode === "signup"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Create Producer Account
            </button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === "signup" ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Artist / Producer Stage Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="LIL SBD"
                  className="w-full border border-border/80 bg-background/85 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  required
                />
              </div>
            ) : null}

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@lilsbd.com"
                className="w-full border border-border/80 bg-background/85 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Password (min. 6 chars)
              </label>
              <input
                type="password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-border/80 bg-background/85 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                required
              />
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
              <IconLock className="size-4" />
              {isSubmitting
                ? "Authenticating..."
                : mode === "signup"
                  ? "Initialize Producer Studio"
                  : "Enter Studio"}
            </Button>
          </form>

          <div className="relative py-1 text-center text-xs text-muted-foreground">
            <span className="bg-card px-2">Or continue with Social OAuth</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSocialLogin("github")}
              disabled={!authConfig.githubEnabled}
              title={
                authConfig.githubEnabled
                  ? "Sign in with GitHub"
                  : "Set GITHUB_CLIENT_ID & GITHUB_CLIENT_SECRET in .env to enable"
              }
            >
              <IconBrandGithub className="size-4" />
              GitHub
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSocialLogin("discord")}
              disabled={!authConfig.discordEnabled}
              title={
                authConfig.discordEnabled
                  ? "Sign in with Discord"
                  : "Set DISCORD_CLIENT_ID & DISCORD_CLIENT_SECRET in .env to enable"
              }
            >
              <IconBrandDiscord className="size-4" />
              Discord
            </Button>
          </div>

          <div className="border-t border-border/60 pt-3 text-center text-[0.7rem] text-muted-foreground">
            Database:{" "}
            <strong className="text-foreground">
              {databaseMode === "remote_postgres"
                ? "Remote Postgres (DATABASE_URL)"
                : "Local Postgres (PGlite Persistent — Ready)"}
            </strong>
            {authConfig.adminEmailRestricted
              ? " • Locked to ADMIN_EMAIL"
              : " • Multi-Producer Workspace Ready"}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
