import {
  expandAllFeature,
  hotkeysCoreFeature,
  type ItemInstance,
  selectionFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react/react-compiler";
import {
  IconChevronRight,
  IconChevronsDown,
  IconChevronsUp,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip.tsx";
import {
  getAncestorIds,
  type PressKitFileNode,
  type PressKitManifest,
  type PressKitNode,
} from "#/lib/presskit.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages";
import { PressKitNodeIcon } from "./presskit-icons.tsx";

const INDENT_PX = 16;

const TREE_FEATURES = [
  syncDataLoaderFeature,
  selectionFeature,
  hotkeysCoreFeature,
  expandAllFeature,
];

const getItemName = (item: ItemInstance<PressKitNode>) => item.getItemData().name;
const isItemFolder = (item: ItemInstance<PressKitNode>) => item.getItemData().kind === "folder";

const GUIDE_LINE_STYLE_CACHE = new Map<number, React.CSSProperties>();

function getGuideLineStyle(level: number): React.CSSProperties {
  const cached = GUIDE_LINE_STYLE_CACHE.get(level);
  if (cached) {
    return cached;
  }

  const style: React.CSSProperties =
    level <= 0
      ? { paddingLeft: `${level * INDENT_PX + 8}px` }
      : {
          paddingLeft: `${level * INDENT_PX + 8}px`,
          backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${INDENT_PX - 1}px, color-mix(in oklch, var(--border) 65%, transparent) ${INDENT_PX - 1}px, color-mix(in oklch, var(--border) 65%, transparent) ${INDENT_PX}px)`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "0 0",
          backgroundSize: `${level * INDENT_PX}px 100%`,
        };

  GUIDE_LINE_STYLE_CACHE.set(level, style);
  return style;
}

export function PressKitTreeSidebar({
  manifest,
  activeFolderId,
  highlightedFileId,
  onSelectFolder,
  onSelectFile,
  onDownloadFile,
  onItemReclicked,
  className,
}: {
  manifest: PressKitManifest;
  activeFolderId: string;
  highlightedFileId: string | null;
  onSelectFolder: (folderId: string) => void;
  onSelectFile: (file: PressKitFileNode) => void;
  onDownloadFile: (file: PressKitFileNode) => void;
  onItemReclicked?: () => void;
  className?: string;
}) {
  const [expandedItems, setExpandedItems] = useState<string[]>(() => {
    const initial = new Set<string>([manifest.rootId, ...getAncestorIds(activeFolderId, manifest)]);
    return [...initial];
  });

  const selectedId = highlightedFileId ?? activeFolderId;
  const selectedItems = useMemo(() => [selectedId], [selectedId]);

  const dataLoader = useMemo(
    () => ({
      getItem: (itemId: string) => manifest.nodes[itemId],
      getChildren: (itemId: string) => {
        const node = manifest.nodes[itemId];
        return node?.kind === "folder" ? node.children : [];
      },
    }),
    [manifest],
  );

  useEffect(() => {
    const requiredAncestors = [manifest.rootId, ...getAncestorIds(selectedId, manifest)];
    setExpandedItems((current) => {
      const next = new Set(current);
      let changed = false;

      for (const id of requiredAncestors) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }

      return changed ? [...next] : current;
    });
  }, [manifest, selectedId]);

  const tree = useTree<PressKitNode>({
    rootItemId: manifest.virtualRootId,
    indent: INDENT_PX,
    state: {
      expandedItems,
      selectedItems,
    },
    setExpandedItems,
    setSelectedItems: (updater) => {
      const next = typeof updater === "function" ? updater(selectedItems) : updater;
      const primary = next[0];
      if (!primary) {
        return;
      }

      const node = manifest.nodes[primary];
      if (node?.kind === "folder") {
        if (node.id !== activeFolderId || highlightedFileId !== null) {
          onSelectFolder(node.id);
        } else {
          onItemReclicked?.();
        }
      } else if (node?.kind === "file") {
        if (node.id !== highlightedFileId) {
          onSelectFile(node);
        } else {
          onItemReclicked?.();
        }
      }
    },
    getItemName,
    isItemFolder,
    dataLoader,
    onPrimaryAction: (item) => {
      const node = item.getItemData();
      if (node.kind === "file") {
        onDownloadFile(node);
      } else {
        onSelectFolder(node.id);
      }
    },
    features: TREE_FEATURES,
  });

  const treeInstance = tree();
  const items = treeInstance.getItems();

  return (
    <aside className={cn("flex min-h-0 flex-col [contain:layout_style]", className)}>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
        <span className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          {m["presskit.download.folders_heading"]()}
        </span>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => void treeInstance.expandAll()}
                  aria-label={m["presskit.download.expand_all"]()}
                />
              }
            >
              <IconChevronsDown className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>{m["presskit.download.expand_all"]()}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => {
                    treeInstance.collapseAll();
                    setExpandedItems([manifest.rootId]);
                  }}
                  aria-label={m["presskit.download.collapse_all"]()}
                />
              }
            >
              <IconChevronsUp className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>{m["presskit.download.collapse_all"]()}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div
          {...treeInstance.getContainerProps(m["presskit.download.folders_heading"]())}
          className="flex flex-col gap-0.5 p-2 outline-none"
        >
          {items.map((item) => {
            const node = item.getItemData();
            const level = item.getItemMeta().level;
            const isFolder = item.isFolder();
            const isExpanded = item.isExpanded();
            const isActive =
              node.id === highlightedFileId ||
              (!highlightedFileId && node.id === activeFolderId);
            const isFocused = item.isFocused();
            const hasChildren = node.kind === "folder" && node.children.length > 0;
            const itemProps = item.getProps();

            return (
              <div
                key={item.getId()}
                {...itemProps}
                onClick={(event) => {
                  itemProps.onClick?.(event);
                  if (node.id === selectedId) {
                    onItemReclicked?.();
                  }
                }}
                style={getGuideLineStyle(level)}
                className={cn(
                  "group relative flex cursor-pointer items-center gap-1.5 border border-transparent py-1.5 pr-2 text-left text-sm transition-colors select-none outline-none",
                  "hover:bg-card/80 hover:text-foreground",
                  isActive
                    ? "border-primary/40 bg-primary/15 font-medium text-foreground"
                    : "text-muted-foreground",
                  isFocused && "ring-1 ring-primary/60",
                )}
              >
                {isFolder ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (isExpanded) {
                        item.collapse();
                      } else {
                        item.expand();
                      }
                    }}
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center text-muted-foreground transition-transform hover:text-foreground",
                      !hasChildren && "opacity-35",
                    )}
                  >
                    <IconChevronRight
                      className={cn(
                        "size-3.5 transition-transform duration-150",
                        isExpanded && "rotate-90",
                      )}
                    />
                  </button>
                ) : (
                  <span aria-hidden="true" className="size-4 shrink-0" />
                )}

                <PressKitNodeIcon node={node} expanded={isFolder && isExpanded} />

                <span className="min-w-0 flex-1 truncate">{node.name}</span>

                {node.kind === "folder" && node.fileCount > 0 ? (
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    {node.fileCount}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
