import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  buildPressKitUrl,
  classifyPressKitExtension,
  scanPressKitDirectory,
} from "#/vite/presskit-manifest.ts";
import {
  collectPressKitFiles,
  getAncestorIds,
  getBreadcrumbs,
  getDirectChildren,
  getFileTypeLabel,
  getZipArchiveName,
  getZipEntryPath,
  isFileNode,
  isFolderNode,
  isPreviewableImage,
  pressKitManifest,
  resolveFolderId,
} from "./presskit.ts";

describe("presskit manifest scanner", () => {
  it("scans folders, ignores dotfiles, sorts folders first, and tallies recursive counts", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lilsbd-presskit-"));

    try {
      fs.mkdirSync(path.join(tmpDir, "01_PRESS_KIT_PDF"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "02_LOGOS", "SVG"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "01_PRESS_KIT_PDF", ".gitkeep"), "");
      fs.writeFileSync(path.join(tmpDir, "01_PRESS_KIT_PDF", "PressKit EN.pdf"), "pdf-bytes");
      fs.writeFileSync(path.join(tmpDir, "02_LOGOS", "Logo Blanc.png"), "png-data-12345");
      fs.writeFileSync(path.join(tmpDir, "02_LOGOS", "SVG", "Logo.svg"), "<svg></svg>");
      fs.writeFileSync(path.join(tmpDir, ".DS_Store"), "junk");

      const manifest = scanPressKitDirectory(tmpDir);
      const root = manifest.nodes[manifest.rootId];

      expect(isFolderNode(root)).toBe(true);
      if (!isFolderNode(root)) return;

      expect(root.name).toBe("LIL SBD - PRESS PACK");
      expect(root.children).toEqual(["01_PRESS_KIT_PDF", "02_LOGOS"]);
      expect(root.fileCount).toBe(3);

      const logos = manifest.nodes["02_LOGOS"];
      expect(isFolderNode(logos)).toBe(true);
      if (!isFolderNode(logos)) return;

      // Subfolder appears before file inside 02_LOGOS
      expect(logos.children).toEqual(["02_LOGOS/SVG", "02_LOGOS/Logo Blanc.png"]);
      expect(logos.fileCount).toBe(2);

      const pdfFile = manifest.nodes["01_PRESS_KIT_PDF/PressKit EN.pdf"];
      expect(isFileNode(pdfFile)).toBe(true);
      if (!isFileNode(pdfFile)) return;

      expect(pdfFile.url).toBe("/presskit/01_PRESS_KIT_PDF/PressKit%20EN.pdf");
      expect(pdfFile.category).toBe("pdf");
      expect(pdfFile.extension).toBe("pdf");
      expect(getFileTypeLabel(pdfFile)).toBe("PDF");
      expect(isPreviewableImage(pdfFile)).toBe(false);

      const pngFile = manifest.nodes["02_LOGOS/Logo Blanc.png"];
      expect(isFileNode(pngFile) && isPreviewableImage(pngFile)).toBe(true);

      // Recursive file collection and ZIP path preservation
      const allFiles = collectPressKitFiles(manifest.rootId, manifest);
      expect(allFiles.map((f) => f.id)).toEqual([
        "01_PRESS_KIT_PDF/PressKit EN.pdf",
        "02_LOGOS/SVG/Logo.svg",
        "02_LOGOS/Logo Blanc.png",
      ]);

      expect(getZipArchiveName(root)).toBe("LIL SBD - PRESS PACK.zip");
      expect(getZipArchiveName(logos)).toBe("02_LOGOS.zip");

      const svgFile = manifest.nodes["02_LOGOS/SVG/Logo.svg"];
      expect(isFileNode(svgFile)).toBe(true);
      if (!isFileNode(svgFile)) return;

      expect(getZipEntryPath(svgFile, root)).toBe("LIL SBD - PRESS PACK/02_LOGOS/SVG/Logo.svg");
      expect(getZipEntryPath(svgFile, logos)).toBe("02_LOGOS/SVG/Logo.svg");

      // Breadcrumbs, ancestors, and path resolution
      expect(getBreadcrumbs("02_LOGOS/SVG", manifest).map((n) => n.id)).toEqual([
        "root",
        "02_LOGOS",
        "02_LOGOS/SVG",
      ]);
      expect(getAncestorIds("02_LOGOS/SVG/Logo.svg", manifest)).toEqual([
        "02_LOGOS/SVG",
        "02_LOGOS",
        "root",
      ]);
      expect(resolveFolderId("02_LOGOS", manifest)).toBe("02_LOGOS");
      expect(resolveFolderId("02_LOGOS/Logo Blanc.png", manifest)).toBe("02_LOGOS");
      expect(resolveFolderId("does-not-exist", manifest)).toBe("root");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("includes the four initial Press Kit folders and generates thumbnails for live assets", () => {
    const rootChildren = getDirectChildren(pressKitManifest.rootId, pressKitManifest);
    expect(rootChildren.map((node) => node.name)).toEqual([
      "01_PRESS_KIT_PDF",
      "02_LOGOS",
      "03_PHOTOS_HD",
      "04_BIOS_TEXTE",
    ]);

    const allFiles = collectPressKitFiles(pressKitManifest.rootId, pressKitManifest);
    for (const file of allFiles) {
      if (isPreviewableImage(file)) {
        expect(file.thumbnailUrl).toMatch(/^\/_presskit-thumbs\/[a-f0-9]{12}\.webp$/);
        expect(file.thumbnailWidth).toBeGreaterThan(0);
        expect(file.thumbnailHeight).toBeGreaterThan(0);
      }
    }
  });

  it("classifies common press kit extensions and encodes URLs safely", () => {
    expect(classifyPressKitExtension("pdf")).toBe("pdf");
    expect(classifyPressKitExtension("JPG")).toBe("image");
    expect(classifyPressKitExtension("svg")).toBe("vector");
    expect(classifyPressKitExtension("ai")).toBe("vector");
    expect(classifyPressKitExtension("txt")).toBe("text");
    expect(classifyPressKitExtension("wav")).toBe("audio");
    expect(classifyPressKitExtension("zip")).toBe("archive");
    expect(classifyPressKitExtension("unknown")).toBe("other");
    expect(buildPressKitUrl("03_PHOTOS_HD/Photo été 01.jpg")).toBe(
      "/presskit/03_PHOTOS_HD/Photo%20%C3%A9t%C3%A9%2001.jpg",
    );
  });
});
