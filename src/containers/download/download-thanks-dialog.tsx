import { IconHeartHandshake } from "@tabler/icons-react";
import { Button } from "#/components/ui/button.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import type { Song } from "#/lib/providers.ts";
import { m } from "#/paraglide/messages";
import { DownloadSupport } from "./download-support.tsx";

/** Shown once a download has started. Purely informative and always dismissable. */
export function DownloadThanksDialog({
  open,
  onOpenChange,
  songs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  songs: Song[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto rounded-none border bg-background/90 ring-0 backdrop-blur-xl sm:max-w-lg">
        <DialogHeader className="gap-3 pr-8">
          <div className="flex size-11 items-center justify-center rounded-full border border-primary/35 bg-primary/12 text-primary">
            <IconHeartHandshake className="size-5" />
          </div>
          <DialogTitle className="text-xl font-semibold">
            {m["download.thanks.title"]()}
          </DialogTitle>
          <DialogDescription className="text-sm leading-6">
            {m["download.thanks.description"]()}
          </DialogDescription>
        </DialogHeader>

        <DownloadSupport selectedSongs={songs} variant="compact" />

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {m["download.thanks.close"]()}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
