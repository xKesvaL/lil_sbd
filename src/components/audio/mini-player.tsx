import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AudioPlayer,
  AudioPlayerPlay,
  AudioPlayerSeekBar,
  AudioPlayerSkipBack,
  AudioPlayerSkipForward,
  AudioPlayerTimeDisplay,
  AudioPlayerVolume,
} from "#/components/audio/player.tsx";
import { useAudioStore } from "#/lib/audio-store.ts";
import { sortedSongs } from "#/lib/songs.ts";
import { cn } from "#/lib/utils.ts";

/**
 * Sticky bottom audio bar shown on non-home routes or when the homepage hero player
 * has scrolled out of view while a track has been played/interacted with.
 */
export function MiniPlayer() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const currentTime = useAudioStore((s) => s.currentTime);
  const [hasActivated, setHasActivated] = useState(false);
  const [heroVisible, setHeroVisible] = useState(true);

  useEffect(() => {
    if (isPlaying || currentTime > 0) {
      setHasActivated(true);
    }
  }, [isPlaying, currentTime]);

  const isHomeRoute = pathname === "/" || /^\/(en|fr|de)\/?$/.test(pathname);

  useEffect(() => {
    if (!isHomeRoute) {
      setHeroVisible(false);
      return;
    }

    const heroPlayer = document.getElementById("hero-player");
    if (!heroPlayer || typeof IntersectionObserver === "undefined") {
      setHeroVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setHeroVisible(entry ? entry.isIntersecting : true);
      },
      { threshold: 0.1 },
    );

    observer.observe(heroPlayer);
    return () => observer.disconnect();
  }, [isHomeRoute]);

  const song = sortedSongs.find((s) => s.slug === currentTrack?.id) ?? sortedSongs[0];
  const shouldShow = Boolean(song) && hasActivated && (!isHomeRoute || !heroVisible);

  if (!shouldShow || !song) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Audio player"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/85 backdrop-blur-xl shadow-[0_-16px_48px_-16px_rgba(0,0,0,0.85)]",
      )}
    >
      <div className="kcontainer py-2.5">
        <AudioPlayer size="sm" className="bg-transparent p-0 ring-0 shadow-none">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex items-center justify-between gap-3 sm:min-w-0 sm:flex-1">
              <div className="flex min-w-0 items-center gap-3">
                {song.artworkUrl ? (
                  <img
                    src={song.artworkUrl}
                    alt={song.title}
                    className="size-10 shrink-0 border border-white/10 object-cover"
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-tight">{song.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {song.artists.join(" & ")}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <AudioPlayerSkipBack size="icon-sm" />
                <AudioPlayerPlay size="icon-sm" />
                <AudioPlayerSkipForward size="icon-sm" />
                <AudioPlayerVolume size="icon-sm" variant="ghost" />
              </div>
            </div>

            <div className="flex items-center gap-2.5 sm:w-72 md:w-88 lg:w-md">
              <AudioPlayerTimeDisplay className="min-w-10 text-xs" />
              <AudioPlayerSeekBar />
              <AudioPlayerTimeDisplay remaining className="min-w-10 text-xs" />
            </div>
          </div>
        </AudioPlayer>
      </div>
    </div>
  );
}
