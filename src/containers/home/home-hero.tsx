/** biome-ignore-all lint/a11y/useAnchorContent: <explanation> */
import { IconArrowRight, IconBooks, IconMail, IconMusic } from "@tabler/icons-react";
import { Link, type LinkOptions } from "@tanstack/react-router";
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

function TopicTile({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: LinkOptions["to"];
  icon: typeof IconMusic;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="group flex h-full flex-col gap-3 border bg-background/50 backdrop-blur-md p-4 transition-colors hover:bg-card/80"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex rounded-full size-10 shrink-0 items-center justify-center border border-primary/35 bg-primary/12 text-primary">
          <Icon className="size-5" />
        </div>
        <IconArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>

      <div className="space-y-1.5">
        <p className="text-base font-medium">{title}</p>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </Link>
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
      <div className="grid lg:grid-cols-[2fr_1fr] w-full justify-between gap-8 md:gap-12 lg:gap-20">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className="uppercase tracking-widest text-xs bg-background/50 px-2 py-1 border font-medium">
              {m["home.hero.genre_producer"]()}
            </div>
          </div>
          <h1 className="text-7xl font-bold italic [font-variant:small-caps]">
            {m["home.hero.title"]()}
          </h1>
          <p className="text-lg max-w-3xl">{m["home.hero.description"]()}</p>
          <div className="flex gap-4 items-center">
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
          <div className="grid grid-cols-3 gap-4 mt-4">
            <TopicTile
              title={m["home.hero.topic_music.title"]()}
              description={m["home.hero.topic_music.description"]()}
              to="/"
              icon={IconMusic}
            />
            <TopicTile
              title={m["home.hero.topic_course.title"]()}
              description={m["home.hero.topic_course.description"]()}
              to="/"
              icon={IconBooks}
            />
            <TopicTile
              title={m["home.hero.topic_contact.title"]()}
              description={m["home.hero.topic_contact.description"]()}
              to="/"
              icon={IconMail}
            />
          </div>
        </div>
        <Card className="bg-background/50 backdrop-blur-xl ring-0 border">
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
