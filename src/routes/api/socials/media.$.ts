import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { createFileRoute } from "@tanstack/react-router";
import {
  guessContentType,
  normalizeStorageKey,
  readMediaBuffer,
  resolveLocalMediaPath,
} from "#/server/media-storage.server";

export const Route = createFileRoute("/api/socials/media/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const rawSplat = params._splat || "";
        if (!rawSplat) {
          return new Response("Not Found", { status: 404 });
        }

        let key: string;
        try {
          key = normalizeStorageKey(rawSplat);
        } catch {
          return new Response("Invalid media path", { status: 400 });
        }

        const contentType = guessContentType(key);
        const fullPath = resolveLocalMediaPath(key);

        if (existsSync(fullPath)) {
          const stat = statSync(fullPath);
          const totalSize = stat.size;
          const rangeHeader = request.headers.get("range");

          if (rangeHeader) {
            const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
            if (match) {
              const start = Number.parseInt(match[1] || "0", 10);
              const end = match[2] ? Number.parseInt(match[2], 10) : totalSize - 1;
              const clampedEnd = Math.min(end, totalSize - 1);

              if (start <= clampedEnd && start < totalSize) {
                const chunkSize = clampedEnd - start + 1;
                const nodeStream = createReadStream(fullPath, { start, end: clampedEnd });
                const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

                return new Response(webStream, {
                  status: 206,
                  headers: {
                    "Content-Range": `bytes ${start}-${clampedEnd}/${totalSize}`,
                    "Accept-Ranges": "bytes",
                    "Content-Length": String(chunkSize),
                    "Content-Type": contentType,
                    "Cache-Control": "public, max-age=31536000, immutable",
                  },
                });
              }

              return new Response("Range Not Satisfiable", {
                status: 416,
                headers: { "Content-Range": `bytes */${totalSize}` },
              });
            }
          }

          const nodeStream = createReadStream(fullPath);
          const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

          return new Response(webStream, {
            status: 200,
            headers: {
              "Accept-Ranges": "bytes",
              "Content-Length": String(totalSize),
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          });
        }

        // Fallback: proxy from S3/R2 when S3 is configured without a separate S3_PUBLIC_URL
        try {
          const buffer = await readMediaBuffer(key);
          return new Response(Buffer.from(buffer), {
            status: 200,
            headers: {
              "Content-Length": String(buffer.byteLength),
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          });
        } catch {
          return new Response("Not Found", { status: 404 });
        }
      },
    },
  },
});
