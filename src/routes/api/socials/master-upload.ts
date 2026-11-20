import { createFileRoute } from "@tanstack/react-router";
import { ensureSchemaInitialized } from "#/db";
import { auth } from "#/lib/auth";
import { buildStorageKey, putMediaObject } from "#/server/media-storage.server";

const ALLOWED_AUDIO_EXTS = [".wav", ".mp3", ".flac", ".m4a", ".ogg"];

export const Route = createFileRoute("/api/socials/master-upload")({
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
          const file = formData.get("audio");
          if (!(file instanceof File)) {
            return new Response(JSON.stringify({ error: "Missing audio file field" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const lowerName = file.name.toLowerCase();
          if (!ALLOWED_AUDIO_EXTS.some((ext) => lowerName.endsWith(ext))) {
            return new Response(
              JSON.stringify({
                error: "Unsupported audio format. Upload WAV, MP3, FLAC, M4A, or OGG.",
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              },
            );
          }

          const maxBytes = 150 * 1024 * 1024; // 150 MB
          if (file.size > maxBytes) {
            return new Response(
              JSON.stringify({ error: "Audio file exceeds maximum size of 150MB" }),
              {
                status: 413,
                headers: { "Content-Type": "application/json" },
              },
            );
          }

          const key = buildStorageKey("masters", file.name);
          const arrayBuffer = await file.arrayBuffer();
          const stored = await putMediaObject(key, new Uint8Array(arrayBuffer));

          return new Response(
            JSON.stringify({
              masterAudioPath: stored.key,
              audioPreviewUrl: stored.publicUrl,
              fileName: file.name,
              sizeBytes: stored.sizeBytes,
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
              error: err instanceof Error ? err.message : "Master audio upload failed",
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
