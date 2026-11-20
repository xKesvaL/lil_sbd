import {
  IconBolt,
  IconCheck,
  IconCopy,
  IconEdit,
  IconPlus,
  IconSparkles,
  IconTrash,
  IconWand,
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
  SocialPlatform,
  SocialPostRecord,
} from "#/db/schema";
import { cn } from "#/lib/utils";
import {
  createCustomIdeaTemplateServerFn,
  deleteCustomIdeaTemplateServerFn,
  instantiateIdeaTemplateServerFn,
} from "#/server/socials";
import { IDEA_CATEGORY_LABELS, PILLAR_META, PLATFORM_META } from "./social-constants";

interface IdeaVaultTabProps {
  templates: IdeaTemplateRecord[];
  catalog: ArtistCatalogItemRecord[];
  profile: ArtistProfileRecord;
  posts: SocialPostRecord[];
  onRefresh: () => Promise<void>;
  onOpenCreatedPost: (postId: string) => void;
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
  catalog,
  profile,
  onRefresh,
  onOpenCreatedPost,
}: IdeaVaultTabProps) {
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>(
    catalog[0]?.id ?? "",
  );
  const [categoryFilter, setCategoryFilter] = useState<IdeaCategory | "all">("all");
  const [previewLang, setPreviewLang] = useState<"en" | "fr">("en");
  const [instantiatingId, setInstantiatingId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | undefined>(
    undefined,
  );

  // Template form state
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
  const [newHookEn, setNewHookEn] = useState("");
  const [newHookFr, setNewHookFr] = useState("");
  const [newCaptionEn, setNewCaptionEn] = useState("");
  const [newCaptionFr, setNewCaptionFr] = useState("");
  const [newShotsText, setNewShotsText] = useState("");
  const [newHashtagsText, setNewHashtagsText] = useState("");
  const [newWhyItWorks, setNewWhyItWorks] = useState("");

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
    setNewHookEn("");
    setNewHookFr("");
    setNewCaptionEn("");
    setNewCaptionFr("");
    setNewShotsText("");
    setNewHashtagsText("");
    setNewWhyItWorks("");
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
        ? tpl.recommendedPlatforms
        : ["instagram_reels", "tiktok", "youtube_shorts"],
    );
    setNewHookEn(tpl.hookFormulaEn);
    setNewHookFr(tpl.hookFormulaFr);
    setNewCaptionEn(tpl.captionTemplateEn);
    setNewCaptionFr(tpl.captionTemplateFr);
    setNewShotsText((tpl.defaultShotList ?? []).join("\n"));
    setNewHashtagsText((tpl.suggestedHashtags ?? []).join(" "));
    setNewWhyItWorks(tpl.whyItWorks);
    setShowCreateForm(true);
  };

  const handleUseIdea = async (
    template: IdeaTemplateRecord,
    targetStatus: "idea" | "filming" = "filming",
  ) => {
    setInstantiatingId(template.id);
    try {
      const res = await instantiateIdeaTemplateServerFn({
        data: {
          templateId: template.id,
          catalogItemId: activeCatalogItem?.id ?? null,
          status: targetStatus,
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
    if (!newTitle.trim() || !newHookEn.trim()) {
      toast.error("Title and English Hook Formula are required.");
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
          description: newDescription.trim() || "Reusable producer post template.",
          category: newCategory,
          pillar: newPillar,
          difficulty: newDifficulty,
          recommendedPlatforms: newPlatforms,
          hookFormulaEn: newHookEn.trim(),
          hookFormulaFr: newHookFr.trim() || newHookEn.trim(),
          captionTemplateEn: newCaptionEn.trim(),
          captionTemplateFr: newCaptionFr.trim() || newCaptionEn.trim(),
          defaultCtaEn: profile.defaultBioLink
            ? `Full track & free HDM course — ${profile.defaultBioLink}`
            : "Link in bio.",
          defaultCtaFr: profile.defaultBioLink
            ? `Son complet & cours HDM gratuit — ${profile.defaultBioLink}`
            : "Lien en bio.",
          defaultShotList: parsedShots,
          suggestedHashtags: parsedTags,
          whyItWorks: newWhyItWorks.trim() || "Custom format tailored to your workflow.",
        },
      });
      await onRefresh();
      setShowCreateForm(false);
      resetForm();
      toast.success(
        editingTemplateId ? "Template updated!" : "Added to your Idea Vault!",
      );
    } catch {
      toast.error("Failed to save template");
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await deleteCustomIdeaTemplateServerFn({ data: { id } });
      await onRefresh();
      toast.success("Removed template from Idea Vault");
    } catch {
      toast.error("Could not delete template");
    }
  };

  const toggleNewPlatform = (p: SocialPlatform) => {
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
      {/* Top Interactive Context & Filter Bar */}
      <div className="flex flex-col justify-between gap-4 border border-primary/30 bg-linear-to-r from-primary/15 via-card/55 to-card/45 p-4 backdrop-blur-md sm:p-5 lg:flex-row lg:items-center">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-primary text-primary-foreground">
              <IconSparkles className="mr-1 size-3.5" />
              Producer Idea Vault
            </Badge>
            <span className="text-xs text-muted-foreground">
              Use {"{track_title}"}, {"{bpm}"}, and {"{stage_name}"} variables in your templates
            </span>
          </div>
          <h2 className="text-lg font-bold sm:text-xl">
            Reusable Hook & Post Formats ({templates.length})
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 border border-border/70 bg-background/80 px-2.5 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Preview with:
            </span>
            <select
              value={selectedCatalogId}
              onChange={(e) => setSelectedCatalogId(e.target.value)}
              className="bg-transparent text-xs font-bold text-foreground focus:outline-none"
            >
              <option value="" className="bg-background">
                Generic Variables
              </option>
              {catalog.map((item) => (
                <option key={item.id} value={item.id} className="bg-background">
                  {item.title} {item.bpm ? `(${item.bpm} BPM)` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="inline-flex border border-border/70 bg-background/80 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setPreviewLang("en")}
              className={cn(
                "px-2.5 py-1 font-semibold",
                previewLang === "en"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setPreviewLang("fr")}
              className={cn(
                "px-2.5 py-1 font-semibold",
                previewLang === "fr"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              FR
            </button>
          </div>

          <Button
            size="sm"
            onClick={() => {
              if (showCreateForm) {
                setShowCreateForm(false);
                resetForm();
              } else {
                resetForm();
                setShowCreateForm(true);
              }
            }}
          >
            <IconPlus className="size-4" />
            New Template
          </Button>
        </div>
      </div>

      {/* Create / Edit Template Form */}
      {showCreateForm ? (
        <form
          onSubmit={handleSaveTemplate}
          className="space-y-4 border border-primary/40 bg-card/65 p-4 backdrop-blur-md sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold">
              {editingTemplateId ? "Edit Idea Template" : "Create Reusable Idea Template"}
            </h3>
            <span className="text-xs text-muted-foreground">
              Dynamic placeholders: {"{track_title}"}, {"{bpm}"}, {"{stage_name}"}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Template Title *
              </label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g., Zaag Kick EQ Breakdown"
                className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Category
              </label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as IdeaCategory)}
                className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
              >
                {Object.entries(IDEA_CATEGORY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Content Pillar
              </label>
              <select
                value={newPillar}
                onChange={(e) => setNewPillar(e.target.value as ContentPillar)}
                className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
              >
                {Object.entries(PILLAR_META).map(([k, meta]) => (
                  <option key={k} value={k}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Production Effort
              </label>
              <select
                value={newDifficulty}
                onChange={(e) => setNewDifficulty(e.target.value as IdeaDifficulty)}
                className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
              >
                {Object.entries(DIFFICULTY_META).map(([k, meta]) => (
                  <option key={k} value={k}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Short Description
              </label>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What this format shows and when to use it..."
                className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Recommended Platforms
              </label>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(Object.keys(PLATFORM_META) as SocialPlatform[]).map((p) => {
                  const meta = PLATFORM_META[p];
                  const active = newPlatforms.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => toggleNewPlatform(p)}
                      className={cn(
                        "inline-flex items-center gap-1 border px-2 py-1 text-xs font-medium",
                        active
                          ? meta.badgeClass
                          : "border-border/50 bg-background/40 text-muted-foreground opacity-60",
                      )}
                    >
                      <meta.Icon className="size-3.5" />
                      {meta.shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                EN On-Screen Hook Formula *
              </label>
              <input
                type="text"
                value={newHookEn}
                onChange={(e) => setNewHookEn(e.target.value)}
                placeholder="e.g., How I made the kick in {track_title} ({bpm} BPM)"
                className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                FR On-Screen Hook Formula (Optional)
              </label>
              <input
                type="text"
                value={newHookFr}
                onChange={(e) => setNewHookFr(e.target.value)}
                placeholder="e.g., Comment j'ai fait le kick de {track_title} ({bpm} BPM)"
                className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                EN Caption Template
              </label>
              <textarea
                rows={3}
                value={newCaptionEn}
                onChange={(e) => setNewCaptionEn(e.target.value)}
                placeholder="Caption body with {track_title} and {bpm} placeholders..."
                className="w-full border border-border/70 bg-background/80 p-3 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                FR Caption Template (Optional)
              </label>
              <textarea
                rows={3}
                value={newCaptionFr}
                onChange={(e) => setNewCaptionFr(e.target.value)}
                placeholder="French caption body..."
                className="w-full border border-border/70 bg-background/80 p-3 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Default Shot List (1 step per line)
              </label>
              <textarea
                rows={2}
                value={newShotsText}
                onChange={(e) => setNewShotsText(e.target.value)}
                placeholder={"0-3s: Hook overlay\n3-12s: Main drop"}
                className="w-full border border-border/70 bg-background/80 p-2.5 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Suggested Hashtags
              </label>
              <textarea
                rows={2}
                value={newHashtagsText}
                onChange={(e) => setNewHashtagsText(e.target.value)}
                placeholder="#uptempohardcore #zaagkick #harddance"
                className="w-full border border-border/70 bg-background/80 p-2.5 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Why It Works / Notes
              </label>
              <textarea
                rows={2}
                value={newWhyItWorks}
                onChange={(e) => setNewWhyItWorks(e.target.value)}
                placeholder="Why this format converts..."
                className="w-full border border-border/70 bg-background/80 p-2.5 text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowCreateForm(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit">
              <IconCheck className="size-4" />
              {editingTemplateId ? "Update Template" : "Save Template"}
            </Button>
          </div>
        </form>
      ) : null}

      {/* Category Filter Pills (shown when templates exist) */}
      {templates.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={cn(
              "border px-3 py-1.5 text-xs font-semibold transition-colors",
              categoryFilter === "all"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground",
            )}
          >
            All Templates ({templates.length})
          </button>
          {(Object.keys(IDEA_CATEGORY_LABELS) as IdeaCategory[]).map((cat) => {
            const count = templates.filter((t) => t.category === cat).length;
            if (count === 0) return null;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  "border px-3 py-1.5 text-xs font-semibold transition-colors",
                  categoryFilter === cat
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground",
                )}
              >
                {IDEA_CATEGORY_LABELS[cat]} ({count})
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Templates Grid or Clean Empty State */}
      {filteredTemplates.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-border/70 bg-card/30 p-10 text-center">
          <div className="flex size-12 items-center justify-center border border-primary/40 bg-primary/15 text-primary">
            <IconSparkles className="size-6" />
          </div>
          <div className="max-w-md space-y-1">
            <h3 className="text-base font-bold text-foreground">
              Your Idea Vault is empty
            </h3>
            <p className="text-xs text-muted-foreground">
              Save reusable post structures, hook formulas, and shot lists here—or click{" "}
              <strong className="text-foreground">Save as Template</strong> inside the Publishing
              Copilot on any post you want to reuse.
            </p>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setShowCreateForm(true);
            }}
          >
            <IconPlus className="size-4" />
            Create Your First Idea Template
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredTemplates.map((tpl) => {
            const pillarMeta = PILLAR_META[tpl.pillar] ?? PILLAR_META.drop_showcase;
            const diffMeta =
              DIFFICULTY_META[tpl.difficulty] ?? DIFFICULTY_META.daw_capture;
            const liveHook = previewInterpolate(
              previewLang === "en" ? tpl.hookFormulaEn : tpl.hookFormulaFr,
            );

            return (
              <Card
                key={tpl.id}
                className="flex flex-col justify-between border border-border/60 bg-card/45 backdrop-blur-sm transition-colors hover:border-primary/50"
              >
                <CardHeader className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "border px-2 py-0.5 text-[0.65rem] font-semibold",
                          pillarMeta.badgeClass,
                        )}
                      >
                        {pillarMeta.label}
                      </span>
                      <span
                        className={cn(
                          "border px-2 py-0.5 text-[0.65rem] font-medium",
                          diffMeta.badgeClass,
                        )}
                      >
                        {diffMeta.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {(tpl.recommendedPlatforms ?? []).map((p) => {
                        const pMeta = PLATFORM_META[p];
                        if (!pMeta) return null;
                        return (
                          <span
                            key={p}
                            title={pMeta.label}
                            className={cn(
                              "inline-flex size-6 items-center justify-center border",
                              pMeta.badgeClass,
                            )}
                          >
                            <pMeta.Icon className="size-3.5" />
                          </span>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => handleOpenEditTemplate(tpl)}
                        className="ml-1 p-1 text-muted-foreground hover:text-foreground"
                        title="Edit template"
                      >
                        <IconEdit className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(tpl.id)}
                        className="p-1 text-muted-foreground hover:text-destructive"
                        title="Delete template"
                      >
                        <IconTrash className="size-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <CardTitle className="text-lg">{tpl.title}</CardTitle>
                    <CardDescription className="mt-1 leading-relaxed">
                      {tpl.description}
                    </CardDescription>
                  </div>

                  {/* Live Interpolated Hook Box */}
                  <div className="space-y-1.5 border border-primary/30 bg-background/80 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-primary">
                        Live Hook Preview ({previewLang.toUpperCase()})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(liveHook);
                          toast.success("Copied hook to clipboard!");
                        }}
                        className="inline-flex items-center gap-1 text-[0.68rem] text-muted-foreground hover:text-foreground"
                      >
                        <IconCopy className="size-3" />
                        Copy
                      </button>
                    </div>
                    <p className="text-sm font-bold text-foreground">
                      &ldquo;{liveHook}&rdquo;
                    </p>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {tpl.defaultShotList?.length ? (
                    <div className="space-y-1.5">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                        Shot List Structure:
                      </p>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {tpl.defaultShotList.map((shot, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                            <span>{previewInterpolate(shot)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {tpl.whyItWorks ? (
                    <div className="border-l-2 border-emerald-500/60 bg-emerald-500/8 px-3 py-2 text-xs text-emerald-200/90">
                      <strong>Note:</strong> {tpl.whyItWorks}
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      className="flex-1"
                      disabled={instantiatingId === tpl.id}
                      onClick={() => handleUseIdea(tpl, "filming")}
                    >
                      <IconWand className="size-4" />
                      {instantiatingId === tpl.id
                        ? "Building Post..."
                        : activeCatalogItem
                          ? `Use for ${activeCatalogItem.title}`
                          : "Use Template -> Open Copilot"}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={instantiatingId === tpl.id}
                      onClick={() => handleUseIdea(tpl, "idea")}
                      title="Add to Idea Backlog"
                    >
                      <IconBolt className="size-4" />
                      + Backlog
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
