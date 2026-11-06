import {
  IconAlertTriangle,
  IconCircleCheck,
  IconDownload,
  IconFileZip,
  IconLoader2,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
} from "@tabler/icons-react";
import { useEffect, useRef } from "react";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import { Progress } from "#/components/ui/progress.tsx";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group.tsx";
import type { TrackDownloadStatus } from "#/hooks/use-track-download.ts";
import { useAudioStore } from "#/lib/audio-store.ts";
import {
  type DownloadFormat,
  downloadFormats,
  formatBytes,
  isDownloadFormat,
} from "#/lib/downloads.ts";
import type { Song } from "#/lib/providers.ts";
import { audioPlayerTracks } from "#/lib/songs.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

const trackRowId = (slug: string) => `download-track-${slug}`;

function useTrackPreview() {
  const currentTrackId = useAudioStore((s) => s.currentTrack?.id);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const setQueueAndPlay = useAudioStore((s) => s.setQueueAndPlay);
  const togglePlay = useAudioStore((s) => s.togglePlay);

  // Only "playing" drives the UI: it isn't persisted, so SSR and the first client render agree.
  const playingSlug = isPlaying ? currentTrackId : null;

  function preview(song: Song) {
    if (currentTrackId === song.slug) {
      togglePlay();
      return;
    }

    const index = audioPlayerTracks.findIndex((track) => track.id === song.slug);

    if (index !== -1) {
      setQueueAndPlay(audioPlayerTracks, index);
    }
  }

  return { playingSlug, preview };
}

function TrackRow({
  song,
  checked,
  highlighted,
  isPlaying,
  disabled,
  onCheckedChange,
  onPreview,
  onDownload,
}: {
  song: Song;
  checked: boolean;
  highlighted: boolean;
  isPlaying: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
  onPreview: () => void;
  onDownload: () => void;
}) {
  const meta = [song.artists.join(" & "), song.album].filter(Boolean).join(" · ");

  return (
    <li
      id={trackRowId(song.slug)}
      className={cn(
        "flex items-center gap-2 border bg-background/40 pr-2 transition-colors hover:bg-card/70",
        checked && "border-primary/40 bg-primary/8",
        highlighted && "ring-1 ring-primary/70",
      )}
    >
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 p-2">
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={(value) => onCheckedChange(value)}
          className="ml-1"
        />
        {song.artworkUrl ? (
          <img
            src={song.artworkUrl}
            alt=""
            className="size-12 shrink-0 object-cover"
            loading="lazy"
          />
        ) : (
          <span className="size-12 shrink-0 bg-linear-to-br from-primary/30 via-card to-background" />
        )}
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{song.title}</span>
          <span className="truncate text-sm text-muted-foreground">{meta}</span>
        </span>
      </label>

      <Button
        variant="ghost"
        size="icon-sm"
        className="rounded-full"
        onClick={onPreview}
        aria-label={
          isPlaying
            ? m["download.picker.pause"]({ title: song.title })
            : m["download.picker.preview"]({ title: song.title })
        }
        aria-pressed={isPlaying}
      >
        {isPlaying ? <IconPlayerPauseFilled /> : <IconPlayerPlayFilled />}
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        className="rounded-full"
        onClick={onDownload}
        disabled={disabled}
        aria-label={m["download.picker.download_one"]({ title: song.title })}
      >
        <IconDownload />
      </Button>
    </li>
  );
}

function DownloadStatus({
  status,
  selectedCount,
  canStreamToDisk,
  onCancel,
}: {
  status: TrackDownloadStatus;
  selectedCount: number;
  canStreamToDisk: boolean;
  onCancel: () => void;
}) {
  const locale = getLocale();

  if (status.state === "zipping" || status.state === "sequential") {
    const percent =
      status.state === "zipping" && status.total
        ? (status.loaded / status.total) * 100
        : (status.filesDone / Math.max(status.fileCount, 1)) * 100;
    const label =
      status.state === "zipping"
        ? m["download.picker.zipping"]({ done: status.filesDone, count: status.fileCount })
        : m["download.picker.sequential"]({ done: status.filesDone, count: status.fileCount });

    return (
      <div className="flex flex-col gap-2" aria-live="polite">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2">
            <IconLoader2 className="size-4 animate-spin text-primary" />
            {label}
          </span>
          <Button variant="ghost" size="xs" onClick={onCancel}>
            {m["download.picker.cancel"]()}
          </Button>
        </div>
        <Progress value={Math.round(percent)} aria-label={label} />
        {status.state === "zipping" && status.total ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {m["download.picker.progress_size"]({
              loaded: formatBytes(status.loaded, locale),
              total: formatBytes(status.total, locale),
            })}
          </span>
        ) : null}
      </div>
    );
  }

  if (status.state === "done") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        <IconCircleCheck className="size-4 shrink-0 text-primary" />
        {status.mode === "zip"
          ? m["download.picker.done_zip"]()
          : m["download.picker.done_files"]()}
      </p>
    );
  }

  if (status.state === "error") {
    return (
      <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
        <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
        {m["download.picker.error"]()}
      </p>
    );
  }

  if (selectedCount > 1) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <IconFileZip className="mt-0.5 size-4 shrink-0" />
        {canStreamToDisk ? m["download.picker.hint_zip"]() : m["download.picker.hint_sequential"]()}
      </p>
    );
  }

  return null;
}

