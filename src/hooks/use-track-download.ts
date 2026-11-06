import posthog from "posthog-js";
import { useEffect, useRef, useState } from "react";
import {
  type DownloadFormat,
  type DownloadMode,
  downloadSequential,
  downloadSingle,
  downloadZipToDisk,
  getDownloadMode,
  isAbortError,
  requestZipFileHandle,
  supportsStreamingSave,
  type ZipProgress,
} from "#/lib/downloads.ts";
import type { Song } from "#/lib/providers.ts";

export type TrackDownloadStatus =
  | { state: "idle" }
  | ({ state: "zipping" } & ZipProgress)
  | { state: "sequential"; filesDone: number; fileCount: number }
  | { state: "done"; mode: DownloadMode; fileCount: number }
  | { state: "error" };

type StartedInfo = { songs: Song[]; format: DownloadFormat; mode: DownloadMode };

function trackDownload({ songs, format, mode }: StartedInfo) {
  if (!posthog.__loaded) {
    return;
  }

  posthog.capture("free_download", {
    tracks: songs.map((song) => song.slug),
    track_count: songs.length,
    format,
    mode,
  });
}

/**
 * Picks the right download strategy for a selection and exposes its progress:
 * - 1 track: plain file download
 * - several tracks + File System Access API: one ZIP streamed to disk
 * - several tracks otherwise: files downloaded one after another
 */
export function useTrackDownload({ onStarted }: { onStarted?: (info: StartedInfo) => void } = {}) {
  const [status, setStatus] = useState<TrackDownloadStatus>({ state: "idle" });
  const [canStreamToDisk, setCanStreamToDisk] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Feature detection only runs on the client, so the SSR markup stays stable.
  useEffect(() => {
    setCanStreamToDisk(supportsStreamingSave());

    return () => abortRef.current?.abort();
  }, []);

  const isBusy = status.state === "zipping" || status.state === "sequential";

  function markStarted(info: StartedInfo) {
    trackDownload(info);
    onStarted?.(info);
  }

  function handleFailure(error: unknown, controller: AbortController | null) {
    if (isAbortError(error) || controller?.signal.aborted) {
      setStatus({ state: "idle" });
      return;
    }

    console.error("[Download] Failed", error);
    setStatus({ state: "error" });
  }

  /** Must be called directly from a click handler (the save dialog needs the user gesture). */
  function start(songs: Song[], format: DownloadFormat) {
    if (songs.length === 0 || isBusy) {
      return;
    }

    const mode = getDownloadMode(songs.length, canStreamToDisk);
    const info = { songs, format, mode } satisfies StartedInfo;
    const [firstSong] = songs;

    if (mode === "single" && firstSong) {
      downloadSingle(firstSong, format);
      setStatus({ state: "done", mode, fileCount: 1 });
      markStarted(info);
      return;
    }

    if (mode === "zip") {
      // Called synchronously so the browser still sees the click as the trigger.
      const handlePromise = requestZipFileHandle();
      let controller: AbortController | null = null;

      handlePromise
        .then(async (handle) => {
          controller = new AbortController();
          abortRef.current = controller;
          setStatus({
            state: "zipping",
            loaded: 0,
            total: null,
            filesDone: 0,
            fileCount: songs.length,
          });
          markStarted(info);

          await downloadZipToDisk({
            handle,
            songs,
            format,
            signal: controller.signal,
            onProgress: (progress) => setStatus({ state: "zipping", ...progress }),
          });

          setStatus({ state: "done", mode, fileCount: songs.length });
        })
        .catch((error: unknown) => handleFailure(error, controller))
        .finally(() => {
          if (abortRef.current === controller) {
            abortRef.current = null;
          }
        });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ state: "sequential", filesDone: 0, fileCount: songs.length });
    markStarted(info);

    downloadSequential(songs, format, {
      signal: controller.signal,
      onProgress: (filesDone, fileCount) =>
        setStatus({ state: "sequential", filesDone, fileCount }),
    })
      .then(() => setStatus({ state: "done", mode, fileCount: songs.length }))
      .catch((error: unknown) => handleFailure(error, controller))
      .finally(() => {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      });
  }

  function cancel() {
    abortRef.current?.abort();
  }

  function reset() {
    if (!isBusy) {
      setStatus({ state: "idle" });
    }
  }

  return { status, isBusy, canStreamToDisk, start, cancel, reset };
}
