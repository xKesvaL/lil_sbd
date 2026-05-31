import {
  IconBrandSpotify,
  IconExternalLink,
  IconMenu2,
  IconMusic,
  IconPlayerPlay,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { listenProviderOrder, providerConfig } from "#/lib/providers.ts";
import { latestSong } from "@/lib/songs.ts";
import { cn } from "@/lib/utils.ts";
import { m } from "@/paraglide/messages";
import ParaglideLocaleSwitcher from "../LocaleSwitcher";
import { buttonVariants } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Separator } from "../ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";

type ActionRenderer = (props: {
  key: string;
  href: string;
  className: string;
  ariaLabel?: string;
  children: ReactNode;
}) => ReactNode;

const renderExternalAction: ActionRenderer = ({ key, href, className, ariaLabel, children }) => (
  <a
    key={key}
    href={href}
    target="_blank"
    rel="noreferrer"
    className={className}
    aria-label={ariaLabel}
  >
    {children}
  </a>
);

function LatestSongArtwork() {
  if (latestSong?.artworkUrl) {
    return (
      <img
        src={latestSong.artworkUrl}
        alt={latestSong.title}
        className="size-full object-cover"
        loading="lazy"
      />
    );
  }

  return (
    <div className="flex size-full flex-col justify-between bg-[radial-gradient(circle_at_20%_20%,rgba(30,215,96,0.45),transparent_48%),linear-gradient(150deg,#151515_0%,#050505_100%)] p-3 text-[#d2ffd7]">
      <span className="inline-flex size-9 items-center justify-center rounded-2xl bg-white/10 text-white">
        <IconMusic className="size-4.5" />
      </span>
      <div className="space-y-1">
        <div className="h-2.5 w-10 rounded-full bg-white/20" />
        <div className="h-2 w-14 rounded-full bg-white/10" />
      </div>
    </div>
  );
}

function ListenNowPanel({
  actionRenderer = renderExternalAction,
}: {
  actionRenderer?: ActionRenderer;
}) {
  const providerLinks = latestSong
    ? listenProviderOrder.flatMap((provider) => {
        const href = latestSong.links[provider];

        if (!href) {
          return [];
        }

        return [{ href, provider, ...providerConfig[provider] }];
      })
    : [];

  const featuredHref = latestSong?.links.spotify ?? providerLinks[0]?.href;
  const cardClassName =
    "block border border-white/10 bg-[#090909] p-4 text-left text-white shadow-[0_22px_80px_-30px_rgba(0,0,0,0.92)] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none";
  const cardContent = (
    <div className={cn("space-y-4")}>
      <div className="flex items-start gap-4">
        <div className="size-22 shrink-0 overflow-hidden ring-1 ring-white/10">
          <LatestSongArtwork />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[0.65rem] font-medium uppercase tracking-[0.22em] text-background">
            <span className="inline-flex items-center gap-1 bg-background/90 px-2 py-1 text-[0.6rem] tracking-[0.18em] text-[#7dffad]">
              <IconBrandSpotify className="size-3.5" />
              {m["common.spotify"]()}
            </span>
          </div>

          <p className="mt-3 truncate text-lg md:text-xl font-bold">
            {latestSong?.title ?? m["header.no_song_title"]()}
          </p>
          <p className="truncate text-sm text-background">
            {latestSong?.artists.join(" & ") ?? m["header.no_song_description"]()}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {featuredHref ? (
        actionRenderer({
          key: `featured-${latestSong?.slug ?? "empty"}`,
          href: featuredHref,
          className: cn(cardClassName, providerConfig.spotify.className),
          ariaLabel: latestSong?.title ?? m["header.no_song_title"](),
          children: cardContent,
        })
      ) : (
        <div className={cardClassName}>{cardContent}</div>
      )}

      {providerLinks.length > 0 ? (
        <div className="grid gap-2">
          {providerLinks.map(({ href, provider, label, Icon, className }) => {
            if (provider === "spotify" && href === featuredHref) {
              return null;
            }

            return actionRenderer({
              key: `${provider}-${href}`,
              href,
              className: cn(
                buttonVariants({ size: "lg" }),
                "w-full justify-between border-0 px-4 shadow-[0_12px_40px_-22px_rgba(0,0,0,0.7)]",
                className,
              ),
              ariaLabel: label(),
              children: (
                <>
                  <span className="flex items-center gap-3">
                    <Icon className="size-4.5" />
                    {label()}
                  </span>
                  <IconExternalLink className="size-4 opacity-80" />
                </>
              ),
            });
          })}
        </div>
      ) : (
        <div className="rounded-[1.2rem] border border-dashed border-border/70 bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
          {m["header.no_song_description"]()}
        </div>
      )}
    </div>
  );
}