export function DownloadTrackPicker({
  songs,
  selected,
  highlighted,
  format,
  status,
  isBusy,
  canStreamToDisk,
  onFormatChange,
  onToggle,
  onToggleAll,
  onDownloadSelected,
  onDownloadOne,
  onCancel,
  className,
}: {
  songs: Song[];
  selected: ReadonlySet<string>;
  highlighted: ReadonlySet<string>;
  format: DownloadFormat;
  status: TrackDownloadStatus;
  isBusy: boolean;
  canStreamToDisk: boolean;
  onFormatChange: (format: DownloadFormat) => void;
  onToggle: (slug: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onDownloadSelected: () => void;
  onDownloadOne: (song: Song) => void;
  onCancel: () => void;
  className?: string;
}) {
  const { playingSlug, preview } = useTrackPreview();
  const listRef = useRef<HTMLUListElement>(null);
  const selectedCount = selected.size;
  const allSelected = songs.length > 0 && selectedCount === songs.length;
  const someSelected = selectedCount > 0 && !allSelected;
  const formatLabel = format.toUpperCase();

  // Bring preselected tracks (from `?track=`) into view inside the list.
  const [firstHighlighted] = highlighted;
  useEffect(() => {
    if (!firstHighlighted || !listRef.current) {
      return;
    }

    const row = document.getElementById(trackRowId(firstHighlighted));

    if (row) {
      // The list is `relative`, so the row's offsetTop is measured from the list itself.
      listRef.current.scrollTop = Math.max(0, row.offsetTop - 8);
    }
  }, [firstHighlighted]);

  const ctaLabel =
    selectedCount === 0
      ? m["download.picker.cta_none"]()
      : selectedCount === 1
        ? m["download.picker.cta_one"]()
        : m["download.picker.cta_many"]({ count: selectedCount });

  return (
    <Card className={cn("border bg-background/50 ring-0 backdrop-blur-xl", className)}>
      <CardHeader className="gap-4 has-data-[slot=card-description]:grid-rows-none">
        <div className="flex flex-col gap-2">
          <CardTitle className="text-2xl font-semibold">{m["download.picker.title"]()}</CardTitle>
          <CardDescription className="text-base leading-7">
            {m["download.picker.description"]()}
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              disabled={isBusy || songs.length === 0}
              onCheckedChange={(value) => onToggleAll(value)}
              className="ml-3"
            />
            <span className="font-medium">{m["download.picker.select_all"]()}</span>
            <span className="text-muted-foreground tabular-nums">
              {m["download.picker.selected_count"]({ count: selectedCount, total: songs.length })}
            </span>
          </label>

          <div className="flex items-center gap-2">
            <span className="text-xs tracking-widest text-muted-foreground uppercase">
              {m["download.picker.format_label"]()}
            </span>
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              value={[format]}
              disabled={isBusy}
              onValueChange={(value) => {
                const [next] = value;

                if (isDownloadFormat(next)) {
                  onFormatChange(next);
                }
              }}
              aria-label={m["download.picker.format_label"]()}
            >
              {downloadFormats.map((option) => (
                <ToggleGroupItem
                  key={option}
                  value={option}
                  className="min-w-14 aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/85"
                >
                  {option.toUpperCase()}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {songs.length === 0 ? (
          <p className="border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            {m["download.picker.empty"]()}
          </p>
        ) : (
          <ul
            ref={listRef}
            className="relative -mx-1 flex max-h-[min(36rem,60vh)] flex-col gap-2 overflow-y-auto overscroll-contain px-1 py-1"
          >
            {songs.map((song) => (
              <TrackRow
                key={song.slug}
                song={song}
                checked={selected.has(song.slug)}
                highlighted={highlighted.has(song.slug)}
                isPlaying={playingSlug === song.slug}
                disabled={isBusy}
                onCheckedChange={(checked) => onToggle(song.slug, checked)}
                onPreview={() => preview(song)}
                onDownload={() => onDownloadOne(song)}
              />
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-3 border-t pt-4">
          <Button
            size="lg"
            className="w-full"
            disabled={selectedCount === 0 || isBusy}
            onClick={onDownloadSelected}
          >
            {selectedCount > 1 && canStreamToDisk ? (
              <IconFileZip data-icon="inline-start" />
            ) : (
              <IconDownload data-icon="inline-start" />
            )}
            {ctaLabel}
            {selectedCount > 0 ? <span className="opacity-75">· {formatLabel}</span> : null}
          </Button>
          <DownloadStatus
            status={status}
            selectedCount={selectedCount}
            canStreamToDisk={canStreamToDisk}
            onCancel={onCancel}
          />
        </div>
      </CardContent>
    </Card>
  );
}
