import handler from "@tanstack/react-start/server-entry";
import { paraglideMiddleware } from "@/paraglide/server.js";
import { ensureBackgroundWorkerRunning } from "#/server/jobs.server";

// Boot the persistent Autopilot background worker on server startup so scheduled posts
// fire reliably after Coolify/VPS restarts even before anyone opens /admin/socials.
if (!process.env.VITEST) {
  ensureBackgroundWorkerRunning();
}

export default {
  fetch(req: Request): Promise<Response> {
    if (!process.env.VITEST) {
      ensureBackgroundWorkerRunning();
    }
    return paraglideMiddleware(req, () => handler.fetch(req));
  },
};
