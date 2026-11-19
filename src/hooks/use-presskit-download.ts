import posthog from "posthog-js";
import { useEffect, useRef, useState } from "react";
import {
  collectPressKitFiles,
  getZipArchiveName,
  type PressKitFileNode,
  type PressKitFolderNode,
} from "#/lib/presskit.ts";
import {
  downloadPressKitFile,
  downloadPressKitZipBlob,
  downloadPressKitZipToDisk,
  isAbortError,
  requestZipFileHandle,
  supportsStreamingSave,
  type ZipProgress,
} from "#/lib/presskit-downloads.ts";

export type PressKitDownloadStatus =
  | { state: "idle" }
  | ({ state: "zipping"; targetName: string } & ZipProgress)
  | { state: "done"; kind: "file" | "zip"; targetName: string; fileCount: number }
  | { state: "error"; targetName: string };

function capturePressKitDownload(payload: {
  kind: "file" | "folder_zip" | "pack_zip";
  target: string;
  fileCount: number;
}) {
  if (!posthog.__loaded) {
    return;
  }

  posthog.capture("presskit_download", {
    kind: payload.kind,
    target: payload.target,
    file_count: payload.fileCount,
  });
}

export function usePressKitDownload() {
  const [status, setStatus] = useState<PressKitDownloadStatus>({ state: "idle" });
  const [canStreamToDisk, setCanStreamToDisk] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setCanStreamToDisk(supportsStreamingSave());

    return () => abortRef.current?.abort();
  }, []);

  const isBusy = status.state === "zipping";

  function handleFailure(error: unknown, controller: AbortController | null, targetName: string) {
    if (isAbortError(error) || controller?.signal.aborted) {
      setStatus({ state: "idle" });
      return;
    }

    console.error("[PressKit Download] Failed", error);
    setStatus({ state: "error", targetName });
  }

  function downloadFile(file: PressKitFileNode) {
    if (isBusy) {
      return;
    }

    downloadPressKitFile(file);
    setStatus({ state: "done", kind: "file", targetName: file.name, fileCount: 1 });
    capturePressKitDownload({ kind: "file", target: file.path, fileCount: 1 });
  }

  /** Must be invoked directly from a user click handler so `showSaveFilePicker` receives the gesture. */
  function downloadFolderZip(folder: PressKitFolderNode) {
    if (isBusy) {
      return;
    }

    const files = collectPressKitFiles(folder.id);

    if (files.length === 0) {
      return;
    }

    const archiveName = getZipArchiveName(folder);
    const kind = folder.path ? "folder_zip" : "pack_zip";

    if (canStreamToDisk) {
      const handlePromise = requestZipFileHandle(archiveName);
      let controller: AbortController | null = null;

      handlePromise
        .then(async (handle) => {
          controller = new AbortController();
          abortRef.current = controller;
          setStatus({
            state: "zipping",
            targetName: folder.name,
            loaded: 0,
            total: folder.totalSize || null,
            filesDone: 0,
            fileCount: files.length,
          });
          capturePressKitDownload({ kind, target: folder.path || folder.name, fileCount: files.length });

          await downloadPressKitZipToDisk({
            handle,
            files,
            baseFolder: folder,
            signal: controller.signal,
            onProgress: (progress) =>
              setStatus({ state: "zipping", targetName: folder.name, ...progress }),
          });

          setStatus({
            state: "done",
            kind: "zip",
            targetName: archiveName,
            fileCount: files.length,
          });
        })
        .catch((error: unknown) => handleFailure(error, controller, folder.name))
        .finally(() => {
          if (abortRef.current === controller) {
            abortRef.current = null;
          }
        });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({
      state: "zipping",
      targetName: folder.name,
      loaded: 0,
      total: folder.totalSize || null,
      filesDone: 0,
      fileCount: files.length,
    });
    capturePressKitDownload({ kind, target: folder.path || folder.name, fileCount: files.length });

    downloadPressKitZipBlob({
      files,
      baseFolder: folder,
      signal: controller.signal,
      onProgress: (progress) =>
        setStatus({ state: "zipping", targetName: folder.name, ...progress }),
    })
      .then(() =>
        setStatus({
          state: "done",
          kind: "zip",
          targetName: archiveName,
          fileCount: files.length,
        }),
      )
      .catch((error: unknown) => handleFailure(error, controller, folder.name))
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

  return { status, isBusy, downloadFile, downloadFolderZip, cancel, reset };
}
