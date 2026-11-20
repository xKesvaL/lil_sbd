import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { createFileRoute } from "@tanstack/react-router";
import { ensureUploadsDir } from "#/server/social-publisher.server";

export const Route = createFileRoute("/api/socials/media/$filename")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const cleanName = basename(params.filename || "");
        if (!cleanName) {
          return new Response("Not Found", { status: 404 });
        }

        const fullPath = join(ensureUploadsDir(), cleanName);
        if (!existsSync(fullPath)) {
          return new Response("Not Found", { status: 404 });
        }

        const stat = statSync(fullPath);
        const totalSize = stat.size;
        const contentType = cleanName.toLowerCase().endsWith(".mov")
          ? "video/quicktime"
          : "video/mp4";

        const rangeHeader = request.headers.get("range");
        if (rangeHeader) {
          const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
          if (match) {
            const start = Number.parseInt(match[1] || "0", 10);
            const end = match[2] ? Number.parseInt(match[2], 10) : totalSize - 1;
            const clampedEnd = Math.min(end, totalSize - 1);
            if (start <= clampedEnd && start < totalSize) {
              const fileBuffer = readFileSync(fullPath);
              const chunk = fileBuffer.subarray(start, clampedEnd + 1);
              return new Response(chunk, {
                status: 206,
                headers: {
                  "Content-Range": `bytes ${start}-${clampedEnd}/${totalSize}`,
                  "Accept-Ranges": "bytes",
                  "Content-Length": String(chunk.byteLength),
                  "Content-Type": contentType,
                  "Cache-Control": "public, max-age=31536000, immutable",
                },
              });
            }
          }
        }

        const buffer = readFileSync(fullPath);
        return new Response(buffer, {
          status: 200,
          headers: {
            "Accept-Ranges": "bytes",
            "Content-Length": String(totalSize),
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
