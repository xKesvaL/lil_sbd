import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { AudioProvider } from "#/components/audio/player.tsx";
import { Footer } from "#/components/layout/footer.tsx";
import { Header } from "#/components/layout/header.tsx";
import { TooltipProvider } from "#/components/ui/tooltip.tsx";
import { audioPlayerTracks } from "#/lib/songs.ts";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";
import PostHogProvider from "../integrations/posthog/provider";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  beforeLoad: async () => {
    // Other redirect strategies are possible; see
    // https://github.com/TanStack/router/tree/main/examples/react/i18n-paraglide#offline-redirect
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("lang", getLocale());
    }
  },

  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: m["common.lil_sbd"](),
      },
      {
        name: "description",
        content: m["common.lil_sbd"](),
      },
      {
        name: "theme-color",
        content: "#151124",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang={getLocale()}>
      <head>
        <HeadContent />
      </head>
      <body>
        <PostHogProvider>
          <TooltipProvider>
            <AudioProvider tracks={audioPlayerTracks}>
              <Header />

              {children}

              <Footer />
              <TanStackDevtools
                config={{
                  position: "bottom-right",
                }}
                plugins={[
                  {
                    name: "Tanstack Router",
                    render: <TanStackRouterDevtoolsPanel />,
                  },
                  TanStackQueryDevtools,
                ]}
              />
            </AudioProvider>
          </TooltipProvider>
        </PostHogProvider>
        <Scripts />
      </body>
    </html>
  );
}
