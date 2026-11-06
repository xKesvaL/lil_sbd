import { describe, expect, it, vi } from "vite-plus/test";
import {
  downloadZipToDisk,
  formatBytes,
  getDownloadMode,
  getSongFileName,
  getSongFileUrl,
  isAbortError,
  isDownloadFormat,
  parseTrackParam,
  sanitizeFileName,
  type ZipProgress,
} from "./downloads.ts";
import type { Song } from "./providers.ts";
import { downloadableSongs, isDownloadable, sortedSongs } from "./songs.ts";

const makeSong = (overrides: Partial<Song> = {}): Song => ({
  slug: "induzaag",
  title: "INDUZAAG",
  artists: ["LIL SBD"],
  releaseDate: new Date("2026-09-17"),
  urlWAV: "/songs/induzaag.wav",
  urlMP3: "/songs/induzaag.mp3",
  links: { soundcloud: "https://soundcloud.com/lil_sbd/induzaag", youtube: "https://youtu.be/x" },
  ...overrides,
});

describe("sanitizeFileName", () => {
  it("removes characters that are illegal on common file systems", () => {
    expect(sanitizeFileName('A/B\\C:D*E?F"G<H>I|J')).toBe("ABCDEFGHIJ");
  });

  it("collapses whitespace and strips trailing dots and spaces", () => {
    expect(sanitizeFileName("  CAFFEINE   (THE ASYLUM) .. ")).toBe("CAFFEINE (THE ASYLUM)");
  });
});

describe("getSongFileName / getSongFileUrl", () => {
  it("joins artists and title with the right extension", () => {
    const song = makeSong({
      title: "PARTY STARTED",
      artists: ["Infliction", "Chapter V", "LIL SBD"],
    });

    expect(getSongFileName(song, "wav")).toBe(
      "Infliction & Chapter V & LIL SBD - PARTY STARTED.wav",
    );
    expect(getSongFileName(song, "mp3")).toBe(
      "Infliction & Chapter V & LIL SBD - PARTY STARTED.mp3",
    );
  });

  it("sanitizes titles", () => {
    expect(getSongFileName(makeSong({ title: "WHAT?/NOW" }), "mp3")).toBe("LIL SBD - WHATNOW.mp3");
  });

  it("picks the URL for the requested format", () => {
    const song = makeSong();

    expect(getSongFileUrl(song, "wav")).toBe("/songs/induzaag.wav");
    expect(getSongFileUrl(song, "mp3")).toBe("/songs/induzaag.mp3");
  });
});

describe("parseTrackParam", () => {
  const songs = [
    makeSong({ slug: "induzaag" }),
    makeSong({ slug: "kino" }),
    makeSong({ slug: "poker-face" }),
  ];

  it("returns nothing for empty or invalid values", () => {
    expect(parseTrackParam(undefined, songs)).toEqual([]);
    expect(parseTrackParam("", songs)).toEqual([]);
    expect(parseTrackParam("   ", songs)).toEqual([]);
    expect(parseTrackParam(42, songs)).toEqual([]);
  });

  it("parses a single slug", () => {
    expect(parseTrackParam("kino", songs)).toEqual(["kino"]);
  });

  it("parses comma separated slugs, ignoring case, spaces, duplicates and unknown slugs", () => {
    expect(parseTrackParam(" POKER-FACE , nope,induzaag,induzaag", songs)).toEqual([
      "induzaag",
      "poker-face",
    ]);
  });
});

describe("getDownloadMode", () => {
  it("downloads a single track directly", () => {
    expect(getDownloadMode(1, true)).toBe("single");
    expect(getDownloadMode(1, false)).toBe("single");
  });

  it("zips several tracks when the browser can stream to disk", () => {
    expect(getDownloadMode(3, true)).toBe("zip");
  });

  it("falls back to sequential downloads otherwise", () => {
    expect(getDownloadMode(3, false)).toBe("sequential");
  });
});

