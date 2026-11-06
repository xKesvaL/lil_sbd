import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { db, ensureSchemaInitialized } from "#/db";
import * as schema from "#/db/schema";
import { ensureUserWorkspaceSeeded } from "#/db/seed-data";

const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  };
}

if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  socialProviders.discord = {
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
  };
}

export const auth = betterAuth({
  secret:
    process.env.BETTER_AUTH_SECRET ??
    "lil-sbd-social-growth-studio-default-dev-secret-key-2026",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
  },
  socialProviders,
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          await ensureSchemaInitialized();
          const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
          const publicSignupEnabled =
            (process.env.PUBLIC_SIGNUP_ENABLED ?? "true").toLowerCase() === "true";

          if (adminEmail && !publicSignupEnabled) {
            if (newUser.email.trim().toLowerCase() !== adminEmail) {
              throw new APIError("FORBIDDEN", {
                message:
                  "Registration is currently restricted to the studio owner (ADMIN_EMAIL). Set PUBLIC_SIGNUP_ENABLED=true to allow multi-producer signups.",
              });
            }
          }
          return { data: newUser };
        },
        after: async (createdUser) => {
          try {
            await ensureUserWorkspaceSeeded(createdUser.id, createdUser.name);
          } catch (err) {
            console.error("Failed to seed initial producer workspace:", err);
          }
        },
      },
    },
  },
});

export function getConfiguredAuthInfo() {
  return {
    githubEnabled: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    discordEnabled: Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
    adminEmailRestricted: Boolean(
      process.env.ADMIN_EMAIL?.trim() &&
        (process.env.PUBLIC_SIGNUP_ENABLED ?? "true").toLowerCase() !== "true",
    ),
  };
}
