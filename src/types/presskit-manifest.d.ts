declare module "virtual:presskit-manifest" {
  export type PressKitFileCategory =
    | "pdf"
    | "image"
    | "vector"
    | "text"
    | "audio"
    | "video"
    | "archive"
    | "other";

  export type PressKitFolderNode = {
    id: string;
    name: string;
    kind: "folder";
    parentId: string | null;
    path: string;
    children: string[];
    fileCount: number;
    totalSize: number;
  };

  export type PressKitFileNode = {
    id: string;
    name: string;
    kind: "file";
    parentId: string;
    path: string;
    url: string;
    thumbnailUrl?: string;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
    extension: string;
    category: PressKitFileCategory;
    size: number;
    modifiedAt: string;
  };

  export type PressKitNode = PressKitFolderNode | PressKitFileNode;

  export type PressKitManifest = {
    virtualRootId: "__root__";
    rootId: "root";
    rootName: string;
    nodes: Record<string, PressKitNode>;
  };

  export const pressKitManifest: PressKitManifest;
}
