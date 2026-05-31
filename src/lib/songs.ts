import type { Track } from "./html-audio";
import type { Song } from "./providers";

export const songs: Song[] = [
  {
    slug: "ascension",
    title: "ASCENSION",
    artists: ["LIL SBD"],
    releaseDate: new Date("2026-06-11"),
    artworkUrl: "/covers/DEAD-OPS.png",
    urlWAV: "/songs/ascension.wav",
    urlMP3: "/songs/ascension.mp3",
    links: {},
    album: "DEAD OPS EP",
  },
  {
    slug: "lock-the-doors",
    title: "LOCK THE DOORS",
    artists: ["LIL SBD"],
    releaseDate: new Date("2026-06-11"),
    artworkUrl: "/covers/LOCK-THE-DOORS.png",
    urlWAV: "/songs/lock-the-doors.wav",
    urlMP3: "/songs/lock-the-doors.mp3",
    links: {},
    album: "DEAD OPS EP",
  },
  {
    slug: "kino",
    title: "KINO",
    artists: ["LIL SBD"],
    releaseDate: new Date("2026-05-28"),
    artworkUrl: "/covers/KINO.png",
    urlWAV: "/songs/kino.wav",
    urlMP3: "/songs/kino.mp3",
    links: {
      spotify: "https://open.spotify.com/track/4Pb0leKqg8EWiWn0O7Q1Cs?si=084511c4da4b4bdd",
      soundcloud: "https://soundcloud.com/lil_sbd/kino",
      youtubeMusic: "https://music.youtube.com/watch?v=mZSCRoMZFC4&si=VwBNskgwB7I8_Eqg",
      appleMusic: "https://music.apple.com/fr/song/kino/6771994766",
    },
    album: "DEAD OPS EP",
  },
  {
    slug: "more-than-friends",
    title: "MORE THAN FRIENDS",
    artists: ["LIL SBD"],
    releaseDate: new Date("2026-04-16"),
    artworkUrl: "/covers/MORE-THAN-FRIENDS.png",
    urlWAV: "/songs/more-than-friends.wav",
    urlMP3: "/songs/more-than-friends.mp3",
    links: {
      spotify: "https://open.spotify.com/track/1C2Hkd8XqZNu3V708Lf9Tj?si=faf581f8f2754f8e",
      soundcloud: "https://soundcloud.com/lil_sbd/more-than-friends",
      youtubeMusic: "https://music.youtube.com/watch?v=Q1U6SSsmxzE&si=J-CdWGBaZ4sJNCbB",
      appleMusic: "https://music.apple.com/fr/song/more-than-friends/6762188183",
    },
  },
  {
    slug: "got-my-back",
    title: "GOT MY BACK",
    artists: ["LIL SBD"],
    releaseDate: new Date("2026-02-26"),
    artworkUrl: "/covers/GOT-MY-BACK.png",
    urlWAV: "/songs/got-my-back.wav",
    urlMP3: "/songs/got-my-back.mp3",
    links: {
      spotify: "https://open.spotify.com/track/0T2AO0GcmNwpCr3Jcd77ej?si=43c957d36a4d49a0",
      soundcloud: "https://soundcloud.com/lil_sbd/got-my-back",
      youtubeMusic: "https://music.youtube.com/watch?v=k2UGcB_PPHk&si=GyrOsadHxGjsMnOA",
      appleMusic: "https://music.apple.com/fr/song/got-my-back/1878913924",
    },
  },
  {
    slug: "we-are-damned",
    title: "WE ARE DAMNED",
    artists: ["LIL SBD"],
    releaseDate: new Date("2026-02-13"),
    artworkUrl: "/covers/WE-ARE-DAMNED.png",
    urlWAV: "/songs/we-are-damned.wav",
    urlMP3: "/songs/we-are-damned.mp3",
    links: {
      spotify: "https://open.spotify.com/track/4g5vuGKqfsGcTLqpnrnrrA?si=5188a2b440e649a4",
      soundcloud: "https://soundcloud.com/lil_sbd/we-are-damned",
      youtubeMusic: "https://music.youtube.com/watch?v=oG2IlqD2C0Q&si=ZW072FUzueTzHKxZ",
      appleMusic: "https://music.apple.com/fr/song/we-are-damned/1876450137",
    },
  },
  {
    slug: "top-of-the-world",
    title: "TOP OF THE WORLD",
    artists: ["LIL SBD"],
    releaseDate: new Date("2026-01-30"),
    artworkUrl: "/covers/HEAVY-SINGLES.png",
    urlWAV: "/songs/top-of-the-world.wav",
    urlMP3: "/songs/top-of-the-world.mp3",
    links: {
      spotify: "https://open.spotify.com/track/6iMXYux1ScBqWN2lAmf5RP?si=67f023fc7fb34a4b",
      soundcloud: "https://soundcloud.com/lil_sbd/top-of-the-world",
      youtubeMusic: "https://music.youtube.com/watch?v=4W5n_TylSIk&si=a6fcbL6d5uy53QoJ",
      appleMusic: "https://music.apple.com/fr/song/top-of-the-world/1871851567",
    },
    album: "HEAVY SINGLES",
  },
  {
    slug: "caffeine",
    title: "CAFFEINE (THE ASYLUM)",
    artists: ["LIL SBD"],
    releaseDate: new Date("2025-12-19"),
    artworkUrl: "/covers/CAFFEINE.png",
    urlWAV: "/songs/caffeine.wav",
    urlMP3: "/songs/caffeine.mp3",
    links: {
      spotify: "https://open.spotify.com/track/22beoRvDMAXySGuBim15pG?si=45df12504f4243ae",
      soundcloud: "https://soundcloud.com/lil_sbd/caffeine",
      youtubeMusic: "https://music.youtube.com/watch?v=HnjNID3GfUw&si=UMjUozCcC1jHyaH6",
      appleMusic: "https://music.apple.com/fr/song/caffeine-the-asylum/1871851566",
    },
    album: "HEAVY SINGLES",
  },
  {
    slug: "3-attempts",
    title: "3 ATTEMPTS",
    artists: ["LIL SBD"],
    releaseDate: new Date("2026-01-30"),
    artworkUrl: "/covers/HEAVY-SINGLES.png",
    urlWAV: "/songs/3-attempts.wav",
    urlMP3: "/songs/3-attempts.mp3",
    links: {
      spotify: "https://open.spotify.com/track/3vduWEZsxBGoalmMiMDQ7c?si=f98f626dd12944d0",
      soundcloud: "https://soundcloud.com/lil_sbd/3-attempts",
      youtubeMusic: "https://music.youtube.com/watch?v=2sZMp4PTgAY&si=8Wr6UscNZhesfaA7",
      appleMusic: "https://music.apple.com/fr/song/3-attempts/1871851565",
    },
    album: "HEAVY SINGLES",
  },
  {
    slug: "squat-day",
    title: "SQUAT DAY",
    artists: ["LIL SBD"],
    releaseDate: new Date("2026-01-30"),
    artworkUrl: "/covers/HEAVY-SINGLES.png",
    urlWAV: "/songs/squat-day.wav",
    urlMP3: "/songs/squat-day.mp3",
    links: {
      spotify: "https://open.spotify.com/track/1Lk0xzWBcGg5cSU27Zs53W?si=c04e0b0aa1924ec3",
      soundcloud: "https://soundcloud.com/lil_sbd/squat-day",
      youtubeMusic: "https://music.youtube.com/watch?v=IHh1Ywp75Fs&si=GD9EevyTQI88yMxe",
      appleMusic: "https://music.apple.com/fr/song/squat-day/1871851563",
    },
    album: "HEAVY SINGLES",
  },
  {
    slug: "opener",
    title: "OPENER",
    artists: ["LIL SBD"],
    releaseDate: new Date("2026-01-30"),
    artworkUrl: "/covers/HEAVY-SINGLES.png",
    urlWAV: "/songs/opener.wav",
    urlMP3: "/songs/opener.mp3",
    links: {
      spotify: "https://open.spotify.com/track/24yw8NRGipy3yMF5pgmoZI?si=32eb39a97e7a4674",
      soundcloud: "https://soundcloud.com/lil_sbd/opener",
      youtubeMusic: "https://music.youtube.com/watch?v=zGCw28R3Tho&si=pLqHwiAqAciGqZnd",
      appleMusic: "https://music.apple.com/fr/song/opener/1871851562",
    },
    album: "HEAVY SINGLES",
  },
  {
    slug: "the-voices",
    title: "THE VOICES",
    artists: ["LIL SBD"],
    releaseDate: new Date("2025-11-20"),
    artworkUrl: "/covers/THE-VOICES.png",
    urlWAV: "/songs/the-voices.wav",
    urlMP3: "/songs/the-voices.mp3",
    links: {
      spotify: "https://open.spotify.com/track/722U9t9cHOyaTb337fGZoc?si=becff47386ab4e35",
      soundcloud: "https://soundcloud.com/lil_sbd/the-voices",
      youtubeMusic: "https://music.youtube.com/watch?v=Uhj_YLb0B7g&si=I3G0eHMfiOpf5SQW",
      appleMusic: "https://music.apple.com/fr/song/the-voices/1853780753",
    },
  },
];

export const songToAudioPlayerTrack = (song: Song): Track => {
  return {
    id: song.slug,
    url: song.urlMP3,
    title: song.title,
    artist: song.artists.join(" & "),
    artwork: song.artworkUrl,
    album: song.album,
  };
};

export const toReleaseTimestamp = (song: Song) => song.releaseDate.getTime();

export const compareSongsByReleaseDate = (a: Song, b: Song) => {
  return toReleaseTimestamp(b) - toReleaseTimestamp(a);
};

export const sortedSongs = songs.sort(compareSongsByReleaseDate);

export const audioPlayerTracks = sortedSongs.map(songToAudioPlayerTrack);

export function getLatestSong(songList: Song[]) {
  return [...songList].sort(compareSongsByReleaseDate)[0] ?? null;
}

export const latestSong = getLatestSong(songs);
