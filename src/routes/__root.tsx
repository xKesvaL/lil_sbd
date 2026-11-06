import { IconArrowLeft } from "@tabler/icons-react";
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
import { Header } from "#/components/layout/Header.tsx";
import DarkVeil from "#/components/react-bits/dark-veil.tsx";
import { buttonVariants } from "#/components/ui/button.tsx";
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

const defaultOgImage = latestSong?.artworkUrl ?? "/logo512.png";

export const Route = createRootRouteWithContext<MyRouterContext>()({
  beforeLoad: async () => {
    // Other redirect strategies are possible; see
    // https://github.com/TanStack/router/tree/main/examples/react/i18n-paraglide#offline-redirect
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("lang", getLocale());
    }
  },

  head: () => {
    const title = m["homee_meta_title"]();
    const description = m["homee_meta_description"]();

    return {
      meta: [
        {
          charSet: "utf-8",
        },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1",
        },
        {
          title,
        },
        {
          name: "description",
          content: description,
        },
        {
          name: "theme-color",
          content: "#151124",
        },
        {
          property: "og:type",
          content: "website",
        },
        {
          property: "og:site_name",
          content: m["common.lil_sbd"](),
        },
        {
          property: "og:title",
          content: title,
        },
        {
          property: "og:description",
          content: description,
        },
        {
          property: "og:image",
          content: defaultOgImage,
        },
        {
          name: "twitter:card",
          content: "summary_large_image",
        },
        {
          name: "twitter:title",
          content: title,
        },
        {
          name: "twitter:description",
          content: description,
        },
        {
          name: "twitter:image",
          content: defaultOgImage,
        },
      ],
      links: [
        {
          rel: "stylesheet",
          href: appCss,
        },
        {
          rel: "icon",
          href: "/favicon.ico",
          sizes: "any",
        },
        {
          rel: "apple-touch-icon",
          href: "/logo192.png",
        },
        {
          rel: "manifest",
          href: "/manifest.json",
        },
      ],
    };
  },
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
});

function NotFound() {
  return (
    <section className="kcontainer section flex min-h-[60vh] flex-col items-start justify-center gap-5">
      <div className="border bg-background/50 px-2.5 py-1 text-xs font-medium tracking-widest uppercase">
        {m["not_found.eyebrow"]()}
      </div>
      <h1 className="text-5xl font-bold italic md:text-6xl">{m["not_found.title"]()}</h1>
      <p className="max-w-xl text-lg text-muted-foreground">{m["not_found.description"]()}</p>
      <Link to="/" className={cn(buttonVariants({ size: "lg" }), "mt-2")}>
        <IconArrowLeft data-icon="inline-start" />
        {m["not_found.back_home"]()}
      </Link>
    </section>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isAdminStudio =
    pathname.startsWith("/admin") || /^\/(en|fr|de)\/admin(\/|$)/.test(pathname);

  return (
    <html
      lang={getLocale()}
      className="dark scroll-smooth scroll-pt-28 md:scroll-pt-32 lg:scroll-pt-36"
    >
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
                className={cn("relative", !isAdminStudio && "overflow-hidden pt-20")}
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

