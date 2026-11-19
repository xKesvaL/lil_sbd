import { createFileRoute } from "@tanstack/react-router";
import { PressKitIndexPage } from "#/containers/presskit/presskit-index-page.tsx";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/presskit/")({
  head: () => {
    const title = `${m["presskit.meta.title"]()} | ${m["common.lil_sbd"]()}`;
    const description = m["presskit.meta.description"]();

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
  component: PressKitIndex,
});

function PressKitIndex() {
  return <PressKitIndexPage />;
}
