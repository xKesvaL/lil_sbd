import {
  IconBrandInstagram,
  IconBrandSoundcloud,
  IconBrandSpotify,
  IconBrandTiktok,
  IconBrandYoutube,
  IconMail,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { socials } from "#/lib/socials.ts";
import { m } from "#/paraglide/messages";

const footerSocials = [
  { href: socials.instagram, label: "Instagram", Icon: IconBrandInstagram },
  { href: socials.tiktok, label: "TikTok", Icon: IconBrandTiktok },
  { href: socials.spotify, label: "Spotify", Icon: IconBrandSpotify },
  { href: socials.youtube, label: "YouTube", Icon: IconBrandYoutube },
  { href: socials.soundcloud, label: "SoundCloud", Icon: IconBrandSoundcloud },
] as const;

export const Footer = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/60 bg-background/60 backdrop-blur-md">
      <div className="kcontainer flex flex-col gap-8 py-10 md:py-12">
        <div className="grid gap-8 md:grid-cols-[1.5fr_1fr_1fr]">
          <div className="flex flex-col gap-3">
            <Link to="/" className="inline-flex w-fit items-center gap-3">
              <img src="/logo192.png" alt="Lil SBD Logo" className="size-7" />
              <span className="text-lg font-semibold tracking-tight">{m["common.lil_sbd"]()}</span>
            </Link>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">
              {m["footer.tagline"]()}
            </p>
            <a
              href={socials.mailto}
              className="mt-1 inline-flex w-fit items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-primary"
            >
              <IconMail className="size-4 text-primary" />
              {socials.email}
            </a>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
              {m["footer.navigation"]()}
            </p>
            <nav className="flex flex-col gap-2 text-sm">
              <Link
                to="/"
                hash="music"
                className="w-fit text-muted-foreground transition-colors hover:text-foreground"
              >
                {m["nav.music"]()}
              </Link>
              <Link
                to="/download"
                className="w-fit text-muted-foreground transition-colors hover:text-foreground"
              >
                {m["nav.download"]()}
              </Link>
              <Link
                to="/"
                hash="contact"
                className="w-fit text-muted-foreground transition-colors hover:text-foreground"
              >
                {m["nav.contact"]()}
              </Link>
            </nav>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
              {m["footer.socials"]()}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {footerSocials.map(({ href, label, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className="flex size-9 items-center justify-center rounded-full border border-border/60 bg-background/60 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  <Icon className="size-4.5" />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-2 border-t border-border/50 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>{m["footer.rights"]({ year })}</p>
        </div>
      </div>
    </footer>
  );
};

