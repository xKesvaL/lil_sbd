export const listenProviderOrder = [
  "spotify",
  "soundcloud",
  "youtubeMusic",
  "appleMusic",
  "youtube",
] as const;

export type ListenProvider = (typeof listenProviderOrder)[number];

export interface Song {
  slug: string;
  title: string;
  artist: string;
  releaseDate: string;
  artworkUrl?: string;
  links: Partial<Record<ListenProvider, string>>;
}

export const songs: Song[] = [
  {
    slug: "fracture-drive",
    title: "Fracture Drive",
    artist: "Lil SBD",
    releaseDate: "2026-04-18",
    links: {
      spotify: "https://open.spotify.com/track/placeholder-fracture-drive",
      soundcloud: "https://soundcloud.com/lil-sbd/fracture-drive",
      youtubeMusic: "https://music.youtube.com/watch?v=placeholder-fracture-drive",
      appleMusic: "https://music.apple.com/us/song/fracture-drive-placeholder",
      youtube: "https://www.youtube.com/watch?v=placeholder-fracture-drive",
    },
  },
  {
    slug: "steel-pressure",
    title: "Steel Pressure",
    artist: "Lil SBD",
    releaseDate: "2025-11-09",
    artworkUrl:
      "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=640&q=80",
    links: {
      spotify: "https://open.spotify.com/track/placeholder-steel-pressure",
      soundcloud: "https://soundcloud.com/lil-sbd/steel-pressure",
      youtubeMusic: "https://music.youtube.com/watch?v=placeholder-steel-pressure",
      youtube: "https://www.youtube.com/watch?v=placeholder-steel-pressure",
    },
  },
];

function toReleaseTimestamp(song: Song) {
  return new Date(song.releaseDate).getTime();
}

export function compareSongsByReleaseDate(a: Song, b: Song) {
  return toReleaseTimestamp(b) - toReleaseTimestamp(a);
}

export function getLatestSong(songList: Song[]) {
  return [...songList].sort(compareSongsByReleaseDate)[0] ?? null;
}

export const latestSong = getLatestSong(songs);
