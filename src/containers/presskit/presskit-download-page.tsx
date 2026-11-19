import { IconFileZip, IconFolder } from "@tabler/icons-react";
import { startTransition, useEffect, useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "#/components/ui/sheet.tsx";
import { usePressKitDownload } from "#/hooks/use-presskit-download.ts";
import { formatBytes } from "#/lib/downloads.ts";
import {
  getBreadcrumbs,
  getDirectChildren,
  isFolderNode,
  type PressKitFileNode,
  type PressKitFolderNode,
  pressKitManifest,
  resolveFolderId,
} from "#/lib/presskit.ts";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";
import { type DriveViewMode, PressKitDriveBrowser } from "./presskit-drive-browser.tsx";
import { PressKitTreeSidebar } from "./presskit-tree-sidebar.tsx";

export function PressKitDownloadPage({
  initialPath,
  onPathChange,
}: {
  initialPath?: string;
  onPathChange?: (path: string | undefined) => void;
}) {
  const locale = getLocale();
  const rootNode = pressKitManifest.nodes[pressKitManifest.rootId];
  const rootFolder = isFolderNode(rootNode) ? rootNode : null;

  const [activeFolderId, setActiveFolderId] = useState<string>(() =>
    resolveFolderId(initialPath, pressKitManifest),
  );
  const [highlightedFileId, setHighlightedFileId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<DriveViewMode>("grid");
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);

  useEffect(() => {
    const resolved = resolveFolderId(initialPath, pressKitManifest);
    setActiveFolderId((current) => (current === resolved ? current : resolved));
    setHighlightedFileId((current) => {
      if (!current) {
        return null;
      }
      const node = pressKitManifest.nodes[current];
      return node?.kind === "file" && node.parentId === resolved ? current : null;
    });
  }, [initialPath]);

  const download = usePressKitDownload();

  if (!rootFolder) {
    return null;
  }

  const resolvedNode = pressKitManifest.nodes[activeFolderId];
  const activeFolder: PressKitFolderNode = isFolderNode(resolvedNode) ? resolvedNode : rootFolder;
  const breadcrumbs = getBreadcrumbs(activeFolder.id, pressKitManifest);
  const childrenItems = getDirectChildren(activeFolder.id, pressKitManifest);

  function syncUrlPath(nextPath: string | undefined) {
    if (!onPathChange || nextPath === (initialPath || undefined)) {
      return;
    }

    startTransition(() => {
      onPathChange(nextPath);
    });
  }

  function handleSelectFolder(folderId: string) {
    const nextNode = pressKitManifest.nodes[folderId];
    if (!isFolderNode(nextNode)) {
      return;
    }

    if (nextNode.id !== activeFolderId) {
      setActiveFolderId(nextNode.id);
    }
    if (highlightedFileId !== null) {
      setHighlightedFileId(null);
    }
    setMobileTreeOpen(false);
    syncUrlPath(nextNode.path || undefined);
  }

  function handleSelectFile(file: PressKitFileNode) {
    const parentNode = pressKitManifest.nodes[file.parentId];
    if (isFolderNode(parentNode)) {
      if (parentNode.id !== activeFolderId) {
        setActiveFolderId(parentNode.id);
      }
      syncUrlPath(parentNode.path || undefined);
    }
    setHighlightedFileId(file.id);
    setMobileTreeOpen(false);
  }

  const packSummary =
    rootFolder.fileCount > 0
      ? m["presskit.download.pack_summary"]({
          count: rootFolder.fileCount,
          size: formatBytes(rootFolder.totalSize, locale),
        })
      : m["presskit.download.pack_empty_summary"]();

  return (
    <section className="kcontainer section flex flex-col gap-8">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className="border bg-background/80 px-2 py-1 text-xs font-medium tracking-widest uppercase">
              {m["presskit.download.eyebrow"]()}
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">{packSummary}</span>
          </div>
          <h1 className="text-5xl font-bold italic md:text-6xl">
            {m["presskit.download.title"]()}
          </h1>
          <p className="max-w-3xl text-lg text-muted-foreground">
            {m["presskit.download.description"]()}
          </p>
        </div>

        <Button
          type="button"
          size="lg"
          disabled={download.isBusy || rootFolder.fileCount === 0}
          onClick={() => download.downloadFolderZip(rootFolder)}
          className="w-fit shrink-0"
        >
          <IconFileZip data-icon="inline-start" className="size-4.5" />
          {m["presskit.download.download_pack"]()}
        </Button>
      </div>

      <div className="grid min-h-[28rem] overflow-hidden border bg-background/85 lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        <PressKitTreeSidebar
          manifest={pressKitManifest}
          activeFolderId={activeFolder.id}
          highlightedFileId={highlightedFileId}
          onSelectFolder={handleSelectFolder}
          onSelectFile={handleSelectFile}
          onDownloadFile={download.downloadFile}
          className="hidden border-r lg:flex"
        />

        <PressKitDriveBrowser
          activeFolder={activeFolder}
          breadcrumbs={breadcrumbs}
          childrenItems={childrenItems}
          highlightedFileId={highlightedFileId}
          viewMode={viewMode}
          status={download.status}
          isBusy={download.isBusy}
          onViewModeChange={setViewMode}
          onOpenFolder={handleSelectFolder}
          onDownloadFile={download.downloadFile}
          onDownloadFolder={download.downloadFolderZip}
          onCancelDownload={download.cancel}
          mobileTreeTrigger={
            <Sheet open={mobileTreeOpen} onOpenChange={setMobileTreeOpen}>
              <SheetTrigger
                render={
                  <Button type="button" variant="outline" size="sm" className="lg:hidden" />
                }
              >
                <IconFolder data-icon="inline-start" className="size-4" />
                {m["presskit.download.browse_tree"]()}
              </SheetTrigger>
              <SheetContent side="left" className="w-80 max-w-[85vw] p-0">
                <SheetHeader className="sr-only">
                  <SheetTitle>{m["presskit.download.folders_heading"]()}</SheetTitle>
                  <SheetDescription>{m["presskit.download.description"]()}</SheetDescription>
                </SheetHeader>
                {mobileTreeOpen ? (
                  <PressKitTreeSidebar
                    manifest={pressKitManifest}
                    activeFolderId={activeFolder.id}
                    highlightedFileId={highlightedFileId}
                    onSelectFolder={handleSelectFolder}
                    onSelectFile={handleSelectFile}
                    onDownloadFile={download.downloadFile}
                    onItemReclicked={() => setMobileTreeOpen(false)}
                    className="h-full"
                  />
                ) : null}
              </SheetContent>
            </Sheet>
          }
        />
      </div>
    </section>
  );
}
