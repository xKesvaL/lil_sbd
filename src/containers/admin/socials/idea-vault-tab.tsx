import {
  IconBolt,
  IconEdit,
  IconPlus,
  IconRocket,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import type {
  ArtistCatalogItemRecord,
  ArtistProfileRecord,
  ContentPillar,
  IdeaCategory,
  IdeaDifficulty,
  IdeaTemplateRecord,
   PublishablePlatform,
  ReleaseCampaignRecord,
  SocialPlatform,
  SocialPostRecord,
} from "#/db/schema";
import { cn } from "#/lib/utils";
import {
  createCustomIdeaTemplateServerFn,
  deleteCustomIdeaTemplateServerFn,
  instantiateIdeaTemplateServerFn,
} from "#/server/socials";
import { CampaignsTab } from "./campaigns-tab";
import {
  IDEA_CATEGORY_LABELS,
  PILLAR_META,
  PLATFORM_META,
  PUBLISHABLE_PLATFORMS,
} from "./social-constants";

interface IdeaVaultTabProps {
  templates: IdeaTemplateRecord[];
  campaigns: ReleaseCampaignRecord[];
  catalog: ArtistCatalogItemRecord[];
  profile: ArtistProfileRecord;
  posts: SocialPostRecord[];
  onRefresh: () => Promise<void>;
  onOpenCreatedPost: (postId: string) => void;
  onOpenPost: (post: SocialPostRecord) => void;
}

const DIFFICULTY_META: Record<IdeaDifficulty, { label: string; badgeClass: string }> = {
  quick_5min: {
    label: "⚡ 5-Min Quick Capture",
    badgeClass: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  },
  daw_capture: {
    label: "🎛️ DAW Screen Recording",
    badgeClass: "border-violet-500/40 bg-violet-500/15 text-violet-300",
  },
  high_effort: {
    label: "🎬 Multi-Angle Edit",
    badgeClass: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  },
};

export function IdeaVaultTab({
  templates,
  campaigns,
  catalog,
  profile,
  posts,
  onRefresh,
  onOpenCreatedPost,
  onOpenPost,
}: IdeaVaultTabProps) {
  const [section, setSection] = useState<"templates" | "rollouts">("templates");
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>(
    catalog[0]?.id ?? "",
  );
  const [categoryFilter, setCategoryFilter] = useState<IdeaCategory | "all">("all");
  const [instantiatingId, setInstantiatingId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | undefined>(
    undefined,
  );

  // Single-language Template form state
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState<IdeaCategory>("kick_sound_design");
  const [newPillar, setNewPillar] = useState<ContentPillar>("sound_design_tutorial");
  const [newDifficulty, setNewDifficulty] = useState<IdeaDifficulty>("daw_capture");
  const [newPlatforms, setNewPlatforms] = useState<SocialPlatform[]>([
    "instagram_reels",
    "tiktok",
    "youtube_shorts",
  ]);
  const [newHook, setNewHook] = useState("");
  const [newCaption, setNewCaption] = useState("");
  const [newShotsText, setNewShotsText] = useState("");
  const [newHashtagsText, setNewHashtagsText] = useState("");

  const activeCatalogItem = catalog.find((c) => c.id === selectedCatalogId) ?? null;

  const previewInterpolate = (text: string) => {
    const trackTitle = activeCatalogItem?.title ?? "{track_title}";
    const bpm = activeCatalogItem?.bpm ?? 200;
    return text
      .replaceAll("{track_title}", trackTitle)
      .replaceAll("{title}", trackTitle)
      .replaceAll("{bpm}", String(bpm))
      .replaceAll("{stage_name}", profile.stageName)
      .replaceAll("{genre}", activeCatalogItem?.genreTag ?? profile.genre);
  };

  const filteredTemplates = templates.filter((t) => {
    if (categoryFilter === "all") return true;
    return t.category === categoryFilter;
  });

  const resetForm = () => {
    setEditingTemplateId(undefined);
    setNewTitle("");
    setNewDescription("");
    setNewCategory("kick_sound_design");
    setNewPillar("sound_design_tutorial");
    setNewDifficulty("daw_capture");
    setNewPlatforms(["instagram_reels", "tiktok", "youtube_shorts"]);
    setNewHook("");
    setNewCaption("");
    setNewShotsText("");
    setNewHashtagsText("");
  };

  const handleOpenEditTemplate = (tpl: IdeaTemplateRecord) => {
    setEditingTemplateId(tpl.id);
    setNewTitle(tpl.title);
    setNewDescription(tpl.description);
    setNewCategory(tpl.category);
    setNewPillar(tpl.pillar);
    setNewDifficulty(tpl.difficulty);
    setNewPlatforms(
      tpl.recommendedPlatforms?.length
        ? tpl.recommendedPlatforms.filter((p) =>
            PUBLISHABLE_PLATFORMS.includes(p as PublishablePlatform),
          )
        : ["instagram_reels", "tiktok", "youtube_shorts"],
    );
    setNewHook(tpl.hookFormulaEn || tpl.hookFormulaFr);
    setNewCaption(tpl.captionTemplateEn || tpl.captionTemplateFr);
    setNewShotsText((tpl.defaultShotList ?? []).join("\n"));
    setNewHashtagsText((tpl.suggestedHashtags ?? []).join(" "));
    setShowCreateForm(true);
  };

  const handleUseIdea = async (template: IdeaTemplateRecord) => {
    setInstantiatingId(template.id);
    try {
      const res = await instantiateIdeaTemplateServerFn({
        data: {
          templateId: template.id,
          catalogItemId: activeCatalogItem?.id ?? null,
          status: "ready",
        },
      });
      await onRefresh();
      toast.success(`Created post from "${template.title}"!`);
      onOpenCreatedPost(res.id);
    } catch {
      toast.error("Failed to instantiate template");
    } finally {
      setInstantiatingId(null);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newHook.trim()) {
      toast.error("Template title and Hook formula are required.");
      return;
    }

    const parsedShots = newShotsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const parsedTags = newHashtagsText
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith("#") ? t : `#${t}`));

    try {
      await createCustomIdeaTemplateServerFn({
        data: {
          id: editingTemplateId,
          title: newTitle.trim(),
          description: newDescription.trim() || "Reusable post template.",
          category: newCategory,
          pillar: newPillar,
          difficulty: newDifficulty,
          recommendedPlatforms: newPlatforms,
          hookFormulaEn: newHook.trim(),
          hookFormulaFr: newHook.trim(),
          captionTemplateEn: newCaption.trim(),
          captionTemplateFr: newCaption.trim(),
          defaultCtaEn: "",
          defaultCtaFr: "",
          defaultShotList: parsedShots,
          suggestedHashtags: parsedTags,
          whyItWorks: "Custom producer template.",
        },
      });
      await onRefresh();
      setShowCreateForm(false);
      resetForm();
      toast.success(editingTemplateId ? "Template updated!" : "Template saved!");
    } catch {
      toast.error("Failed to save template");
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await deleteCustomIdeaTemplateServerFn({ data: { id } });
      await onRefresh();
      toast.success("Deleted template");
    } catch {
      toast.error("Could not delete template");
    }
  };

  const toggleNewPlatform = (p: PublishablePlatform) => {
    setNewPlatforms((prev) =>
      prev.includes(p)
        ? prev.length > 1
          ? prev.filter((item) => item !== p)
          : prev
        : [...prev, p],
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Mode Switcher: Post Templates vs Multi-Post Release Rollouts */}
      <div className="flex flex-wrap items-center justify-between gap-3 border border-border/70 bg-card/45 p-3.5">
        <div className="inline-flex border border-border/70 bg-background/80 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setSection("templates")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3.5 py-1.5 font-semibold transition-colors",
              section === "templates"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <IconSparkles className="size-3.5" />
            Post Templates ({templates.length})
          </button>
          <button
            type="button"
            onClick={() => setSection("rollouts")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3.5 py-1.5 font-semibold transition-colors",
              section === "rollouts"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <IconRocket className="size-3.5" />
            Release Rollouts ({campaigns.length})
          </button>
        </div>

        {section === "templates" ? (
          <div className="flex flex-wrap items-center gap-2">
            {catalog.length > 0 ? (
              <select
                value={selectedCatalogId}
                onChange={(e) => setSelectedCatalogId(e.target.value)}
                className="border border-border/70 bg-background/85 px-2.5 py-1.5 text-xs text-foreground"
              >
                <option value="">Interpolate with: Generic</option>
                {catalog.map((item) => (
                  <option key={item.id} value={item.id}>
                    Track: {item.title} ({item.bpm ?? 200} BPM)
                  </option>
                ))}
              </select>
            ) : null}

            <Button
              size="sm"
              onClick={() => {
                if (showCreateForm) {
                  setShowCreateForm(false);
                  resetForm();
                } else {
                  setShowCreateForm(true);
                }
              }}
            >
              <IconPlus className="size-4" />
              {showCreateForm ? "Close Form" : "New Template"}
            </Button>
          </div>
        ) : null}
      </div>

      {section === "rollouts" ? (
        <CampaignsTab
          campaigns={campaigns}
          catalog={catalog}
          posts={posts}
          onOpenPost={onOpenPost}
          onRefresh={onRefresh}
        />
      ) : (
        <div className="space-y-5">
          {/* Create / Edit Template Form */}
          {showCreateForm ? (
            <Card className="border border-primary/40 bg-card/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {editingTemplateId ? "Edit Post Template" : "Create Reusable Post Template"}
                </CardTitle>
                <CardDescription className="text-xs">
                  Use {"{track_title}"} and {"{bpm}"} placeholders to auto-fill when selecting a track.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveTemplate} className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground">
                        Template Title *
                      </label>
                      <input
                        type="text"
                        required
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="e.g., 2nd Drop Switch Reveal"
                        className="mt-1 w-full border border-border/70 bg-background/90 px-3 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground">
                        Category
                      </label>
                      <select
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value as IdeaCategory)}
                        className="mt-1 w-full border border-border/70 bg-background/90 px-2.5 py-1.5 text-xs"
                      >
                        {Object.entries(IDEA_CATEGORY_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground">
                        Platforms
                      </label>
                      <div className="mt-1 flex gap-1.5">
                        {PUBLISHABLE_PLATFORMS.map((p) => {
                          const m = PLATFORM_META[p];
                          const active = newPlatforms.includes(p);
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => toggleNewPlatform(p)}
                              className={cn(
                                "inline-flex items-center gap-1 border px-2 py-1 text-xs",
                                active
                                  ? m.badgeClass
                                  : "border-border/50 bg-background/40 text-muted-foreground opacity-60",
                              )}
                            >
                              <m.Icon className="size-3" />
                              {m.shortLabel}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Hook Formula / Shorts Title *
                    </label>
                    <input
                      type="text"
                      required
                      value={newHook}
                      onChange={(e) => setNewHook(e.target.value)}
                      placeholder="Wait for the 2nd kick switch on {track_title} ({bpm} BPM)..."
                      className="mt-1 w-full border border-border/70 bg-background/90 px-3 py-2 text-xs font-semibold"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Caption Template
                    </label>
                    <textarea
                      rows={3}
                      value={newCaption}
                      onChange={(e) => setNewCaption(e.target.value)}
                      placeholder="Write the reusable caption body..."
                      className="mt-1 w-full border border-border/70 bg-background/90 p-2.5 text-xs"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground">
                        Suggested Hashtags
                      </label>
                      <input
                        type="text"
                        value={newHashtagsText}
                        onChange={(e) => setNewHashtagsText(e.target.value)}
                        placeholder="#uptempohardcore #zaagkick #lilsbd"
                        className="mt-1 w-full border border-border/70 bg-background/90 px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground">
                        Optional Shot List (1 per line)
                      </label>
                      <textarea
                        rows={2}
                        value={newShotsText}
                        onChange={(e) => setNewShotsText(e.target.value)}
                        placeholder="Screen record drop in DAW"
                        className="mt-1 w-full border border-border/70 bg-background/90 p-2 text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowCreateForm(false);
                        resetForm();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="sm">
                      {editingTemplateId ? "Update Template" : "Save Template"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {/* Category Filter Chips */}
          {templates.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategoryFilter("all")}
                className={cn(
                  "border px-2.5 py-1 text-xs font-medium",
                  categoryFilter === "all"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/70 bg-card/40 text-muted-foreground hover:text-foreground",
                )}
              >
                All ({templates.length})
              </button>
              {(Object.keys(IDEA_CATEGORY_LABELS) as IdeaCategory[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={cn(
                    "border px-2.5 py-1 text-xs font-medium",
                    categoryFilter === cat
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/70 bg-card/40 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {IDEA_CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          ) : null}

          {/* Templates Grid */}
          {filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-border/60 bg-card/25 py-10 text-center">
              <p className="text-sm font-bold text-foreground">No templates yet</p>
              <p className="max-w-md text-xs text-muted-foreground">
                Create a reusable template above or click &ldquo;Save Template&rdquo; inside any post in the drawer.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredTemplates.map((tpl) => {
                const diffMeta = DIFFICULTY_META[tpl.difficulty] ?? DIFFICULTY_META.daw_capture;
                const pillarMeta = PILLAR_META[tpl.pillar] ?? PILLAR_META.drop_showcase;
                const liveHook = previewInterpolate(tpl.hookFormulaEn || tpl.hookFormulaFr);
                const liveCaption = previewInterpolate(
                  tpl.captionTemplateEn || tpl.captionTemplateFr,
                );

                return (
                  <Card
                    key={tpl.id}
                    className="flex flex-col justify-between border border-border/70 bg-card/45"
                  >
                    <CardHeader className="space-y-2 pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          <span
                            className={cn(
                              "border px-1.5 py-0.5 text-[0.62rem] font-semibold",
                              pillarMeta.badgeClass,
                            )}
                          >
                            {pillarMeta.label}
                          </span>
                          <Badge variant="outline" className={cn("text-[0.62rem]", diffMeta.badgeClass)}>
                            {diffMeta.label}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => handleOpenEditTemplate(tpl)}
                            title="Edit template"
                          >
                            <IconEdit className="size-3.5" />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => handleDeleteTemplate(tpl.id)}
                            title="Delete template"
                          >
                            <IconTrash className="size-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>

                      <CardTitle className="text-base">{tpl.title}</CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      <div className="border-l-2 border-primary bg-primary/8 p-2.5 text-xs font-semibold text-foreground">
                        &ldquo;{liveHook}&rdquo;
                      </div>

                      {liveCaption ? (
                        <p className="line-clamp-3 text-xs text-muted-foreground">
                          {liveCaption}
                        </p>
                      ) : null}

                      <Button
                        size="sm"
                        className="w-full"
                        disabled={instantiatingId === tpl.id}
                        onClick={() => handleUseIdea(tpl)}
                      >
                        <IconBolt className="size-4" />
                        <span>
                          {instantiatingId === tpl.id
                            ? "Creating Post..."
                            : "Create & Schedule Post"}
                        </span>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
