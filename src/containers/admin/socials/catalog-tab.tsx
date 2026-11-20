import {
  IconCheck,
  IconCopy,
  IconDisc,
  IconEdit,
  IconHash,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconX,
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
  CatalogItemType,
  ContentPillar,
  HashtagPresetRecord,
  SocialPlatform,
} from "#/db/schema";
import {
  createHashtagPresetServerFn,
  deleteCatalogItemServerFn,
  deleteHashtagPresetServerFn,
  syncLilSbdCatalogServerFn,
  updateArtistProfileServerFn,
  upsertCatalogItemServerFn,
} from "#/server/socials";

interface CatalogTabProps {
  profile: ArtistProfileRecord;
  catalog: ArtistCatalogItemRecord[];
  hashtagPresets: HashtagPresetRecord[];
  onRefresh: () => Promise<void>;
}

export function CatalogTab({
  profile,
  catalog,
  hashtagPresets,
  onRefresh,
}: CatalogTabProps) {
  // Artist Profile form state
  const [stageName, setStageName] = useState(profile.stageName);
  const [genre, setGenre] = useState(profile.genre);
  const [tagline, setTagline] = useState(profile.tagline);
  const [primaryLanguage, setPrimaryLanguage] = useState<
    "en" | "fr" | "bilingual"
  >((profile.primaryLanguage as "en" | "fr" | "bilingual") || "bilingual");
  const [defaultBioLink, setDefaultBioLink] = useState(profile.defaultBioLink);
  const [weeklyPostTarget, setWeeklyPostTarget] = useState(
    profile.weeklyPostTarget || 5,
  );
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Catalog Item form state (Create + Edit)
  const [showAddTrack, setShowAddTrack] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | undefined>(
    undefined,
  );
  const [itemType, setItemType] = useState<CatalogItemType>("track");
  const [itemTitle, setItemTitle] = useState("");
  const [itemAlbum, setItemAlbum] = useState("");
  const [itemReleaseDate, setItemReleaseDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [itemBpm, setItemBpm] = useState(200);
  const [itemKey, setItemKey] = useState("F Minor");
  const [itemSpotify, setItemSpotify] = useState("");
  const [itemSoundcloud, setItemSoundcloud] = useState("");
  const [itemArtwork, setItemArtwork] = useState("");

  // Hashtag Preset form state
  const [showAddPreset, setShowAddPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetPlatform, setPresetPlatform] = useState<SocialPlatform | "all">(
    "all",
  );
  const [presetPillar, setPresetPillar] = useState<ContentPillar | "all">(
    "all",
  );
  const [presetTagsInput, setPresetTagsInput] = useState("");

  const resetTrackForm = () => {
    setEditingItemId(undefined);
    setItemType("track");
    setItemTitle("");
    setItemAlbum("");
    setItemReleaseDate(new Date().toISOString().slice(0, 10));
    setItemBpm(200);
    setItemKey("F Minor");
    setItemSpotify("");
    setItemSoundcloud("");
    setItemArtwork("");
    setShowAddTrack(false);
  };

  const handleEditItem = (item: ArtistCatalogItemRecord) => {
    setEditingItemId(item.id);
    setItemType(item.type as CatalogItemType);
    setItemTitle(item.title);
    setItemAlbum(item.albumOrChapter ?? "");
    setItemReleaseDate(item.releaseDate);
    setItemBpm(item.bpm ?? 200);
    setItemKey(item.keySignature ?? "F Minor");
    setItemSpotify(item.streamingLinks?.spotify ?? "");
    setItemSoundcloud(item.streamingLinks?.soundcloud ?? "");
    setItemArtwork(item.artworkUrl ?? "");
    setShowAddTrack(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      await updateArtistProfileServerFn({
        data: {
          stageName: stageName.trim() || "LIL SBD",
          genre: genre.trim() || "Uptempo Hardcore",
          tagline: tagline.trim(),
          primaryLanguage,
          defaultBioLink: defaultBioLink.trim(),
          weeklyPostTarget: Number(weeklyPostTarget) || 5,
        },
      });
      await onRefresh();
      toast.success("Producer profile & targets updated!");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSyncCatalog = async () => {
    setIsSyncing(true);
    try {
      const res = await syncLilSbdCatalogServerFn();
      await onRefresh();
      toast.success(
        res.syncedCount > 0
          ? `Imported ${res.syncedCount} item(s) from your site discography & course!`
          : "All site releases & course modules are already in your catalog.",
      );
    } catch {
      toast.error("Failed to import site catalog");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveCatalogItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemTitle.trim()) return;

    try {
      await upsertCatalogItemServerFn({
        data: {
          id: editingItemId,
          type: itemType,
          title: itemTitle.trim(),
          albumOrChapter: itemAlbum.trim() || undefined,
          releaseDate: itemReleaseDate,
          bpm: Number(itemBpm) || 200,
          keySignature: itemKey.trim() || "F Minor",
          genreTag: genre,
          artworkUrl: itemArtwork.trim() || undefined,
          streamingLinks: {
            spotify: itemSpotify.trim() || undefined,
            soundcloud: itemSoundcloud.trim() || undefined,
          },
        },
      });
      await onRefresh();
      toast.success(
        editingItemId
          ? `Updated "${itemTitle.trim()}"`
          : `Added "${itemTitle.trim()}" to your artist catalog!`,
      );
      resetTrackForm();
    } catch {
      toast.error("Could not save catalog item");
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await deleteCatalogItemServerFn({ data: { id } });
      await onRefresh();
      toast.success("Removed item from catalog");
    } catch {
      toast.error("Could not remove item");
    }
  };

  const handleCreatePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedTags = presetTagsInput
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith("#") ? t : `#${t}`));

    if (!presetName.trim() || parsedTags.length === 0) {
      toast.error("Provide a preset name and at least one hashtag");
      return;
    }

    try {
      await createHashtagPresetServerFn({
        data: {
          name: presetName.trim(),
          platform: presetPlatform,
          pillar: presetPillar,
          tags: parsedTags,
        },
      });
      await onRefresh();
      setPresetName("");
      setPresetTagsInput("");
      setShowAddPreset(false);
      toast.success(`Saved hashtag pack "${presetName.trim()}"`);
    } catch {
      toast.error("Failed to save hashtag pack");
    }
  };

  const handleDeletePreset = async (id: string) => {
    try {
      await deleteHashtagPresetServerFn({ data: { id } });
      await onRefresh();
      toast.success("Deleted hashtag pack");
    } catch {
      toast.error("Could not delete hashtag pack");
    }
  };

  return (
    <div className="space-y-6">
      {/* Producer Brand Profile & Multi-Tenant Settings */}
      <Card className="border border-border/60 bg-card/45 backdrop-blur-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg">
                Producer Brand Identity & Weekly Cadence
              </CardTitle>
              <CardDescription>
                Scoped to your account. Used to personalize hooks, captions,
                CTAs, and weekly publishing targets.
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-primary/40 text-xs">
              Artist Workspace
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Artist / Stage Name
                </label>
                <input
                  type="text"
                  value={stageName}
                  onChange={(e) => setStageName(e.target.value)}
                  className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Core Genre / Niche
                </label>
                <input
                  type="text"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Default Copilot Language
                </label>
                <select
                  value={primaryLanguage}
                  onChange={(e) =>
                    setPrimaryLanguage(
                      e.target.value as "en" | "fr" | "bilingual",
                    )
                  }
                  className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
                >
                  <option value="bilingual">
                    Bilingual (EN Primary + FR Toggle)
                  </option>
                  <option value="en">English Primary</option>
                  <option value="fr">French Primary</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Weekly Post Goal
                </label>
                <input
                  type="number"
                  min={1}
                  max={21}
                  value={weeklyPostTarget}
                  onChange={(e) =>
                    setWeeklyPostTarget(Number(e.target.value) || 5)
                  }
                  className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Artist Positioning Tagline
                </label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="e.g., Raw Uptempo Hardcore & Industrial Sound Design"
                  className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Default Bio / Funnel Link
                </label>
                <input
                  type="text"
                  value={defaultBioLink}
                  onChange={(e) => setDefaultBioLink(e.target.value)}
                  placeholder="https://lilsbd.com"
                  className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSavingProfile}>
                <IconCheck className="size-4" />
                {isSavingProfile ? "Saving..." : "Save Brand Settings"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Artist Catalog Section */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">
              Artist Catalog & Course Modules ({catalog.length})
            </h3>
            <p className="text-xs text-muted-foreground">
              Every track, EP, and course module here can be linked to posts,
              Idea Vault templates, and Release Campaigns.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={handleSyncCatalog}
              disabled={isSyncing}
            >
              <IconRefresh className="size-4" />
              {isSyncing ? "Importing..." : "Import from Site Discography"}
            </Button>
            <Button
              onClick={() => {
                if (showAddTrack) {
                  resetTrackForm();
                } else {
                  setShowAddTrack(true);
                }
              }}
            >
              {showAddTrack ? (
                <>
                  <IconX className="size-4" />
                  Close Form
                </>
              ) : (
                <>
                  <IconPlus className="size-4" />
                  Add Track / Asset
                </>
              )}
            </Button>
          </div>
        </div>

        {showAddTrack ? (
          <form
            onSubmit={handleSaveCatalogItem}
            className="space-y-4 border border-primary/40 bg-card/65 p-4 sm:p-5 backdrop-blur-md"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold">
                {editingItemId
                  ? "Edit Catalog Item"
                  : "Add Track, EP, or Course Lesson to Your Catalog"}
              </h4>
              {editingItemId ? (
                <Badge variant="outline" className="text-[0.65rem]">
                  Editing Mode
                </Badge>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Asset Type
                </label>
                <select
                  value={itemType}
                  onChange={(e) =>
                    setItemType(e.target.value as CatalogItemType)
                  }
                  className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
                >
                  <option value="track">Single / Track</option>
                  <option value="ep">EP / Album</option>
                  <option value="course_lesson">Course Lesson / Tutorial</option>
                  <option value="lead_magnet">Sample Pack / Free Download</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Title
                </label>
                <input
                  type="text"
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                  placeholder="e.g., HYPERZAAG VIP"
                  className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  EP / Chapter
                </label>
                <input
                  type="text"
                  value={itemAlbum}
                  onChange={(e) => setItemAlbum(e.target.value)}
                  placeholder="e.g., DEAD OPS EP"
                  className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Release Date
                </label>
                <input
                  type="date"
                  value={itemReleaseDate}
                  onChange={(e) => setItemReleaseDate(e.target.value)}
                  className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  BPM
                </label>
                <input
                  type="number"
                  value={itemBpm}
                  onChange={(e) => setItemBpm(Number(e.target.value) || 200)}
                  placeholder="200"
                  className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Cover Art Path / URL
                </label>
                <input
                  type="text"
                  value={itemArtwork}
                  onChange={(e) => setItemArtwork(e.target.value)}
                  placeholder="/covers/DEAD-OPS.png (optional)"
                  className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Spotify Link
                </label>
                <input
                  type="url"
                  value={itemSpotify}
                  onChange={(e) => setItemSpotify(e.target.value)}
                  placeholder="https://open.spotify.com/..."
                  className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  SoundCloud Link
                </label>
                <input
                  type="url"
                  value={itemSoundcloud}
                  onChange={(e) => setItemSoundcloud(e.target.value)}
                  placeholder="https://soundcloud.com/..."
                  className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={resetTrackForm}>
                Cancel
              </Button>
              <Button type="submit">
                <IconCheck className="size-4" />
                {editingItemId ? "Update Asset" : "Save Asset"}
              </Button>
            </div>
          </form>
        ) : null}

        {catalog.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-border/70 bg-card/30 px-4 py-12 text-center">
            <IconDisc className="size-8 text-muted-foreground" />
            <div className="max-w-md space-y-1">
              <p className="text-sm font-semibold text-foreground">
                Your artist catalog is currently empty
              </p>
              <p className="text-xs text-muted-foreground">
                Add your tracks, EPs, or course lessons manually, or import your
                existing releases from the website discography with one click.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={handleSyncCatalog}
                disabled={isSyncing}
              >
                <IconRefresh className="size-3.5" />
                {isSyncing ? "Importing..." : "Import from Site Discography"}
              </Button>
              <Button size="sm" onClick={() => setShowAddTrack(true)}>
                <IconPlus className="size-3.5" />
                Add Track Manually
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 border border-border/60 bg-card/45 p-3.5 backdrop-blur-sm transition-colors hover:border-primary/40"
              >
                <div className="flex min-w-0 items-start gap-3">
                  {item.artworkUrl ? (
                    <img
                      src={item.artworkUrl}
                      alt={item.title}
                      className="size-14 shrink-0 border border-white/15 object-cover"
                    />
                  ) : (
                    <div className="flex size-14 shrink-0 items-center justify-center border border-primary/30 bg-primary/10 text-primary">
                      <IconDisc className="size-6" />
                    </div>
                  )}

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className="text-[0.62rem] uppercase"
                      >
                        {item.type.replace("_", " ")}
                      </Badge>
                      {item.bpm ? (
                        <span className="font-mono text-[0.68rem] text-primary">
                          {item.bpm} BPM
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate font-bold text-foreground">
                      {item.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.albumOrChapter ?? "Single"} •{" "}
                      {new Date(item.releaseDate).toLocaleDateString(
                        undefined,
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        },
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {item.streamingLinks?.spotify ? (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          item.streamingLinks.spotify!,
                        );
                        toast.success(`Copied Spotify link for ${item.title}`);
                      }}
                      className="p-1 text-muted-foreground hover:text-foreground"
                      title="Copy Spotify URL"
                    >
                      <IconCopy className="size-4" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleEditItem(item)}
                    className="p-1 text-muted-foreground hover:text-foreground"
                    title="Edit catalog item"
                  >
                    <IconEdit className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(item.id)}
                    className="p-1 text-muted-foreground hover:text-destructive"
                    title="Remove from catalog"
                  >
                    <IconTrash className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hashtag Preset Packs Section */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">
              Hashtag Preset Packs ({hashtagPresets.length})
            </h3>
            <p className="text-xs text-muted-foreground">
              Reusable hashtag groups available for 1-click insertion inside the
              Publishing Copilot.
            </p>
          </div>

          <Button
            variant="outline"
            onClick={() => setShowAddPreset((prev) => !prev)}
          >
            {showAddPreset ? (
              <>
                <IconX className="size-4" />
                Close
              </>
            ) : (
              <>
                <IconPlus className="size-4" />
                New Hashtag Pack
              </>
            )}
          </Button>
        </div>

        {showAddPreset ? (
          <form
            onSubmit={handleCreatePreset}
            className="space-y-4 border border-primary/40 bg-card/65 p-4 sm:p-5 backdrop-blur-md"
          >
            <h4 className="text-sm font-bold">Create Reusable Hashtag Pack</h4>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Pack Name
                </label>
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="e.g., Uptempo Drop Tags"
                  className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Target Platform
                </label>
                <select
                  value={presetPlatform}
                  onChange={(e) =>
                    setPresetPlatform(e.target.value as SocialPlatform | "all")
                  }
                  className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
                >
                  <option value="all">All Platforms</option>
                  <option value="tiktok">TikTok</option>
                  <option value="instagram">Instagram</option>
                  <option value="youtube">YouTube Shorts</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Pillar
                </label>
                <select
                  value={presetPillar}
                  onChange={(e) =>
                    setPresetPillar(e.target.value as ContentPillar | "all")
                  }
                  className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
                >
                  <option value="all">All Pillars</option>
                  <option value="release_promo">Release Drop / Promo</option>
                  <option value="studio_process">Studio / Sound Design</option>
                  <option value="course_education">Course / Tutorial</option>
                  <option value="live_dj">Live / Crowd / Rave</option>
                  <option value="artist_story">Artist Story / Mindset</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Hashtags (space or comma separated)
              </label>
              <input
                type="text"
                value={presetTagsInput}
                onChange={(e) => setPresetTagsInput(e.target.value)}
                placeholder="#uptempohardcore #hardcoretechno #flstudio #gabber #sounddesign"
                className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm font-mono"
                required
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddPreset(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                <IconCheck className="size-4" />
                Save Hashtag Pack
              </Button>
            </div>
          </form>
        ) : null}

        {hashtagPresets.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-border/70 bg-card/30 px-4 py-8 text-center">
            <IconHash className="size-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              No saved hashtag packs yet. Create a pack here or directly inside
              the Publishing Copilot.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {hashtagPresets.map((preset) => (
              <div
                key={preset.id}
                className="flex flex-col justify-between gap-2 border border-border/60 bg-card/45 p-3.5"
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-foreground">
                      {preset.name}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleDeletePreset(preset.id)}
                      className="p-1 text-muted-foreground hover:text-destructive"
                      title="Delete hashtag pack"
                    >
                      <IconTrash className="size-3.5" />
                    </button>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    {preset.tags.join(" ")}
                  </p>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[0.65rem] uppercase text-muted-foreground">
                    {preset.platform} • {preset.tags.length} tags
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(preset.tags.join(" "));
                      toast.success(`Copied "${preset.name}" tags`);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    <IconCopy className="size-3" />
                    Copy
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
