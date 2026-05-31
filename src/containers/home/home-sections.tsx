import {
  IconArrowRight,
  IconBooks,
  IconBrandInstagram,
  IconBrandSoundcloud,
  IconBrandSpotify,
  IconBrandTiktok,
  IconBrandYoutube,
  IconExternalLink,
  IconMusic,
  IconPlayerPlay,
  IconSparkles,
} from "@tabler/icons-react";
import type { ComponentType, SVGProps } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "#/components/ui/accordion.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { buttonVariants } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { listenProviderOrder, providerConfig, type Song } from "#/lib/providers.ts";
import { latestSong, sortedSongs } from "#/lib/songs.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
};

type SocialLink = {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const socialLinks: SocialLink[] = [
  {
    href: "https://instagram.com/",
    label: "Instagram",
    Icon: IconBrandInstagram,
  },
  {
    href: "https://tiktok.com/",
    label: "TikTok",
    Icon: IconBrandTiktok,
  },
  {
    href: "https://open.spotify.com/",
    label: "Spotify",
    Icon: IconBrandSpotify,
  },
  {
    href: "https://youtube.com/",
    label: "YouTube",
    Icon: IconBrandYoutube,
  },
  {
    href: "https://soundcloud.com/lil_sbd",
    label: "SoundCloud",
    Icon: IconBrandSoundcloud,
  },
];

const featureCards = [
  {
    title: () => m["homee_feature_1_title"](),
    description: () => m["homee_feature_1_description"](),
    Icon: IconSparkles,
  },
  {
    title: () => m["homee_feature_2_title"](),
    description: () => m["homee_feature_2_description"](),
    Icon: IconMusic,
  },
  {
    title: () => m["homee_feature_3_title"](),
    description: () => m["homee_feature_3_description"](),
    Icon: IconBooks,
  },
] as const;

const focusItems = [
  () => m["homee_focus_item_1"](),
  () => m["homee_focus_item_2"](),
  () => m["homee_focus_item_3"](),
  () => m["homee_focus_item_4"](),
] as const;

const courseItems = [
  () => m["homee_course_item_1"](),
  () => m["homee_course_item_2"](),
  () => m["homee_course_item_3"](),
  () => m["homee_course_item_4"](),
] as const;

const faqItems = [
  {
    value: "sound",
    question: () => m["homee_faq_1_question"](),
    answer: () => m["homee_faq_1_answer"](),
  },
  {
    value: "course",
    question: () => m["homee_faq_2_question"](),
    answer: () => m["homee_faq_2_answer"](),
  },
  {
    value: "contact",
    question: () => m["homee_faq_3_question"](),
    answer: () => m["homee_faq_3_answer"](),
  },
] as const;

function SectionHeading({ eyebrow, title, description, align = "left" }: SectionHeadingProps) {
  return (
    <div className={cn("flex flex-col gap-3", align === "center" && "items-center text-center")}>
      {eyebrow ? (
        <Badge
          variant="outline"
          className="border-primary/35 bg-background/40 px-3 py-1 text-[0.7rem] tracking-[0.28em] uppercase"
        >
          {eyebrow}
        </Badge>
      ) : null}
      <div className="space-y-3">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
        {description ? (
          <p className="max-w-3xl text-base leading-7 text-muted-foreground md:text-lg">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function getPreferredSongLink(song: Song | null | undefined) {
  if (!song) {
    return null;
  }

  for (const provider of listenProviderOrder) {
    const href = song.links[provider];

    if (href) {
      return { href, ...providerConfig[provider] };
    }
  }

  return null;
}

export function HomeSections() {
  const musicHighlights = [
    {
      eyebrow: m["homee_release_1_eyebrow"](),
      title: m["homee_release_1_title"](),
      description: m["homee_release_1_description"](),
      song: latestSong,
    },
    {
      eyebrow: m["homee_release_2_eyebrow"](),
      title: m["homee_release_2_title"](),
      description: m["homee_release_2_description"](),
      song:
        sortedSongs.find((song) => song.slug === "we-are-damned") ??
        sortedSongs.find((song) => song.slug === "top-of-the-world") ??
        sortedSongs[1] ??
        null,
    },
    {
      eyebrow: m["homee_release_3_eyebrow"](),
      title: m["homee_release_3_title"](),
      description: m["homee_release_3_description"](),
      song:
        sortedSongs.find((song) => song.slug === "more-than-friends") ??
        sortedSongs.find((song) => song.slug === "kino") ??
        sortedSongs[2] ??
        null,
    },
  ] as const;

  return (
    <>
      <section className="kcontainer section">
        <div className="grid gap-4 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.1fr)]">
          {featureCards.map(({ title, description, Icon }) => (
            <Card key={title()} className="border border-border/60 bg-card/40 backdrop-blur-sm">
              <CardHeader>
                <div className="flex size-11 items-center justify-center rounded-full border border-primary/35 bg-primary/12 text-primary">
                  <Icon className="size-5" />
                </div>
                <CardTitle className="text-xl">{title()}</CardTitle>
                <CardDescription className="leading-7">{description()}</CardDescription>
              </CardHeader>
            </Card>
          ))}

          <Card className="border border-primary/20 bg-linear-to-br from-primary/12 via-card/60 to-card/60 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-xl">{m["homee_focus_title"]()}</CardTitle>
              <CardDescription className="leading-7">
                {m["homee_focus_description"]()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
                {focusItems.map((item) => (
                  <li key={item()} className="flex gap-3">
                    <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
                    <span>{item()}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="music" className="kcontainer section pt-0">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeading
              eyebrow={m["homee_music_badge"]()}
              title={m["homee_music_title"]()}
              description={m["homee_music_description"]()}
            />

            {getPreferredSongLink(latestSong) ? (
              <a
                href={getPreferredSongLink(latestSong)?.href}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ size: "lg" }), "w-full lg:w-auto")}
              >
                <IconPlayerPlay />
                {m["homee_primary_cta"]()}
              </a>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {musicHighlights.map((highlight) => {
              const primaryLink = getPreferredSongLink(highlight.song);

              return (
                <Card
                  key={highlight.title}
                  className="overflow-hidden border border-border/60 bg-card/40 backdrop-blur-sm"
                >
                  <div className="relative aspect-4/3 overflow-hidden">
                    {highlight.song?.artworkUrl ? (
                      <img
                        src={highlight.song.artworkUrl}
                        alt={highlight.song.title}
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="size-full bg-linear-to-br from-primary/30 via-card to-background" />
                    )}
                    <div className="absolute inset-0 bg-linear-to-t from-background via-background/30 to-transparent" />
                    <div className="absolute left-5 top-5">
                      <Badge variant="secondary" className="bg-background/75 backdrop-blur-sm">
                        {highlight.eyebrow}
                      </Badge>
                    </div>
                  </div>

                  <CardHeader className="gap-3">
                    <CardTitle className="text-xl">{highlight.title}</CardTitle>
                    <CardDescription className="leading-7">{highlight.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto flex items-end justify-between gap-4">
                    <div>
                      <p className="font-medium">
                        {highlight.song?.title ?? m["common.latest_release"]()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {highlight.song?.album ?? highlight.song?.artists.join(" & ")}
                      </p>
                    </div>
                    {primaryLink ? (
                      <a
                        href={primaryLink.href}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "shrink-0 rounded-full border-border/70 bg-background/65 backdrop-blur-sm",
                        )}
                      >
                        <IconExternalLink className="size-4" />
                        {primaryLink.label()}
                      </a>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section id="course" className="kcontainer section pt-0">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-10">
          <div className="space-y-5 rounded-[2rem] border border-border/60 bg-card/45 p-6 backdrop-blur-sm md:p-8">
            <SectionHeading
              eyebrow={m["homee_secondary_cta"]()}
              title={m["homee_course_title"]()}
              description={m["homee_course_description"]()}
            />

            <p className="text-base leading-8 text-muted-foreground">{m["homee_course_body"]()}</p>

            <a href="#contact" className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}>
              <IconArrowRight />
              {m["homee_course_cta"]()}
            </a>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {courseItems.map((item) => (
                <Card
                  key={item()}
                  size="sm"
                  className="border border-border/60 bg-background/40 backdrop-blur-sm"
                >
                  <CardContent className="flex gap-3 pt-4">
                    <span className="mt-1 size-2.5 shrink-0 rounded-full bg-primary" />
                    <p className="leading-7 text-muted-foreground">{item()}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border border-primary/20 bg-linear-to-br from-primary/10 via-card/60 to-card/60 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>{m["homee_course_note_title"]()}</CardTitle>
                <CardDescription>{m["homee_course_note_description"]()}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
                <p>{m["homee_course_note_body_1"]()}</p>
                <p>{m["homee_course_note_body_2"]()}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="kcontainer section pt-0">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10">
          <SectionHeading
            title={m["homee_faq_title"]()}
            description={m["homee_faq_description"]()}
          />

          <Accordion className="border-border/60 bg-card/45 backdrop-blur-sm">
            {faqItems.map((item) => (
              <AccordionItem key={item.value} value={item.value}>
                <AccordionTrigger className="px-5 py-4 text-base">
                  {item.question()}
                </AccordionTrigger>
                <AccordionContent className="px-5 pb-5 text-sm leading-7 text-muted-foreground">
                  <p>{item.answer()}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section id="contact" className="kcontainer section pt-0">
        <div className="rounded-[2rem] border border-border/60 bg-card/45 p-6 backdrop-blur-sm md:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeading
              title={m["homee_contact_title"]()}
              description={m["homee_contact_description"]()}
            />

            <a
              href="#top"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full lg:w-auto")}
            >
              <IconMusic />
              {m["homee_primary_cta"]()}
            </a>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {socialLinks.map(({ href, label, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 rounded-[1.5rem] border border-border/60 bg-background/55 px-4 py-4 transition-colors hover:bg-background/75"
              >
                <span className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <span className="font-medium">{label}</span>
                </span>
                <IconExternalLink className="size-4 text-muted-foreground" />
              </a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
