import { downloadZip } from "client-zip";
import {
  isAbortError,
  requestZipFileHandle,
  supportsStreamingSave,
  triggerAnchorDownload,
  type ZipProgress,
} from "./downloads.ts";
import {
  getZipArchiveName,
  getZipEntryPath,
  type PressKitFileNode,
  type PressKitFolderNode,
} from "./presskit.ts";

export { isAbortError, requestZipFileHandle, supportsStreamingSave };
export type { ZipProgress };

export function downloadPressKitFile(file: PressKitFileNode) {
  triggerAnchorDownload(file.url, file.name);
}

function createZipInputGenerator({
  files,
  baseFolder,
  signal,
  onFileDone,
}: {
  files: PressKitFileNode[];
  baseFolder: PressKitFolderNode;
  signal: AbortSignal;
  onFileDone: (filesDone: number) => void;
}) {
  return async function* generate() {
    let filesDone = 0;

    for (const file of files) {
      const response = await fetch(file.url, { signal });

      if (!response.ok || !response.body) {
        throw new Error(`Could not fetch ${file.path} (${response.status})`);
      }

      yield {
        name: getZipEntryPath(file, baseFolder),
        lastModified: new Date(file.modifiedAt),
        input: response.body,
      };

      filesDone += 1;
      onFileDone(filesDone);
    }
  };
}

const PROGRESS_THROTTLE_MS = 80;

function createThrottledProgressReporter(onProgress: (progress: ZipProgress) => void) {
  let lastEmit = 0;

  return (progress: ZipProgress, force = false) => {
    const now = performance.now();
    if (force || now - lastEmit >= PROGRESS_THROTTLE_MS) {
      lastEmit = now;
      onProgress({
        ...progress,
        loaded: progress.total ? Math.min(progress.loaded, progress.total) : progress.loaded,
      });
    }
  };
}

/**
 * Streams a Press Kit folder (or the full Press Pack) into a ZIP written directly to `handle`.
 * Keeps memory usage flat on Chromium browsers with the File System Access API.
 */
export async function downloadPressKitZipToDisk({
  handle,
  files,
  baseFolder,
  signal,
  onProgress,
}: {
  handle: FileSystemFileHandle;
  files: PressKitFileNode[];
  baseFolder: PressKitFolderNode;
  signal: AbortSignal;
  onProgress: (progress: ZipProgress) => void;
}) {
  const total = files.reduce((sum, file) => sum + file.size, 0) || null;
  const progress: ZipProgress = { loaded: 0, total, filesDone: 0, fileCount: files.length };
  const emitProgress = createThrottledProgressReporter(onProgress);
  emitProgress(progress, true);

  const entries = createZipInputGenerator({
    files,
    baseFolder,
    signal,
    onFileDone: (filesDone) => {
      progress.filesDone = filesDone;
      emitProgress(progress, true);
    },
  });

  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      progress.loaded += chunk.byteLength;
      emitProgress(progress);
      controller.enqueue(chunk);
    },
  });

  const zipBody = downloadZip(entries()).body;

  if (!zipBody) {
    throw new Error("Could not create the ZIP stream");
  }

  const writable = await handle.createWritable();

  await zipBody.pipeThrough(counter, { signal }).pipeTo(writable, { signal });

  emitProgress(
    {
      ...progress,
      filesDone: files.length,
      loaded: progress.total ?? progress.loaded,
    },
    true,
  );
}

/**
 * Fallback ZIP builder for browsers without `showSaveFilePicker` (Firefox, Safari, mobile).
 * Preserves the exact Press Kit folder structure inside a single downloaded `.zip`.
 */
export async function downloadPressKitZipBlob({
  files,
  baseFolder,
  signal,
  onProgress,
}: {
  files: PressKitFileNode[];
  baseFolder: PressKitFolderNode;
  signal: AbortSignal;
  onProgress: (progress: ZipProgress) => void;
}) {
  const total = files.reduce((sum, file) => sum + file.size, 0) || null;
  const progress: ZipProgress = { loaded: 0, total, filesDone: 0, fileCount: files.length };
  const emitProgress = createThrottledProgressReporter(onProgress);
  emitProgress(progress, true);

  const entries = createZipInputGenerator({
    files,
    baseFolder,
    signal,
    onFileDone: (filesDone) => {
      progress.filesDone = filesDone;
      emitProgress(progress, true);
    },
  });

  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      progress.loaded += chunk.byteLength;
      emitProgress(progress);
      controller.enqueue(chunk);
    },
  });

  const zipBody = downloadZip(entries()).body;

  if (!zipBody) {
    throw new Error("Could not create the ZIP stream");
  }

  const response = new Response(zipBody.pipeThrough(counter, { signal }));
  const blob = await response.blob();

  if (signal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const objectUrl = URL.createObjectURL(blob);

  try {
    triggerAnchorDownload(objectUrl, getZipArchiveName(baseFolder));
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  }

  emitProgress(
    {
      ...progress,
      filesDone: files.length,
      loaded: progress.total ?? progress.loaded,
    },
    true,
  );
}
