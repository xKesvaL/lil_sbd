import {
  IconAlertTriangle,
  IconChevronRight,
  IconCircleCheck,
  IconDownload,
  IconFileZip,
  IconFolderOff,
  IconLayoutGrid,
  IconList,
  IconLoader2,
} from "@tabler/icons-react";
import { Fragment } from "react";
import { Badge } from "#/components/ui/badge.tsx";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "#/components/ui/breadcrumb.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty.tsx";
import { Progress } from "#/components/ui/progress.tsx";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group.tsx";
import type { PressKitDownloadStatus } from "#/hooks/use-presskit-download.ts";
import { formatBytes } from "#/lib/downloads.ts";
import {
  getFileTypeLabel,
  isPreviewableImage,
  type PressKitFileNode,
  type PressKitFolderNode,
  type PressKitNode,
} from "#/lib/presskit.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";
import { PressKitNodeIcon } from "./presskit-icons.tsx";

export type DriveViewMode = "list" | "grid";

const isDriveViewMode = (value: unknown): value is DriveViewMode =>
  value === "list" || value === "grid";

const TRANSPARENT_IMAGE_EXTENSIONS = new Set(["png", "svg", "webp", "gif", "avif"]);

const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundImage:
    'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill-opacity=%270.05%27%3E%3Crect width=%278%27 height=%278%27 fill=%27%23fff%27/%3E%3Crect x=%278%27 y=%278%27 width=%278%27 height=%278%27 fill=%27%23fff%27/%3E%3C/svg%3E")',
  backgroundSize: "16px 16px",
};

const CONTENT_VISIBILITY_THRESHOLD = 24;

function formatFileCount(count: number): string {
  if (count === 0) {
    return m["presskit.download.items_count_zero"]();
  }

  if (count === 1) {
    return m["presskit.download.items_count_one"]();
  }

  return m["presskit.download.items_count_many"]({ count });
}

function PressKitStatusBar({
  status,
  onCancel,
}: {
  status: PressKitDownloadStatus;
  onCancel: () => void;
}) {
  const locale = getLocale();

  if (status.state === "idle") {
    return null;
  }

  if (status.state === "zipping") {
    const percent = status.total
      ? (status.loaded / status.total) * 100
      : (status.filesDone / Math.max(status.fileCount, 1)) * 100;
    const label = m["presskit.download.zipping"]({
      name: status.targetName,
      done: status.filesDone,
      count: status.fileCount,
    });

    return (
      <div className="flex flex-col gap-2 border-b bg-primary/8 px-4 py-3" aria-live="polite">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="flex min-w-0 items-center gap-2 truncate">
            <IconLoader2 className="size-4 shrink-0 animate-spin text-primary" />
            <span className="truncate">{label}</span>
          </span>
          <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
            {m["presskit.download.cancel"]()}
          </Button>
        </div>
        <Progress value={Math.round(percent)} aria-label={label} />
        {status.total ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {m["presskit.download.progress_size"]({
              loaded: formatBytes(status.loaded, locale),
              total: formatBytes(status.total, locale),
            })}
          </span>
        ) : null}
      </div>
    );
  }

  if (status.state === "done") {
    return (
      <div
        className="flex items-center gap-2 border-b bg-primary/8 px-4 py-2.5 text-sm text-foreground"
        aria-live="polite"
      >
        <IconCircleCheck className="size-4 shrink-0 text-primary" />
        <span className="truncate">
          {status.kind === "zip"
            ? m["presskit.download.done_zip"]({ name: status.targetName })
            : m["presskit.download.done_file"]({ name: status.targetName })}
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-2 border-b bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
      role="alert"
    >
      <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{m["presskit.download.error"]({ name: status.targetName })}</span>
    </div>
  );
}

