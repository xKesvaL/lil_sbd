import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PressKitDownloadPage } from "#/containers/presskit/presskit-download-page.tsx";
import { m } from "#/paraglide/messages";

const pressKitDownloadSearchSchema = z.object({
  /** Deep-links into a press kit folder, e.g. `?path=02_LOGOS`. */
  path: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/presskit/download")({
  validateSearch: pressKitDownloadSearchSchema,
  head: () => {
    const title = `${m["presskit.meta.download_title"]()} | ${m["common.lil_sbd"]()}`;
    const description = m["presskit.meta.download_description"]();

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
    };
  },
  component: PressKitDownload,
});

function PressKitDownload() {
  const { path } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <PressKitDownloadPage
      initialPath={path}
      onPathChange={(nextPath) => {
        if ((nextPath ?? undefined) === (path ?? undefined)) {
          return;
        }
        void navigate({
          search: nextPath ? { path: nextPath } : {},
          replace: false,
        });
      }}
    />
  );
}