function ListenNowDropdown({ className }: { className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ size: "sm" }),
          "aria-expanded:bg-primary aria-expanded:text-primary-foreground border-primary",
          className,
        )}
      >
        <IconPlayerPlay data-icon="inline-start" />
        {m["header.cta"]()}
        {/* <IconChevronDown data-icon="inline-end" className="size-4" /> */}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={24}
        alignOffset={-16}
        className="w-88 max-w-[calc(100vw-1rem)] min-w-0 overflow-hidden ring ring-border bg-background/50 backdrop-blur-md p-4 text-white shadow-[0_30px_90px_-34px_rgba(0,0,0,0.92)"
      >
        <ListenNowPanel />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const navItems = [
  { href: "#about", label: () => m["nav.about"]() },
  { href: "#music", label: () => m["nav.music"]() },
  { href: "#course", label: () => m["nav.course"]() },
  { href: "#contact", label: () => m["nav.contact"]() },
] as const;

function scrollToHash(hash: string) {
  if (typeof document === "undefined") {
    return;
  }

  const target = document.querySelector(hash);

  if (target instanceof HTMLElement) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", hash);
  }
}

export const Header = () => {
  return (
    <header className="fixed top-4 z-40 w-full kcontainer left-1/2 -translate-x-1/2">
      <div className=" flex items-center gap-2 ring ring-border bg-background/50 p-4 shadow-lg shadow-black/10 backdrop-blur-md">
        <Link to="/" className="min-w-0 flex gap-3">
          <img src="/logo192.png" alt="Lil SBD Logo" className="size-7" />
          <span className="block truncate text-sm font-medium sm:text-xl">
            {m["common.lil_sbd"]()}
          </span>
        </Link>

        <Separator orientation="vertical" className="hidden h-8 md:block ml-3" />

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "rounded-full text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label()}
            </a>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-3 md:flex">
          <ParaglideLocaleSwitcher compact />

          <Separator orientation="vertical" className="h-8" />

          <ListenNowDropdown />
        </div>

        <div className="ml-auto md:hidden">
          <Sheet>
            <SheetTrigger
              render={
                <button
                  type="button"
                  className={buttonVariants({
                    variant: "outline",
                    size: "icon-sm",
                  })}
                />
              }
              aria-label={m["header.menu.open_label"]()}
            >
              <IconMenu2 />
            </SheetTrigger>
            <SheetContent side="right" className="border-border/60 bg-popover/96">
              <SheetHeader className="border-b border-border/60">
                <SheetTitle>{m["common.lil_sbd"]()}</SheetTitle>
                <SheetDescription></SheetDescription>
              </SheetHeader>

              <div className="flex flex-col gap-2 p-6">
                <ParaglideLocaleSwitcher className="mb-2" />
                {navItems.map((item) => (
                  <SheetClose
                    key={item.href}
                    onClick={() => scrollToHash(item.href)}
                    render={
                      <button
                        type="button"
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "lg" }),
                          "justify-start",
                        )}
                      />
                    }
                  >
                    {item.label()}
                  </SheetClose>
                ))}
              </div>

              <SheetFooter className="border-t border-border/60">
                <ListenNowPanel
                  actionRenderer={({ key, href, className, ariaLabel, children }) => (
                    <SheetClose
                      key={key}
                      render={
                        <button
                          type="button"
                          className={className}
                          aria-label={ariaLabel}
                          onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
                        />
                      }
                    >
                      {children}
                    </SheetClose>
                  )}
                />
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};
