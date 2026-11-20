import { existsSync, unlinkSync } from "node:fs";
import { createFileRoute } from "@tanstack/react-router";
import { ensureSchemaInitialized } from "#/db";
import { auth } from "#/lib/auth";
import { probeMediaFile } from "#/server/audio-analysis.server";
import {
  buildStorageKey,
  ensureLocalMediaFile,
  putMediaObject,
} from "#/server/media-storage.server";

export const Route = createFileRoute("/api/socials/raw-upload")({
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

          const maxBytes = 250 * 1024 * 1024; // 250 MB per raw clip
          if (file.size > maxBytes) {
            return new Response(
              JSON.stringify({ error: "Raw clip exceeds maximum size of 250MB" }),
              {
                status: 413,
                headers: { "Content-Type": "application/json" },
              },
            );
          }

          const key = buildStorageKey("raw", file.name || "raw-take.mp4");
          const arrayBuffer = await file.arrayBuffer();
          const stored = await putMediaObject(key, new Uint8Array(arrayBuffer));

          // Probe video duration, resolution & FPS via ffprobe
          let probe: {
            durationSec: number;
            width?: number;
            height?: number;
            fps?: number;
          } = {
            durationSec: 0,
          };

          const local = await ensureLocalMediaFile(stored.key);
          try {
            probe = await probeMediaFile(local.localPath);
          } finally {
            if (local.isTemporary && existsSync(local.localPath)) {
              try {
                unlinkSync(local.localPath);
              } catch {
                // Ignore temp cleanup errors
              }
            }
          }

          return new Response(
            JSON.stringify({
              storageKey: stored.key,
              fileName: file.name,
              sizeBytes: stored.sizeBytes,
              durationSec: probe.durationSec,
              width: probe.width ?? null,
              height: probe.height ?? null,
              fps: probe.fps ?? null,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        } catch (err) {
          return new Response(
            JSON.stringify({
              error: err instanceof Error ? err.message : "Raw clip upload failed",
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