function DriveListView({
  items,
  highlightedFileId,
  isBusy,
  onOpenFolder,
  onDownloadFile,
  onDownloadFolder,
}: {
  items: PressKitNode[];
  highlightedFileId: string | null;
  isBusy: boolean;
  onOpenFolder: (folderId: string) => void;
  onDownloadFile: (file: PressKitFileNode) => void;
  onDownloadFolder: (folder: PressKitFolderNode) => void;
}) {
  const locale = getLocale();
  const useContentVisibility = items.length > CONTENT_VISIBILITY_THRESHOLD;

  return (
    <div className="divide-y divide-border/60">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-2 text-xs font-medium tracking-widest text-muted-foreground uppercase sm:grid-cols-[minmax(0,1fr)_6rem_6.5rem_auto]">
        <span>{m["presskit.download.col_name"]()}</span>
        <span className="hidden sm:block">{m["presskit.download.col_type"]()}</span>
        <span className="hidden text-right sm:block">{m["presskit.download.col_size"]()}</span>
        <span className="w-8" />
      </div>

      <ul className="divide-y divide-border/50">
        {items.map((node) => {
          const isFolder = node.kind === "folder";
          const isHighlighted = node.id === highlightedFileId;
          const canDownload = isFolder ? node.fileCount > 0 : true;

          return (
            <li
              key={node.id}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-2.5 transition-colors [contain:layout_style_paint] hover:bg-card/70 sm:grid-cols-[minmax(0,1fr)_6rem_6.5rem_auto]",
                useContentVisibility && "[contain-intrinsic-size:auto_52px] [content-visibility:auto]",
                isHighlighted && "bg-primary/12 ring-1 ring-inset ring-primary/50",
              )}
            >
              {isFolder ? (
                <button
                  type="button"
                  onClick={() => onOpenFolder(node.id)}
                  className="flex min-w-0 cursor-pointer items-center gap-3 text-left outline-none focus-visible:text-primary"
                >
                  <PressKitNodeIcon node={node} className="size-5" />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {node.name}
                  </span>
                  <IconChevronRight className="size-4 shrink-0 text-muted-foreground/70 sm:hidden" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onDownloadFile(node)}
                  disabled={isBusy}
                  className="flex min-w-0 cursor-pointer items-center gap-3 text-left outline-none focus-visible:text-primary disabled:cursor-not-allowed"
                >
                  <PressKitNodeIcon node={node} className="size-5" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-foreground">{node.name}</span>
                    <span className="text-xs text-muted-foreground sm:hidden">
                      {getFileTypeLabel(node)} · {formatBytes(node.size, locale)}
                    </span>
                  </span>
                </button>
              )}

              <div className="hidden sm:block">
                <Badge variant="outline" className="text-[11px] font-normal">
                  {isFolder ? m["presskit.download.type_folder"]() : getFileTypeLabel(node)}
                </Badge>
              </div>

              <div className="hidden text-right text-sm text-muted-foreground tabular-nums sm:block">
                {isFolder ? formatFileCount(node.fileCount) : formatBytes(node.size, locale)}
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  disabled={isBusy || !canDownload}
                  onClick={() => (isFolder ? onDownloadFolder(node) : onDownloadFile(node))}
                  aria-label={
                    isFolder
                      ? m["presskit.download.download_folder_aria"]({ name: node.name })
                      : m["presskit.download.download_file"]({ name: node.name })
                  }
                >
                  {isFolder ? <IconFileZip className="size-4" /> : <IconDownload className="size-4" />}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DriveGridView({
  items,
  highlightedFileId,
  isBusy,
  onOpenFolder,
  onDownloadFile,
  onDownloadFolder,
}: {
  items: PressKitNode[];
  highlightedFileId: string | null;
  isBusy: boolean;
  onOpenFolder: (folderId: string) => void;
  onDownloadFile: (file: PressKitFileNode) => void;
  onDownloadFolder: (folder: PressKitFolderNode) => void;
}) {
  const locale = getLocale();
  const useContentVisibility = items.length > CONTENT_VISIBILITY_THRESHOLD;

  return (
    <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((node, index) => {
        const isFolder = node.kind === "folder";
        const isHighlighted = node.id === highlightedFileId;
        const canDownload = isFolder ? node.fileCount > 0 : true;
        const hasTransparency =
          !isFolder && TRANSPARENT_IMAGE_EXTENSIONS.has(node.extension.toLowerCase());

        return (
          <div
            key={node.id}
            className={cn(
              "group flex flex-col justify-between border bg-background/55 transition-colors [contain:layout_style_paint] hover:border-primary/40 hover:bg-card/75",
              useContentVisibility && "[contain-intrinsic-size:auto_232px] [content-visibility:auto]",
              isHighlighted && "border-primary/60 bg-primary/10",
            )}
          >
            {isFolder ? (
              <button
                type="button"
                onClick={() => onOpenFolder(node.id)}
                className="flex flex-1 cursor-pointer flex-col gap-3 p-4 text-left outline-none"
              >
                <div className="flex items-center justify-between gap-2">
                  <PressKitNodeIcon node={node} className="size-7" />
                  <Badge variant="outline" className="text-[11px] font-normal">
                    {formatFileCount(node.fileCount)}
                  </Badge>
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{node.name}</p>
                  {node.totalSize > 0 ? (
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {formatBytes(node.totalSize, locale)}
                    </p>
                  ) : null}
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onDownloadFile(node)}
                disabled={isBusy}
                className="flex flex-1 cursor-pointer flex-col text-left outline-none disabled:cursor-not-allowed"
              >
                <div
                  style={hasTransparency ? CHECKERBOARD_STYLE : undefined}
                  className="flex h-36 w-full items-center justify-center overflow-hidden border-b bg-background/80 p-3"
                >
                  {isPreviewableImage(node) ? (
                    <img
                      src={node.thumbnailUrl ?? node.url}
                      alt={node.name}
                      width={node.thumbnailWidth}
                      height={node.thumbnailHeight}
                      loading={index < 6 ? "eager" : "lazy"}
                      decoding="async"
                      fetchPriority={index < 6 ? "high" : "low"}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <PressKitNodeIcon node={node} className="size-10" />
                  )}
                </div>
                <div className="flex flex-col gap-1 p-3.5">
                  <p className="truncate text-sm font-medium text-foreground">{node.name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {getFileTypeLabel(node)} · {formatBytes(node.size, locale)}
                  </p>
                </div>
              </button>
            )}

            <div className="flex items-center justify-end border-t border-border/50 px-3 py-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={isBusy || !canDownload}
                onClick={() => (isFolder ? onDownloadFolder(node) : onDownloadFile(node))}
              >
                {isFolder ? (
                  <>
                    <IconFileZip data-icon="inline-start" className="size-3.5" />
                    {m["presskit.download.download_folder"]()}
                  </>
                ) : (
                  <>
                    <IconDownload data-icon="inline-start" className="size-3.5" />
                    {getFileTypeLabel(node)}
                  </>
                )}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PressKitDriveBrowser({
  activeFolder,
  breadcrumbs,
  childrenItems,
  highlightedFileId,
  viewMode,
  status,
  isBusy,
  mobileTreeTrigger,
  onViewModeChange,
  onOpenFolder,
  onDownloadFile,
  onDownloadFolder,
  onCancelDownload,
}: {
  activeFolder: PressKitFolderNode;
  breadcrumbs: PressKitFolderNode[];
  childrenItems: PressKitNode[];
  highlightedFileId: string | null;
  viewMode: DriveViewMode;
  status: PressKitDownloadStatus;
  isBusy: boolean;
  mobileTreeTrigger?: React.ReactNode;
  onViewModeChange: (mode: DriveViewMode) => void;
  onOpenFolder: (folderId: string) => void;
  onDownloadFile: (file: PressKitFileNode) => void;
  onDownloadFolder: (folder: PressKitFolderNode) => void;
  onCancelDownload: () => void;
}) {
  const isRoot = activeFolder.path === "";

  return (
    <div className="flex min-h-[26rem] min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {mobileTreeTrigger}

          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;

                return (
                  <Fragment key={crumb.id}>
                    {index > 0 ? <BreadcrumbSeparator /> : null}
                    <BreadcrumbItem>
                      {isLast ? (
                        <BreadcrumbPage className="font-semibold">{crumb.name}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink
                          render={
                            <button
                              type="button"
                              onClick={() => onOpenFolder(crumb.id)}
                              className="cursor-pointer"
                            />
                          }
                        >
                          {crumb.name}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[viewMode]}
            onValueChange={(value) => {
              const [next] = value;
              if (isDriveViewMode(next)) {
                onViewModeChange(next);
              }
            }}
            aria-label="View mode"
          >
            <ToggleGroupItem
              value="grid"
              aria-label={m["presskit.download.view_grid"]()}
              className="aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/85"
            >
              <IconLayoutGrid className="size-4" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="list"
              aria-label={m["presskit.download.view_list"]()}
              className="aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/85"
            >
              <IconList className="size-4" />
            </ToggleGroupItem>
          </ToggleGroup>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy || activeFolder.fileCount === 0}
            onClick={() => onDownloadFolder(activeFolder)}
          >
            <IconFileZip data-icon="inline-start" className="size-4" />
            {isRoot
              ? m["presskit.download.download_pack"]()
              : m["presskit.download.download_folder"]()}
          </Button>
        </div>
      </div>

      <PressKitStatusBar status={status} onCancel={onCancelDownload} />

      <div className="flex flex-1 flex-col">
        {childrenItems.length === 0 ? (
          <Empty className="border-0 p-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconFolderOff />
              </EmptyMedia>
              <EmptyTitle>
                {isRoot
                  ? m["presskit.download.empty_pack_title"]()
                  : m["presskit.download.empty_folder_title"]()}
              </EmptyTitle>
              <EmptyDescription>
                {isRoot
                  ? m["presskit.download.empty_pack_description"]()
                  : m["presskit.download.empty_folder_description"]({ name: activeFolder.name })}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : viewMode === "grid" ? (
          <DriveGridView
            items={childrenItems}
            highlightedFileId={highlightedFileId}
            isBusy={isBusy}
            onOpenFolder={onOpenFolder}
            onDownloadFile={onDownloadFile}
            onDownloadFolder={onDownloadFolder}
          />
        ) : (
          <DriveListView
            items={childrenItems}
            highlightedFileId={highlightedFileId}
            isBusy={isBusy}
            onOpenFolder={onOpenFolder}
            onDownloadFile={onDownloadFile}
            onDownloadFolder={onDownloadFolder}
          />
        )}
      </div>
    </div>
  );
}
