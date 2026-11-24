import { createFileRoute, getRouteApi, useNavigate, useRouter } from "@tanstack/react-router";
import { CreateReviewTab } from "#/containers/admin/socials/create-review-tab";

const studioRouteApi = getRouteApi("/admin/socials");

export const Route = createFileRoute("/admin/socials/")({
  component: AdminSocialsCreatePage,
});

function AdminSocialsCreatePage() {
  const data = studioRouteApi.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();

  const refreshStudioData = async () => {
    await router.invalidate();
  };

  return (
    <CreateReviewTab
      profile={data.profile}
      catalog={data.catalog}
      posts={data.posts}
      rawClips={data.rawClips}
      connections={data.connections}
      hashtagPresets={data.hashtagPresets}
      recentJobs={data.recentJobs}
      nextAvailableSlot={data.nextAvailableSlot}
      geminiStatus={data.geminiStatus}
      onRefresh={refreshStudioData}
      onNavigateTab={(tab) => {
        if (tab === "queue") {
          void navigate({ to: "/admin/socials/queue" });
        } else {
          void navigate({ to: "/admin/socials/settings" });
        }
      }}
    />
  );
}
