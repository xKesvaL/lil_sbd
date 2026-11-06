import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Toaster } from "sonner";
import { AudioProvider } from "#/components/audio/player.tsx";
import { Footer } from "#/components/layout/footer.tsx";
import { Header } from "#/components/layout/header.tsx";
import DarkVeil from "#/components/react-bits/dark-veil.tsx";
import { TooltipProvider } from "#/components/ui/tooltip.tsx";
import { audioPlayerTracks } from "#/lib/songs.ts";
import { cn } from "#/lib/utils.ts";
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
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isAdminStudio =
    pathname.startsWith("/admin") || /^\/(en|fr|de)\/admin(\/|$)/.test(pathname);

  return (
    <html lang={getLocale()}>
      <head>
        <HeadContent />
      </head>
      <body>
        <PostHogProvider>
          <TooltipProvider>
            <AudioProvider tracks={audioPlayerTracks}>
              {!isAdminStudio ? <Header /> : null}

              <main
                id="top"
                className={cn("relative overflow-hidden", !isAdminStudio && "pt-20")}
              >
                <div className="fixed inset-0 -z-10 opacity-70">
                  <DarkVeil
                    hueShift={0}
                    noiseIntensity={0.07}
                    scanlineIntensity={0.15}
                    speed={1.5}
                    scanlineFrequency={1}
                    warpAmount={5}
                    verticalOffset={0.2}
                  />
                </div>
                {children}
              </main>

              {!isAdminStudio ? <Footer /> : null}
              <Toaster theme="dark" richColors position="bottom-right" />
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
