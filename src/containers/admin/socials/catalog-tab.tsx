import {
  IconCheck,
  IconCopy,
  IconDisc,
  IconPlus,
  IconRefresh,
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
  CatalogItemType,
} from "#/db/schema";
import {
  deleteCatalogItemServerFn,
  syncLilSbdCatalogServerFn,
  updateArtistProfileServerFn,
  upsertCatalogItemServerFn,
} from "#/server/socials";

interface CatalogTabProps {
  profile: ArtistProfileRecord;
  catalog: ArtistCatalogItemRecord[];
  onRefresh: () => Promise<void>;
}

export function CatalogTab({ profile, catalog, onRefresh }: CatalogTabProps) {
  // Artist Profile form state
  const [stageName, setStageName] = useState(profile.stageName);
  const [genre, setGenre] = useState(profile.genre);
  const [tagline, setTagline] = useState(profile.tagline);
  const [primaryLanguage, setPrimaryLanguage] = useState<
    "en" | "fr" | "bilingual"
  >(
    (profile.primaryLanguage as "en" | "fr" | "bilingual") || "bilingual",
  );
  const [defaultBioLink, setDefaultBioLink] = useState(profile.defaultBioLink);
  const [weeklyPostTarget, setWeeklyPostTarget] = useState(
    profile.weeklyPostTarget || 5,
  );
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // New Catalog Item modal/form state
  const [showAddTrack, setShowAddTrack] = useState(false);
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
  const [itemArtwork, setItemArtwork] = useState("/covers/DEAD-OPS.png");

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
          ? `Synced ${res.syncedCount} new item(s) from songs.ts & course!`
          : "All LIL SBD releases & course pillars are already in sync.",
      );
    } catch {
      toast.error("Failed to sync catalog");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateCatalogItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemTitle.trim()) return;

    try {
      await upsertCatalogItemServerFn({
        data: {
          type: itemType,
          title: itemTitle.trim(),
          albumOrChapter: itemAlbum.trim() || undefined,
          releaseDate: itemReleaseDate,
          bpm: Number(itemBpm) || 200,
          keySignature: itemKey.trim() || "F Minor",
          genreTag: genre,
          artworkUrl: itemArtwork.trim() || "/covers/DEAD-OPS.png",
          streamingLinks: {
            spotify: itemSpotify.trim() || undefined,
            soundcloud: itemSoundcloud.trim() || undefined,
          },
        },
      });
      await onRefresh();
      setShowAddTrack(false);
      setItemTitle("");
      setItemAlbum("");
      setItemSpotify("");
      setItemSoundcloud("");
      toast.success(`Added "${itemTitle}" to your artist catalog!`);
    } catch {
      toast.error("Could not add catalog item");
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
                Scoped to your account (`user_id`). Used to auto-fill hooks, captions, CTAs, and
                consistency streaks.
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-primary/40 text-xs">
              Multi-Producer Ready
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
                    setPrimaryLanguage(e.target.value as "en" | "fr" | "bilingual")
                  }
                  className="w-full border border-border/70 bg-background/80 px-3 py-2 text-sm"
                >
                  <option value="bilingual">Bilingual (EN Primary + FR Toggle)</option>
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
                  onChange={(e) => setWeeklyPostTarget(Number(e.target.value) || 5)}
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
              Your Artist Catalog & Course Modules ({catalog.length})
            </h3>
            <p className="text-xs text-muted-foreground">
              Every track, EP, and course module here can be bound to Idea Vault templates and
              Release Campaigns.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleSyncCatalog}
              disabled={isSyncing}
            >
              <IconRefresh className="size-4" />
              {isSyncing ? "Syncing..." : "Sync LIL SBD Site Catalog"}
            </Button>
            <Button onClick={() => setShowAddTrack((v) => !v)}>
              <IconPlus className="size-4" />
              Add Track / Asset
            </Button>
          </div>
        </div>

        {showAddTrack ? (
          <form
            onSubmit={handleCreateCatalogItem}
            className="space-y-4 border border-primary/40 bg-card/65 p-5 backdrop-blur-md"
          >
            <h4 className="text-sm font-bold">
              Add Unreleased Track, EP, or Course Lesson to Your Catalog
            </h4>
            <div className="grid gap-3 sm:grid-cols-4">
              <select
                value={itemType}
                onChange={(e) => setItemType(e.target.value as CatalogItemType)}
                className="border border-border/70 bg-background/80 px-3 py-2 text-sm"
              >
                <option value="track">Single / Track</option>
                <option value="ep">EP / Album</option>
                <option value="course_lesson">Course Lesson / Tutorial</option>
                <option value="lead_magnet">Sample Pack / Free Download</option>
              </select>

              <input
                type="text"
                value={itemTitle}
                onChange={(e) => setItemTitle(e.target.value)}
                placeholder="Title (e.g., HYPERZAAG VIP)"
                className="border border-border/70 bg-background/80 px-3 py-2 text-sm"
                required
              />

              <input
                type="text"
                value={itemAlbum}
                onChange={(e) => setItemAlbum(e.target.value)}
                placeholder="EP / Chapter (e.g., DEAD OPS EP)"
                className="border border-border/70 bg-background/80 px-3 py-2 text-sm"
              />

              <input
                type="date"
                value={itemReleaseDate}
                onChange={(e) => setItemReleaseDate(e.target.value)}
                className="border border-border/70 bg-background/80 px-3 py-2 text-sm"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <input
                type="number"
                value={itemBpm}
                onChange={(e) => setItemBpm(Number(e.target.value) || 200)}
                placeholder="BPM (e.g., 205)"
                className="border border-border/70 bg-background/80 px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={itemArtwork}
                onChange={(e) => setItemArtwork(e.target.value)}
                placeholder="Artwork URL (/covers/DEAD-OPS.png)"
                className="border border-border/70 bg-background/80 px-3 py-2 text-sm"
              />
              <input
                type="url"
                value={itemSpotify}
                onChange={(e) => setItemSpotify(e.target.value)}
                placeholder="Spotify URL (optional)"
                className="border border-border/70 bg-background/80 px-3 py-2 text-sm"
              />
              <input
                type="url"
                value={itemSoundcloud}
                onChange={(e) => setItemSoundcloud(e.target.value)}
                placeholder="SoundCloud URL (optional)"
                className="border border-border/70 bg-background/80 px-3 py-2 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddTrack(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                <IconCheck className="size-4" />
                Save Asset
              </Button>
            </div>
          </form>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {catalog.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 border border-border/60 bg-card/45 p-3.5 backdrop-blur-sm"
            >
              <div className="flex items-start gap-3 min-w-0">
                {item.artworkUrl ? (
                  <img
                    src={item.artworkUrl}
                    alt={item.title}
                    className="size-14 shrink-0 object-cover border border-white/15"
                  />
                ) : (
                  <div className="flex size-14 shrink-0 items-center justify-center border border-primary/30 bg-primary/10 text-primary">
                    <IconDisc className="size-6" />
                  </div>
                )}

                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[0.62rem] uppercase">
                      {item.type.replace("_", " ")}
                    </Badge>
                    {item.bpm ? (
                      <span className="text-[0.68rem] font-mono text-primary">
                        {item.bpm} BPM
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate font-bold text-foreground">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.albumOrChapter ?? "Single"} •{" "}
                    {new Date(item.releaseDate).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1">
                {item.streamingLinks?.spotify ? (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(item.streamingLinks.spotify!);
                      toast.success(`Copied Spotify link for ${item.title}`);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                    title="Copy Spotify URL"
                  >
                    <IconCopy className="size-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => handleDeleteItem(item.id)}
                  className="text-xs text-muted-foreground hover:text-destructive"
                  title="Remove from catalog"
                >
                  <IconTrash className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
