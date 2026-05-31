/** biome-ignore-all lint/a11y/useAnchorContent: <explanation> */
import { IconBooks, IconMusic } from "@tabler/icons-react";
import { BorderRotate } from "#/components/animated-gradient-border.tsx";
import {
  AudioPlayer,
  AudioPlayerControlBar,
  AudioPlayerControlGroup,
  AudioPlayerPlay,
  AudioPlayerSeekBar,
  AudioPlayerSkipBack,
  AudioPlayerSkipForward,
  AudioPlayerTimeDisplay,
  AudioPlayerVolume,
} from "#/components/audio/player.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.tsx";
import { useAudioStore } from "#/lib/audio-store.ts";
import { listenProviderOrder, providerConfig } from "#/lib/providers.ts";
import { sortedSongs } from "#/lib/songs.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages";

function TopicTile({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-3xl border border-border/50 bg-card/62 p-5">
      <div className="flex flex-col gap-2">
        <p className="text-base font-medium">{title}</p>
        <p className="text-sm leading-7 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof IconMusic;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4 rounded-2xl border border-border/50 bg-background/65 p-4">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border/50 bg-background">
        <Icon />
      </div>
      <div className="flex flex-co l gap-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export const HomeHero = () => {
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const currentSong = sortedSongs.find((song) => song.slug === currentTrack?.id) || sortedSongs[0];

  const providerLinks = currentSong
    ? listenProviderOrder.slice(0, 4).flatMap((provider) => {
        const href = currentSong.links[provider];

        if (!href) {
          return [];
        }

        return [{ href, provider, ...providerConfig[provider] }];
      })
    : [];

  return (
    <section className="kcontainer section flex flex-col gap-4 items-center justify-center">
      <div className="flex flex-col lg:flex-row w-full justify-between gap-8 md:gap-12 lg:gap-20">
        <div className="flex flex-col gap-4">
          <h1 className="text-7xl font-bold italic [font-variant:small-caps]">
            {m["home.hero.title"]()}
          </h1>
          <p className="text-lg max-w-3xl">{m["home.hero.description"]()}</p>
          <div className="flex gap-4 items-center mt-4">
            <Button size="lg" className="pl-3">
              <IconBooks />
              {m["home.hero.cta_course"]()}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="pl-3 border-primary bg-background/50 backdrop-blur-md"
            >
              <IconMusic />
              {m["home.hero.cta_music"]()}
            </Button>
          </div>
        </div>
        <Card className="flex-1 bg-background/50 backdrop-blur-xl">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-xl">{m["common.latest_releases"]()}</CardTitle>
              <div className="flex items-center gap-1">
                {providerLinks.map(({ href, provider, Icon, className }) => {
                  return (
                    <Button
                      key={provider}
                      render={<a href={href} target="_blank" />}
                      variant="outline"
                      size="icon-sm"
                      className={cn(className, "bg rounded-full")}
                      nativeButton={false}
                    >
                      <div className="sr-only">{currentSong.title}</div>
                      <Icon />
                    </Button>
                  );
                })}
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <BorderRotate
                borderRadius={0}
                style={{ animationPlayState: isPlaying ? "running" : "paused" }}
              >
                <img
                  src={currentSong.artworkUrl}
                  alt={currentSong.title}
                  className="w-full h-auto aspect-square object-cover"
                />
              </BorderRotate>

              <div className="flex flex-col mt-2 -space-y-0.5">
                <p className="text-lg md:text-xl font-bold">{currentSong.title}</p>
                <p className="text-sm text-muted-foreground">{currentSong.artists.join(" & ")}</p>
              </div>
            </div>
            <AudioPlayer className="bg-transparent ring-0 p-0">
              <AudioPlayerControlBar variant="stacked" className="px-0">
                <AudioPlayerControlGroup>
                  <AudioPlayerTimeDisplay />
                  <AudioPlayerSeekBar />
                  <AudioPlayerTimeDisplay remaining />
                </AudioPlayerControlGroup>
                <AudioPlayerControlGroup>
                  <AudioPlayerControlGroup className="justify-between md:justify-start">
                    <AudioPlayerSkipBack />
                    <AudioPlayerPlay />
                    <AudioPlayerSkipForward />
                  </AudioPlayerControlGroup>
                  <AudioPlayerVolume />
                </AudioPlayerControlGroup>
              </AudioPlayerControlBar>
            </AudioPlayer>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};
