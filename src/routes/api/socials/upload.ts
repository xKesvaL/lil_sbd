import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createFileRoute } from "@tanstack/react-router";
import { ensureSchemaInitialized } from "#/db";
import { auth } from "#/lib/auth";
import { ensureUploadsDir } from "#/server/social-publisher.server";

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

          const safeBase = file.name
            .replace(/\.[^/.]+$/, "")
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, "-")
            .replace(/(^-|-$)/g, "")
            .slice(0, 48);
          const ext = file.name.toLowerCase().endsWith(".mov") ? ".mov" : ".mp4";
          const storedFileName = `${Date.now()}-${safeBase || "clip"}${ext}`;

          const uploadDir = ensureUploadsDir();
          const destPath = join(uploadDir, storedFileName);
          const arrayBuffer = await file.arrayBuffer();
          writeFileSync(destPath, Buffer.from(arrayBuffer));

          return new Response(
            JSON.stringify({
              videoUrl: `/api/socials/media/${storedFileName}`,
              videoFileName: file.name,
              videoSizeBytes: file.size,
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
