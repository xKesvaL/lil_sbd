import { createFileRoute } from "@tanstack/react-router";
import { ensureSchemaInitialized } from "#/db";
import { auth } from "#/lib/auth";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await ensureSchemaInitialized();
        return auth.handler(request);
      },
      POST: async ({ request }) => {
        await ensureSchemaInitialized();
        return auth.handler(request);
      },
    },
  },
});
