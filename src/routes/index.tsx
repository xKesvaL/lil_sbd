import {
  IconBrandInstagram,
  IconBrandSoundcloud,
  IconBrandSpotify,
  IconBrandTiktok,
  IconBrandYoutube,
} from "@tabler/icons-react";
import { createFileRoute } from "@tanstack/react-router";
import DarkVeil from "#/components/react-bits/dark-veil.tsx";
import { HomeHero } from "#/containers/home/home-hero.tsx";

const socialLinks = [
  {
    href: "https://instagram.com/",
    label: "Instagram",
    Icon: IconBrandInstagram,
  },
  {
    href: "https://tiktok.com/",
    label: "TikTok",
    Icon: IconBrandTiktok,
  },
  {
    href: "https://open.spotify.com/",
    label: "Spotify",
    Icon: IconBrandSpotify,
  },
  {
    href: "https://youtube.com/",
    label: "YouTube",
    Icon: IconBrandYoutube,
  },
  {
    href: "https://soundcloud.com/",
    label: "SoundCloud",
    Icon: IconBrandSoundcloud,
  },
] as const;

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main id="top" className="relative overflow-hidden pt-20">
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

      <HomeHero />
    </main>
  );
}
