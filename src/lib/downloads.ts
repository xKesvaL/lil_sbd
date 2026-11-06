import { downloadZip } from "client-zip";
import type { Song } from "./providers";

export const downloadFormats = ["wav", "mp3"] as const;

export type DownloadFormat = (typeof downloadFormats)[number];

/** How a download request gets fulfilled. */
export type DownloadMode = "single" | "zip" | "sequential";

export type ZipProgress = {
  /** Bytes written to the ZIP so far. */
  loaded: number;
  /** Sum of the source file sizes, or `null` when the server doesn't expose them. */
  total: number | null;
  filesDone: number;
  fileCount: number;
};

export const ZIP_FILE_NAME = "LIL SBD - Free downloads.zip";

const SEQUENTIAL_DOWNLOAD_DELAY_MS = 700;

export const isDownloadFormat = (value: unknown): value is DownloadFormat =>
  typeof value === "string" && (downloadFormats as readonly string[]).includes(value);

export const getSongFileUrl = (song: Song, format: DownloadFormat) =>
  format === "wav" ? song.urlWAV : song.urlMP3;

/** Strips characters that are illegal in file names on Windows, macOS, or Linux. */
export function sanitizeFileName(name: string) {
  return (
    name
      // oxlint-disable-next-line no-control-regex -- control chars are invalid in file names
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      // Windows refuses trailing dots and spaces.
      .replace(/[. ]+$/, "")
  );
}

/** e.g. "LIL SBD - INDUZAAG.wav" */
export const getSongFileName = (song: Song, format: DownloadFormat) =>
  `${sanitizeFileName(`${song.artists.join(" & ")} - ${song.title}`)}.${format}`;

/**
 * Parses the `?track=` search param (`induzaag` or `induzaag,kino`) into slugs that exist in
 * `songs`, keeping the order of `songs` and dropping duplicates and unknown values.
 */
export function parseTrackParam(value: unknown, songs: Song[]): string[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  const requested = new Set(
    value
      .split(",")
      .map((slug) => slug.trim().toLowerCase())
      .filter(Boolean),
  );

  return songs.filter((song) => requested.has(song.slug.toLowerCase())).map((song) => song.slug);
}

export function getDownloadMode(count: number, canStreamToDisk: boolean): DownloadMode {
  if (count <= 1) {
    return "single";
  }

  return canStreamToDisk ? "zip" : "sequential";
}

const byteUnits = ["B", "KB", "MB", "GB"] as const;

/** Human readable size, e.g. "48.6 MB". Uses 1024 steps like most file managers. */
export function formatBytes(bytes: number, locale?: string) {
  let value = Math.max(0, bytes);
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < byteUnits.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: unitIndex >= 2 ? 1 : 0,
  }).format(value);

  return `${formatted} ${byteUnits[unitIndex]}`;
}

type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
};

type WindowWithSaveFilePicker = Window &
  typeof globalThis & {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  };

/** True when the browser can stream a ZIP straight to disk (Chromium's File System Access API). */
export function supportsStreamingSave(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof (window as WindowWithSaveFilePicker).showSaveFilePicker === "function"
  );
}

/**
 * Opens the native "Save as" dialog for the ZIP.
 * Must be called synchronously from a user gesture (click handler), before any `await`.
 */
export function requestZipFileHandle(): Promise<FileSystemFileHandle> {
  const picker = (window as WindowWithSaveFilePicker).showSaveFilePicker;

  if (!picker) {
    return Promise.reject(new Error("showSaveFilePicker is not supported"));
  }

  return picker({
    suggestedName: ZIP_FILE_NAME,
    types: [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }],
  });
}

export const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

function triggerAnchorDownload(url: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function downloadSingle(song: Song, format: DownloadFormat) {
  triggerAnchorDownload(getSongFileUrl(song, format), getSongFileName(song, format));
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timeout = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() {
      window.clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Fallback for browsers without streaming saves: one regular download per file. */
export async function downloadSequential(
  songs: Song[],
  format: DownloadFormat,
  {
    signal,
    onProgress,
  }: { signal?: AbortSignal; onProgress?: (filesDone: number, fileCount: number) => void } = {},
) {
  for (const [index, song] of songs.entries()) {
    if (index > 0) {
      await wait(SEQUENTIAL_DOWNLOAD_DELAY_MS, signal);
    }

    downloadSingle(song, format);
    onProgress?.(index + 1, songs.length);
  }
}

async function fetchFileSize(url: string, signal: AbortSignal) {
  try {
    const response = await fetch(url, { method: "HEAD", signal });
    const size = Number(response.headers.get("content-length"));

    return response.ok && Number.isFinite(size) && size > 0 ? size : null;
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    return null;
  }
}

/**
 * Streams the selected files into a ZIP written directly to `handle`, so memory use stays flat
 * no matter how many WAVs are selected. Aborting discards the partially written file.
 */
export async function downloadZipToDisk({
  handle,
  songs,
  format,
  signal,
  onProgress,
}: {
  handle: FileSystemFileHandle;
  songs: Song[];
  format: DownloadFormat;
  signal: AbortSignal;
  onProgress: (progress: ZipProgress) => void;
}) {
  const sizes = await Promise.all(
    songs.map((song) => fetchFileSize(getSongFileUrl(song, format), signal)),
  );
  const total = sizes.every((size) => size !== null)
    ? sizes.reduce<number>((sum, size) => sum + (size ?? 0), 0)
    : null;

  const progress: ZipProgress = { loaded: 0, total, filesDone: 0, fileCount: songs.length };
  onProgress({ ...progress });

  async function* files() {
    for (const song of songs) {
      const response = await fetch(getSongFileUrl(song, format), { signal });

      if (!response.ok || !response.body) {
        throw new Error(`Could not fetch ${song.slug} (${response.status})`);
      }

      yield {
        name: getSongFileName(song, format),
        lastModified: song.releaseDate,
        input: response.body,
      };

      progress.filesDone += 1;
    }
  }

  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      progress.loaded += chunk.byteLength;
      onProgress({
        ...progress,
        loaded: progress.total ? Math.min(progress.loaded, progress.total) : progress.loaded,
      });
      controller.enqueue(chunk);
    },
  });

  const zipBody = downloadZip(files()).body;

  if (!zipBody) {
    throw new Error("Could not create the ZIP stream");
  }

  const writable = await handle.createWritable();

  await zipBody.pipeThrough(counter, { signal }).pipeTo(writable, { signal });

  onProgress({ ...progress, filesDone: songs.length, loaded: progress.total ?? progress.loaded });
}
