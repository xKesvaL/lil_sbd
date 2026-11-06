import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, ensureSchemaInitialized } from "./index";
import {
  artistCatalogItems,
  artistProfiles,
  ideaTemplates,
  socialPosts,
  user,
} from "./schema";
import {
  CAMPAIGN_ROLLOUT_BLUEPRINTS,
  ensureSystemVaultSeeded,
  ensureUserWorkspaceSeeded,
} from "./seed-data";

describe("Social Growth Studio — Multi-Producer Database & Seeding", () => {
  it("initializes Postgres schema and seeds the system Hard Dance Idea Vault", async () => {
    await ensureSchemaInitialized();
    await ensureSystemVaultSeeded();

    const templates = await db.select().from(ideaTemplates);
    expect(templates.length).toBeGreaterThanOrEqual(8);

    const zaagTemplate = templates.find((t) => t.id === "sys-idea-zaag-anatomy");
    expect(zaagTemplate).toBeDefined();
    expect(zaagTemplate?.isSystem).toBe(true);
    expect(zaagTemplate?.hookFormulaEn).toContain("{track_title}");
    expect(zaagTemplate?.hookFormulaFr).toContain("{track_title}");
  });

  it("creates an isolated producer workspace with LIL SBD catalog & starter posts", async () => {
    const testUserId = `test-producer-${Date.now()}`;
    await db.insert(user).values({
      id: testUserId,
      name: "LIL SBD",
      email: `${testUserId}@lilsbd.com`,
      emailVerified: true,
    });

    await ensureUserWorkspaceSeeded(testUserId, "LIL SBD");

    const profiles = await db
      .select()
      .from(artistProfiles)
      .where(eq(artistProfiles.userId, testUserId));
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.stageName).toBe("LIL SBD");

    const catalog = await db
      .select()
      .from(artistCatalogItems)
      .where(eq(artistCatalogItems.userId, testUserId));
    expect(catalog.length).toBeGreaterThanOrEqual(12);
    expect(catalog.some((c) => c.slug === "kino")).toBe(true);
    expect(catalog.some((c) => c.type === "course_lesson")).toBe(true);

    const posts = await db
      .select()
      .from(socialPosts)
      .where(eq(socialPosts.userId, testUserId));
    expect(posts.length).toBeGreaterThanOrEqual(5);

    expect(CAMPAIGN_ROLLOUT_BLUEPRINTS.single_release.steps.length).toBe(8);
  });
});
