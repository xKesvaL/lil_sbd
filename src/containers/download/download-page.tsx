import { useState } from "react";
import { useTrackDownload } from "#/hooks/use-track-download.ts";
import { type DownloadFormat, parseTrackParam } from "#/lib/downloads.ts";
import type { Song } from "#/lib/providers.ts";
import { downloadableSongs } from "#/lib/songs.ts";
import { DownloadIntro } from "./download-intro.tsx";
import { DownloadSupport } from "./download-support.tsx";
import { DownloadThanksDialog } from "./download-thanks-dialog.tsx";
import { DownloadTrackPicker } from "./download-track-picker.tsx";

export function DownloadPage({ initialTrackParam }: { initialTrackParam?: string }) {
  const songs = downloadableSongs;
  const [preselected] = useState(
    () => new Set<string>(parseTrackParam(initialTrackParam, downloadableSongs)),
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set(preselected));
  const [format, setFormat] = useState<DownloadFormat>("wav");
  const [thanks, setThanks] = useState<{ open: boolean; songs: Song[] }>({
    open: false,
    songs: [],
  });

  const download = useTrackDownload({
    onStarted: ({ songs: startedSongs }) => setThanks({ open: true, songs: startedSongs }),
  });

  const selectedSongs = songs.filter((song) => selected.has(song.slug));

  function updateSelection(next: Set<string>) {
    setSelected(next);
    download.reset();
  }

  function handleToggle(slug: string, checked: boolean) {
    const next = new Set(selected);

    if (checked) {
      next.add(slug);
    } else {
      next.delete(slug);
    }

    updateSelection(next);
  }

  function handleToggleAll(checked: boolean) {
    updateSelection(checked ? new Set(songs.map((song) => song.slug)) : new Set());
  }

  function handleFormatChange(next: DownloadFormat) {
    setFormat(next);
    download.reset();
  }

  return (
    <section className="kcontainer section flex flex-col gap-8 md:gap-12">
      <DownloadIntro />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-10">
        <DownloadTrackPicker
          songs={songs}
          selected={selected}
          highlighted={preselected}
          format={format}
          status={download.status}
          isBusy={download.isBusy}
          canStreamToDisk={download.canStreamToDisk}
          onFormatChange={handleFormatChange}
          onToggle={handleToggle}
          onToggleAll={handleToggleAll}
          onDownloadSelected={() => download.start(selectedSongs, format)}
          onDownloadOne={(song) => download.start([song], format)}
          onCancel={download.cancel}
        />

        <DownloadSupport selectedSongs={selectedSongs} />
      </div>

      <DownloadThanksDialog
        open={thanks.open}
        onOpenChange={(open) => setThanks((current) => ({ ...current, open }))}
        songs={thanks.songs}
      />
    </section>
  );
}