describe("formatBytes / isDownloadFormat", () => {
  it("formats sizes with 1024 steps", () => {
    expect(formatBytes(512, "en")).toBe("512 B");
    expect(formatBytes(2048, "en")).toBe("2 KB");
    expect(formatBytes(48.6 * 1024 * 1024, "en")).toBe("48.6 MB");
    expect(formatBytes(1.5 * 1024 ** 3, "en")).toBe("1.5 GB");
  });

  it("validates formats", () => {
    expect(isDownloadFormat("wav")).toBe(true);
    expect(isDownloadFormat("mp3")).toBe(true);
    expect(isDownloadFormat("flac")).toBe(false);
    expect(isDownloadFormat(undefined)).toBe(false);
  });
});

describe("downloadableSongs", () => {
  it("treats songs as downloadable unless explicitly disabled", () => {
    expect(isDownloadable(makeSong())).toBe(true);
    expect(isDownloadable(makeSong({ downloadable: true }))).toBe(true);
    expect(isDownloadable(makeSong({ downloadable: false }))).toBe(false);
  });

  it("is derived from songs.ts and keeps the release order", () => {
    expect(downloadableSongs).toEqual(sortedSongs.filter((song) => song.downloadable !== false));
    expect(downloadableSongs.length).toBeGreaterThan(0);
  });

  it("only points at files that exist in /public/songs", async () => {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");

    for (const song of downloadableSongs) {
      for (const url of [song.urlWAV, song.urlMP3]) {
        expect(existsSync(join(process.cwd(), "public", url)), url).toBe(true);
      }
    }
  });
});

describe("downloadZipToDisk / isAbortError", () => {
  it("streams fetched tracks into a valid ZIP on the provided FileSystemFileHandle", async () => {
    const songs = [
      makeSong({ slug: "induzaag", title: "INDUZAAG" }),
      makeSong({ slug: "kino", title: "KINO", urlMP3: "/songs/kino.mp3" }),
    ];
    const payloads: Record<string, string> = {
      "/songs/induzaag.mp3": "fake-mp3-induzaag-bytes",
      "/songs/kino.mp3": "fake-mp3-kino-bytes-longer",
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const body = payloads[url];
      if (!body) {
        return new Response(null, { status: 404 });
      }
      if (init?.method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: { "content-length": String(body.length) },
        });
      }
      return new Response(body, {
        status: 200,
        headers: { "content-length": String(body.length) },
      });
    });

    const writtenChunks: Uint8Array[] = [];
    const writable = new WritableStream<Uint8Array>({
      write(chunk) {
        writtenChunks.push(chunk);
      },
    });

    const handle = {
      createWritable: async () => writable as unknown as FileSystemWritableFileStream,
    } as unknown as FileSystemFileHandle;

    const updates: ZipProgress[] = [];

    try {
      await downloadZipToDisk({
        handle,
        songs,
        format: "mp3",
        signal: new AbortController().signal,
        onProgress: (p) => updates.push(p),
      });
    } finally {
      fetchSpy.mockRestore();
    }

    const totalExpected =
      payloads["/songs/induzaag.mp3"].length + payloads["/songs/kino.mp3"].length;
    const last = updates.at(-1);
    expect(last).toBeDefined();
    expect(last?.filesDone).toBe(2);
    expect(last?.fileCount).toBe(2);
    expect(last?.total).toBe(totalExpected);
    expect(last?.loaded).toBe(totalExpected);

    // Verify PK\x03\x04 ZIP local file header magic bytes and file names in archive
    const totalLength = writtenChunks.reduce((acc, c) => acc + c.byteLength, 0);
    const zipBytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of writtenChunks) {
      zipBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    expect(zipBytes[0]).toBe(0x50); // 'P'
    expect(zipBytes[1]).toBe(0x4b); // 'K'
    const decoded = new TextDecoder().decode(zipBytes);
    expect(decoded).toContain("LIL SBD - INDUZAAG.mp3");
    expect(decoded).toContain("LIL SBD - KINO.mp3");
  });

  it("detects DOMException AbortError", () => {
    expect(isAbortError(new DOMException("Cancelled", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("AbortError"))).toBe(false);
  });
});
