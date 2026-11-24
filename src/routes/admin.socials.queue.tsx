import { createFileRoute, getRouteApi, useNavigate, useRouter } from "@tanstack/react-router";
import { AutopilotQueueTab } from "#/containers/admin/socials/autopilot-queue-tab";

const studioRouteApi = getRouteApi("/admin/socials");

export const Route = createFileRoute("/admin/socials/queue")({
  component: AdminSocialsQueuePage,
});

function AdminSocialsQueuePage() {
  const data = studioRouteApi.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();

  const refreshStudioData = async () => {
    await router.invalidate();
  };

  return (
    <AutopilotQueueTab
      profile={data.profile}
      posts={data.posts}
      catalog={data.catalog}
      connections={data.connections}
      recentJobs={data.recentJobs}
      onRefresh={refreshStudioData}
      onNavigateTab={(tab) => {
        if (tab === "create") {
          void navigate({ to: "/admin/socials" });
        } else {
          void navigate({ to: "/admin/socials/settings" });
        }
      }}
    />
  );
}
