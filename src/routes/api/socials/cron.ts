import { timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { ensureBackgroundWorkerRunning, runWorkerTickNow } from "#/server/jobs.server";

function extractProvidedSecret(request: Request): string | null {
  const authHeader = request.headers.get("authorization")?.trim();
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  if (headerSecret) return headerSecret;

  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret")?.trim();
  return querySecret || null;
}

function secretsMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function handleAutopilotCronRequest(request: Request): Promise<Response> {
  const configuredSecret = process.env.CRON_SECRET?.trim();

  if (configuredSecret) {
    const provided = extractProvidedSecret(request);
    if (!provided || !secretsMatch(configuredSecret, provided)) {
      return Response.json({ ok: false, error: "Unauthorized cron trigger" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return Response.json(
      {
        ok: false,
        error: "CRON_SECRET is not configured in production environment.",
      },
      { status: 503 },
    );
  }

  ensureBackgroundWorkerRunning();
  const summary = await runWorkerTickNow({
    forceAutopilotScan: true,
    forceTokenCheck: true,
    maxJobs: 5,
  });

  return Response.json({
    ok: true,
    workerRunning: true,
    ...summary,
    timestamp: new Date().toISOString(),
  });
}

export const Route = createFileRoute("/api/socials/cron")({
  server: {
    handlers: {
      POST: async ({ request }) => handleAutopilotCronRequest(request),
      GET: async ({ request }) => handleAutopilotCronRequest(request),
    },
  },
});
