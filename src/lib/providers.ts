import { IconBrandApple, IconBrandSoundcloud, IconBrandSpotify } from "@tabler/icons-react";
import type { ComponentType, SVGProps } from "react";
import { IconBrandYoutubeMusic } from "#/components/icons/icon-brand-youtube-music.tsx";
import { m } from "#/paraglide/messages";

export const listenProviderOrder = ["spotify", "soundcloud", "youtubeMusic", "appleMusic"] as const;

export type ListenProvider = (typeof listenProviderOrder)[number];

export interface Song {
  slug: string;
  title: string;
  artists: string[];
  releaseDate: Date;
  artworkUrl?: string;
  links: Partial<Record<ListenProvider, string>>;
  urlWAV: string;
  urlMP3: string;
  album?: string;
}

type ProviderConfig = {
  label: () => string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  className: string;
};

export const providerConfig: Record<ListenProvider, ProviderConfig> = {
  spotify: {
    label: () => m["common.spotify"](),
    Icon: IconBrandSpotify,
    className:
      "bg-[#1ed760] text-[#03150b] hover:text-[#03150b] hover:bg-[#34e26f] focus-visible:ring-[#1ed760]/40",
  },
  soundcloud: {
    label: () => m["common.soundcloud"](),
    Icon: IconBrandSoundcloud,
    className:
      "bg-linear-to-r from-[#ff6a00] to-[#ff8f1f] text-white hover:from-[#ff7a1a] hover:to-[#ffa43d] focus-visible:ring-[#ff7a1a]/40",
  },
  youtubeMusic: {
    label: () => m["common.youtube_music"](),
    Icon: IconBrandYoutubeMusic,
    className: "bg-[#f30045] text-white hover:bg-[#ff245f] focus-visible:ring-[#f30045]/40",
  },
  appleMusic: {
    label: () => m["common.apple_music"](),
    Icon: IconBrandApple,
    className:
      "bg-linear-to-r from-[#fa243c] to-[#fb5c74] text-white hover:from-[#ff3d56] hover:to-[#ff7288] focus-visible:ring-[#fb5c74]/40",
  },
};
