import {
  IconBrandInstagram,
  IconBrandSoundcloud,
  IconExternalLink,
  IconRepeat,
} from "@tabler/icons-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { buttonVariants } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { providerConfig, type Song } from "#/lib/providers.ts";
import { socials } from "#/lib/socials.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages";

const instagramClassName =
  "bg-linear-to-r from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white hover:text-white hover:brightness-110 focus-visible:ring-[#dd2a7b]/40";

function ExternalButton({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(buttonVariants({ size: "sm" }), "border-0 pr-2.5", className)}
    >
      {children}
      <IconExternalLink data-icon="inline-end" className="size-3.5 opacity-80" />
    </a>
  );
}

function SupportRow({
  Icon,
  title,
  description,
  children,
}: {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 border bg-background/40 p-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/12 text-primary">
        <Icon className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium">{title}</p>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="col-start-2">{children}</div>
    </li>
  );
}

function RepostAction({ songs }: { songs: Song[] }) {
  const soundcloudClassName = providerConfig.soundcloud.className;
  const [onlySong] = songs;

  if (songs.length <= 1) {
    return (
      <ExternalButton
        href={onlySong?.links.soundcloud ?? socials.soundcloud}
        className={soundcloudClassName}
      >
        <IconBrandSoundcloud data-icon="inline-start" />
        {m["download.support.open_on_soundcloud"]()}
      </ExternalButton>
    );
  }

  return (
    <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
      {songs.map((song) => (
        <li key={song.slug}>
          <a
            href={song.links.soundcloud}
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-3 border bg-background/50 p-1.5 pr-3 transition-colors hover:bg-card/80"
          >
            {song.artworkUrl ? (
              <img
                src={song.artworkUrl}
                alt=""
                className="size-8 shrink-0 object-cover"
                loading="lazy"
              />
            ) : (
              <span className="size-8 shrink-0 bg-primary/20" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{song.title}</span>
            <IconBrandSoundcloud className="size-4 shrink-0 text-[#ff7a1a]" />
            <IconExternalLink className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function SupportList({ selectedSongs }: { selectedSongs: Song[] }) {
  const repostSongs = selectedSongs.filter((song) => Boolean(song.links.soundcloud));

  return (
    <ul className="flex flex-col gap-3">
      <SupportRow
        Icon={IconBrandSoundcloud}
        title={m["download.support.soundcloud_follow_title"]()}
        description={m["download.support.soundcloud_follow_description"]()}
      >
        <ExternalButton href={socials.soundcloud} className={providerConfig.soundcloud.className}>
          <IconBrandSoundcloud data-icon="inline-start" />
          {m["download.support.follow"]()}
        </ExternalButton>
      </SupportRow>

      <SupportRow
        Icon={IconRepeat}
        title={m["download.support.soundcloud_repost_title"]()}
        description={m["download.support.soundcloud_repost_description"]()}
      >
        <RepostAction songs={repostSongs} />
      </SupportRow>

      <SupportRow
        Icon={IconBrandInstagram}
        title={m["download.support.instagram_title"]()}
        description={m["download.support.instagram_description"]()}
      >
        <ExternalButton href={socials.instagram} className={instagramClassName}>
          <IconBrandInstagram data-icon="inline-start" />
          {m["download.support.follow"]()}
        </ExternalButton>
      </SupportRow>
    </ul>
  );
}

/**
 * Optional ways to support the project. Never gates anything:
 * `panel` sits next to the track picker, `compact` is reused inside the thank-you dialog.
 */
export function DownloadSupport({
  selectedSongs,
  variant = "panel",
  className,
}: {
  selectedSongs: Song[];
  variant?: "panel" | "compact";
  className?: string;
}) {
  if (variant === "compact") {
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        <SupportList selectedSongs={selectedSongs} />
        <p className="text-xs text-muted-foreground">{m["download.support.footnote"]()}</p>
      </div>
    );
  }

  return (
    <Card className={cn("border bg-background/50 ring-0 backdrop-blur-xl", className)}>
      <CardHeader className="gap-3">
        <Badge
          variant="outline"
          className="border-primary/35 bg-background/40 px-3 py-1 text-[0.7rem] tracking-[0.28em] uppercase"
        >
          {m["download.support.eyebrow"]()}
        </Badge>
        <CardTitle className="text-2xl font-semibold">{m["download.support.title"]()}</CardTitle>
        <CardDescription className="text-base leading-7">
          {m["download.support.description"]()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SupportList selectedSongs={selectedSongs} />
      </CardContent>
      <CardFooter>
        <p className="text-sm text-muted-foreground">{m["download.support.footnote"]()}</p>
      </CardFooter>
    </Card>
  );
}
