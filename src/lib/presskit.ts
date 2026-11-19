import {
  type PressKitFileCategory,
  type PressKitFileNode,
  type PressKitFolderNode,
  type PressKitManifest,
  type PressKitNode,
  pressKitManifest,
} from "virtual:presskit-manifest";
import { sanitizeFileName } from "./downloads.ts";

export type {
  PressKitFileCategory,
  PressKitFileNode,
  PressKitFolderNode,
  PressKitManifest,
  PressKitNode,
};

export { pressKitManifest };

const PREVIEWABLE_IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "avif",
  "svg",
]);

export function isFolderNode(node: PressKitNode | undefined): node is PressKitFolderNode {
  return node?.kind === "folder";
}

export function isFileNode(node: PressKitNode | undefined): node is PressKitFileNode {
  return node?.kind === "file";
}

export function isPreviewableImage(file: PressKitFileNode): boolean {
  return PREVIEWABLE_IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
}

/** Resolves a `?path=` query value to a valid folder ID in the manifest, falling back to root. */
export function resolveFolderId(
  pathParam: string | undefined,
  manifest: PressKitManifest = pressKitManifest,
): string {
  if (!pathParam) {
    return manifest.rootId;
  }

  const normalized = pathParam.replace(/^\/+|\/+$/g, "");

  if (!normalized || normalized === manifest.rootId) {
    return manifest.rootId;
  }

  const node = manifest.nodes[normalized];

  if (isFolderNode(node)) {
    return node.id;
  }

  if (isFileNode(node) && isFolderNode(manifest.nodes[node.parentId])) {
    return node.parentId;
  }

  return manifest.rootId;
}

/** Returns direct children of a folder (already sorted: folders first, then natural name order). */
export function getDirectChildren(
  folderId: string,
  manifest: PressKitManifest = pressKitManifest,
): PressKitNode[] {
  const folder = manifest.nodes[folderId];

  if (!isFolderNode(folder)) {
    return [];
  }

  return folder.children
    .map((childId) => manifest.nodes[childId])
    .filter((node): node is PressKitNode => Boolean(node));
}

/** Recursively collects every file inside a folder (or returns `[node]` for a single file). */
export function collectPressKitFiles(
  nodeId: string,
  manifest: PressKitManifest = pressKitManifest,
): PressKitFileNode[] {
  const node = manifest.nodes[nodeId];

  if (!node) {
    return [];
  }

  if (isFileNode(node)) {
    return [node];
  }

  const files: PressKitFileNode[] = [];

  for (const childId of node.children) {
    files.push(...collectPressKitFiles(childId, manifest));
  }

  return files;
}

/** Ordered ancestor chain from the Press Pack root to `folderId`. */
export function getBreadcrumbs(
  folderId: string,
  manifest: PressKitManifest = pressKitManifest,
): PressKitFolderNode[] {
  const chain: PressKitFolderNode[] = [];
  let currentId: string | null = folderId;

  while (currentId && currentId !== manifest.virtualRootId) {
    const node: PressKitNode | undefined = manifest.nodes[currentId];

    if (!isFolderNode(node)) {
      break;
    }

    chain.push(node);
    currentId = node.parentId;
  }

  return chain.reverse();
}

/** Returns all ancestor folder IDs that should be expanded to reveal `nodeId` in the tree. */
export function getAncestorIds(
  nodeId: string,
  manifest: PressKitManifest = pressKitManifest,
): string[] {
  const ancestors: string[] = [];
  let current: PressKitNode | undefined = manifest.nodes[nodeId];

  while (current?.parentId && current.parentId !== manifest.virtualRootId) {
    ancestors.push(current.parentId);
    current = manifest.nodes[current.parentId];
  }

  return ancestors;
}

/** e.g. "LIL SBD - PRESS PACK.zip" or "02_LOGOS.zip" */
export function getZipArchiveName(folder: PressKitFolderNode): string {
  const cleanName = sanitizeFileName(folder.name) || "press-kit";
  return `${cleanName}.zip`;
}

/**
 * Relative path inside the ZIP archive, preserving subfolder hierarchy:
 * - Full pack download: `LIL SBD - PRESS PACK/02_LOGOS/logo.png`
 * - Folder download (`02_LOGOS`): `02_LOGOS/logo.png`
 */
export function getZipEntryPath(file: PressKitFileNode, baseFolder: PressKitFolderNode): string {
  const rootPrefix = sanitizeFileName(baseFolder.name) || "press-kit";

  if (!baseFolder.path) {
    return `${rootPrefix}/${file.path}`;
  }

  const prefixWithSlash = `${baseFolder.path}/`;
  const relativePath = file.path.startsWith(prefixWithSlash)
    ? file.path.slice(prefixWithSlash.length)
    : file.name;

  return `${rootPrefix}/${relativePath}`;
}

export function getFileTypeLabel(file: PressKitFileNode): string {
  return file.extension ? file.extension.toUpperCase() : "FILE";
}
