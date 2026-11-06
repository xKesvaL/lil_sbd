import {
  IconBolt,
  IconCheck,
  IconCopy,
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
  const [categoryFilter, setCategoryFilter] = useState<IdeaCategory | "all" | "custom">(
    "all",
  );
  const [previewLang, setPreviewLang] = useState<"en" | "fr">("en");
  const [instantiatingId, setInstantiatingId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Custom template form state
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState<IdeaCategory>("kick_sound_design");
  const [newPillar, setNewPillar] = useState<ContentPillar>("sound_design_tutorial");
  const [newDifficulty, setNewDifficulty] = useState<IdeaDifficulty>("daw_capture");
  const [newHookEn, setNewHookEn] = useState("");
  const [newHookFr, setNewHookFr] = useState("");
  const [newCaptionEn, setNewCaptionEn] = useState("");
  const [newWhyItWorks, setNewWhyItWorks] = useState("");

  const activeCatalogItem = catalog.find((c) => c.id === selectedCatalogId) ?? catalog[0];

  const previewInterpolate = (text: string) => {
    const trackTitle = activeCatalogItem?.title ?? "KINO";
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
    if (categoryFilter === "custom") return !t.isSystem;
    return t.category === categoryFilter;
  });

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

  const handleCreateCustomTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newHookEn.trim()) {
      toast.error("Title and English Hook Formula are required.");
      return;
    }

    try {
      await createCustomIdeaTemplateServerFn({
        data: {
          title: newTitle.trim(),
          description: newDescription.trim() || "Custom producer template.",
          category: newCategory,
          pillar: newPillar,
          difficulty: newDifficulty,
          recommendedPlatforms: ["instagram_reels", "tiktok", "youtube_shorts"],
          hookFormulaEn: newHookEn.trim(),
          hookFormulaFr: newHookFr.trim() || newHookEn.trim(),
          captionTemplateEn: newCaptionEn.trim(),
          captionTemplateFr: newCaptionEn.trim(),
          defaultCtaEn: "Full track & free HDM course in bio.",
          defaultCtaFr: "Son complet & cours HDM gratuit en bio.",
          defaultShotList: [
            "0-3s: On-screen hook + immediate audio contrast",
            "3-12s: Main DAW / studio showcase",
          ],
          suggestedHashtags: ["#uptempohardcore", "#zaagkick", "#harddance", "#lilsbd"],
          whyItWorks:
            newWhyItWorks.trim() ||
            "Custom format tailored to your audience and workflow.",
        },
      });
      await onRefresh();
      setShowCreateForm(false);
      setNewTitle("");
      setNewDescription("");
      setNewHookEn("");
      setNewHookFr("");
      setNewCaptionEn("");
      setNewWhyItWorks("");
      toast.success("Added to your Idea Vault!");
    } catch {
      toast.error("Failed to create template");
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await deleteCustomIdeaTemplateServerFn({ data: { id } });
      await onRefresh();
      toast.success("Removed custom template");
    } catch {
      toast.error("Could not delete template");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Interactive Context & Filter Bar */}
      <div className="flex flex-col justify-between gap-4 border border-primary/30 bg-linear-to-r from-primary/15 via-card/55 to-card/45 p-5 backdrop-blur-md lg:flex-row lg:items-center">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge className="bg-primary text-primary-foreground">
              <IconSparkles className="mr-1 size-3.5" />
              Hard Dance & Producer Idea Vault
            </Badge>
            <span className="text-xs text-muted-foreground">
              Variables auto-adapt to your selected track or course module
            </span>
          </div>
          <h2 className="text-xl font-bold">
            Never stare at a blank screen before recording
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 border border-border/70 bg-background/80 px-3 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Bind Track / Lesson:
            </span>
            <select
              value={selectedCatalogId}
              onChange={(e) => setSelectedCatalogId(e.target.value)}
              className="bg-transparent text-xs font-bold text-foreground focus:outline-none"
            >
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
              EN Preview
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
              FR Preview
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreateForm((v) => !v)}
          >
            <IconPlus className="size-4" />
            Custom Template
          </Button>
        </div>
      </div>

      {/* Optional Create Custom Template Form */}
      {showCreateForm ? (
        <form
          onSubmit={handleCreateCustomTemplate}
          className="space-y-4 border border-primary/40 bg-card/65 p-5 backdrop-blur-md"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold">
              Create Reusable Producer Idea Template
            </h3>
            <span className="text-xs text-muted-foreground">
              Use {"{track_title}"}, {"{bpm}"}, and {"{stage_name}"} as dynamic placeholders
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Template Title (e.g., Raw Screech Sound Design)"
              className="border border-border/70 bg-background/80 px-3 py-2 text-sm"
              required
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as IdeaCategory)}
              className="border border-border/70 bg-background/80 px-3 py-2 text-sm"
            >
              {Object.entries(IDEA_CATEGORY_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={newDifficulty}
              onChange={(e) => setNewDifficulty(e.target.value as IdeaDifficulty)}
              className="border border-border/70 bg-background/80 px-3 py-2 text-sm"
            >
              {Object.entries(DIFFICULTY_META).map(([k, meta]) => (
                <option key={k} value={k}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              value={newHookEn}
              onChange={(e) => setNewHookEn(e.target.value)}
              placeholder="EN Hook Formula (e.g., How I made the screech in {track_title} at {bpm} BPM)"
              className="border border-border/70 bg-background/80 px-3 py-2 text-sm"
              required
            />
            <input
              type="text"
              value={newHookFr}
              onChange={(e) => setNewHookFr(e.target.value)}
              placeholder="FR Hook Formula (optional)"
              className="border border-border/70 bg-background/80 px-3 py-2 text-sm"
            />
          </div>

          <textarea
            rows={2}
            value={newCaptionEn}
            onChange={(e) => setNewCaptionEn(e.target.value)}
            placeholder="Caption template with {track_title} and {bpm} placeholders..."
            className="w-full border border-border/70 bg-background/80 p-3 text-sm"
          />

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateForm(false)}
            >
              Cancel
            </Button>
            <Button type="submit">
              <IconCheck className="size-4" />
              Save to Idea Vault
            </Button>
          </div>
        </form>
      ) : null}

      {/* Category Filter Pills */}
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
          All Formats ({templates.length})
        </button>
        {(Object.keys(IDEA_CATEGORY_LABELS) as IdeaCategory[]).map((cat) => (
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
            {IDEA_CATEGORY_LABELS[cat]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCategoryFilter("custom")}
          className={cn(
            "border px-3 py-1.5 text-xs font-semibold transition-colors",
            categoryFilter === "custom"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground",
          )}
        >
          My Custom Templates ({templates.filter((t) => !t.isSystem).length})
        </button>
      </div>

      {/* Templates Grid */}
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
                    {!tpl.isSystem ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(tpl.id)}
                        className="ml-1 text-muted-foreground hover:text-destructive"
                        title="Delete custom template"
                      >
                        <IconTrash className="size-4" />
                      </button>
                    ) : null}
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
                      Live On-Screen Hook ({previewLang.toUpperCase()})
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
                {/* Shot List Preview */}
                {tpl.defaultShotList?.length ? (
                  <div className="space-y-1.5">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      Filming / DAW Capture Structure:
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

                {/* Why It Works Insight */}
                <div className="border-l-2 border-emerald-500/60 bg-emerald-500/8 px-3 py-2 text-xs text-emerald-200/90">
                  <strong>Why it converts:</strong> {tpl.whyItWorks}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    className="flex-1"
                    disabled={instantiatingId === tpl.id}
                    onClick={() => handleUseIdea(tpl, "filming")}
                  >
                    <IconWand className="size-4" />
                    {instantiatingId === tpl.id
                      ? "Building Post..."
                      : `Use for ${activeCatalogItem?.title ?? "Track"} -> Open Copilot`}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={instantiatingId === tpl.id}
                    onClick={() => handleUseIdea(tpl, "idea")}
                    title="Add to Idea Backlog column"
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
    </div>
  );
}
