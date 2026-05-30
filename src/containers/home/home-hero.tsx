/** biome-ignore-all lint/a11y/useAnchorContent: <explanation> */
import type { IconMusic } from "@tabler/icons-react";
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
          <p className="text-base lg:text-lg max-w-prose">{m["home.hero.description"]()}</p>
        </div>
        <Card className="flex-1 bg-background/50 backdrop-blur-xl">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="md:text-lg lg:text-xl">
                {m["common.latest_releases"]()}
              </CardTitle>
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

              <div className="flex flex-col mt-2   -space-y-1">
                <p className="text-lg font-medium">{currentSong.title}</p>
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
      {/* <div className="flex flex-col gap-8">
        <div className="flex flex-wrap gap-3">
          <Badge variant="secondary">
            <IconBolt data-icon="inline-start" />
            {m.home_badge_genre()}
          </Badge>
          <Badge variant="outline">{m.home_badge_location()}</Badge>
          <Badge variant="outline">{m.home_badge_mission()}</Badge>
        </div>

        <div className="flex max-w-4xl flex-col gap-5">
          <p className="text-sm font-medium uppercase tracking-[0.32em] text-muted-foreground">
            {m.home_eyebrow()}
          </p>
          <h1 className="text-5xl font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl">
            {m.home_hero_title()}
          </h1>
          <p className="max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
            {m.home_hero_description()}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button render={<Link to="/" />}>
            <IconPlayerPlay data-icon="inline-start" />
            {m.home_primary_cta()}
          </Button>
          <Button render={<Link to="/" />}>
            <IconSchool data-icon="inline-start" />
            {m.home_secondary_cta()}
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <TopicTile
            title={m.home_feature_1_title()}
            description={m.home_feature_1_description()}
          />
          <TopicTile
            title={m.home_feature_2_title()}
            description={m.home_feature_2_description()}
          />
          <TopicTile
            title={m.home_feature_3_title()}
            description={m.home_feature_3_description()}
          />
        </div>
      </div> */}

      {/* <Card className="border border-border/60 bg-card/70">
        <CardHeader>
          <CardTitle>{m.home_panel_title()}</CardTitle>
          <CardDescription>{m.home_panel_description()}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <InfoRow
            icon={IconMusic}
            title={m.home_panel_row_1_title()}
            description={m.home_panel_row_1_description()}
          />
          <InfoRow
            icon={IconMicrophone2}
            title={m.home_panel_row_2_title()}
            description={m.home_panel_row_2_description()}
          />
          <InfoRow
            icon={IconSchool}
            title={m.home_panel_row_3_title()}
            description={m.home_panel_row_3_description()}
          />
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2 border-t border-border/60 pt-6">
          {songs.map(({ links, title, slug }) => (
            <Button key={slug} render={<Link to="/" />} variant="outline" size="sm">
              {title}
            </Button>
          ))}
        </CardFooter>
      </Card> */}
    </section>
  );
};
