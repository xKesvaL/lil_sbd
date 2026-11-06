import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { DownloadPage } from "#/containers/download/download-page.tsx";
import { m } from "#/paraglide/messages";

const downloadSearchSchema = z.object({
  /** Preselects tracks: `?track=induzaag` or `?track=induzaag,kino`. */
  track: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/download")({
  validateSearch: downloadSearchSchema,
  head: () => {
    const title = `${m["download.meta.title"]()} | ${m["common.lil_sbd"]()}`;
    const description = m["download.meta.description"]();

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
  component: Download,
});

function Download() {
  const { track } = Route.useSearch();

  // Remount when the preselection changes so the initial selection follows the URL.
  return <DownloadPage key={track ?? ""} initialTrackParam={track} />;
}
