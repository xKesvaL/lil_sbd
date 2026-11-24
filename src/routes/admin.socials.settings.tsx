import { createFileRoute, getRouteApi, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { TracksSettingsTab } from "#/containers/admin/socials/tracks-settings-tab";

const studioRouteApi = getRouteApi("/admin/socials");

export const Route = createFileRoute("/admin/socials/settings")({
  component: AdminSocialsSettingsPage,
});

function AdminSocialsSettingsPage() {
  const data = studioRouteApi.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const oauthErr = params.get("oauth_error");

    if (connected) {
      toast.success(`Connected ${connected.replace("_", " ")} account!`);
      void navigate({ to: "/admin/socials/settings", replace: true });
    } else if (oauthErr) {
      toast.error(`OAuth error: ${oauthErr}`);
      void navigate({ to: "/admin/socials/settings", replace: true });
    }
  }, [navigate]);

  const refreshStudioData = async () => {
    await router.invalidate();
  };

  return (
    <TracksSettingsTab
      profile={data.profile}
      catalog={data.catalog}
      hashtagPresets={data.hashtagPresets}
      connections={data.connections}
      oauthEnvConfigured={data.oauthEnvConfigured}
      storageStats={data.storageStats}
      diagnostics={data.diagnostics}
      recentJobs={data.recentJobs}
      onRefresh={refreshStudioData}
    />
  );
}
