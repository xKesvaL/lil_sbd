import { createFileRoute } from "@tanstack/react-router";
import { ensureSchemaInitialized } from "#/db";
import { auth } from "#/lib/auth";
import { buildStorageKey, putMediaObject } from "#/server/media-storage.server";

export const Route = createFileRoute("/api/socials/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await ensureSchemaInitialized();
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const formData = await request.formData();
          const file = formData.get("video");
          if (!(file instanceof File)) {
            return new Response(JSON.stringify({ error: "Missing video file field" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const maxBytes = 250 * 1024 * 1024; // 250 MB
          if (file.size > maxBytes) {
            return new Response(
              JSON.stringify({ error: "Video exceeds maximum size of 250MB" }),
              {
                status: 413,
                headers: { "Content-Type": "application/json" },
              },
            );
          }

          const key = buildStorageKey("rendered", file.name || "clip.mp4");
          const arrayBuffer = await file.arrayBuffer();
          const stored = await putMediaObject(key, new Uint8Array(arrayBuffer));

          return new Response(
            JSON.stringify({
              storageKey: stored.key,
              videoUrl: stored.publicUrl,
              videoFileName: file.name,
              videoSizeBytes: stored.sizeBytes,
              storageMode: stored.storageMode,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        } catch (err) {
          return new Response(
            JSON.stringify({
              error: err instanceof Error ? err.message : "Upload failed",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      },
    },
  },
});
