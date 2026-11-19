import {
  IconFile,
  IconFileDescription,
  IconFileMusic,
  IconFileTypePdf,
  IconFileVector,
  IconFileZip,
  IconFolder,
  IconFolderOpen,
  IconMovie,
  IconPhoto,
} from "@tabler/icons-react";
import type { PressKitFileCategory, PressKitNode } from "#/lib/presskit.ts";
import { cn } from "#/lib/utils.ts";

const categoryIconColor: Record<PressKitFileCategory, string> = {
  pdf: "text-rose-400",
  image: "text-sky-400",
  vector: "text-violet-300",
  text: "text-emerald-400",
  audio: "text-amber-400",
  video: "text-fuchsia-400",
  archive: "text-orange-400",
  other: "text-muted-foreground",
};

export function PressKitNodeIcon({
  node,
  expanded = false,
  className,
}: {
  node: PressKitNode;
  expanded?: boolean;
  className?: string;
}) {
  if (node.kind === "folder") {
    const FolderIcon = expanded ? IconFolderOpen : IconFolder;
    return <FolderIcon className={cn("size-4 shrink-0 text-primary", className)} />;
  }

  const colorClass = categoryIconColor[node.category];

  switch (node.category) {
    case "pdf":
      return <IconFileTypePdf className={cn("size-4 shrink-0", colorClass, className)} />;
    case "image":
      return <IconPhoto className={cn("size-4 shrink-0", colorClass, className)} />;
    case "vector":
      return <IconFileVector className={cn("size-4 shrink-0", colorClass, className)} />;
    case "text":
      return <IconFileDescription className={cn("size-4 shrink-0", colorClass, className)} />;
    case "audio":
      return <IconFileMusic className={cn("size-4 shrink-0", colorClass, className)} />;
    case "video":
      return <IconMovie className={cn("size-4 shrink-0", colorClass, className)} />;
    case "archive":
      return <IconFileZip className={cn("size-4 shrink-0", colorClass, className)} />;
    default:
      return <IconFile className={cn("size-4 shrink-0", colorClass, className)} />;
  }
}
