import {
  IconBrandInstagram,
  IconBrandSoundcloud,
  IconBrandSpotify,
  IconBrandTiktok,
  IconBrandYoutube,
} from "@tabler/icons-react";
import { createFileRoute } from "@tanstack/react-router";
import DarkVeil from "#/components/react-bits/dark-veil.tsx";
import { HomeHero } from "#/containers/home/home-hero.tsx";
import { Badge } from "@/components/ui/badge";

// const releaseLinks = [
//   {
//     href: "https://open.spotify.com/",
//     label: () => m.home_release_link_spotify(),
//     Icon: IconBrandSpotify,
//   },
//   {
//     href: "https://soundcloud.com/",
//     label: () => m.home_release_link_soundcloud(),
//     Icon: IconBrandSoundcloud,
//   },
//   {
//     href: "https://music.youtube.com/",
//     label: () => m.home_release_link_youtube(),
//     Icon: IconBrandYoutube,
//   },
// ] as const;

// const releases = [
//   {
//     artwork: "LS-01",
//     eyebrow: () => m.home_release_1_eyebrow(),
//     title: () => m.home_release_1_title(),
//     description: () => m.home_release_1_description(),
//   },
//   {
//     artwork: "LS-02",
//     eyebrow: () => m.home_release_2_eyebrow(),
//     title: () => m.home_release_2_title(),
//     description: () => m.home_release_2_description(),
//   },
//   {
//     artwork: "LS-03",
//     eyebrow: () => m.home_release_3_eyebrow(),
//     title: () => m.home_release_3_title(),
//     description: () => m.home_release_3_description(),
//   },
// ] as const;

// const faqItems = [
//   {
//     id: "faq-1",
//     question: () => m.home_faq_1_question(),
//     answer: () => m.home_faq_1_answer(),
//   },
//   {
//     id: "faq-2",
//     question: () => m.home_faq_2_question(),
//     answer: () => m.home_faq_2_answer(),
//   },
//   {
//     id: "faq-3",
//     question: () => m.home_faq_3_question(),
//     answer: () => m.home_faq_3_answer(),
//   },
// ] as const;

const socialLinks = [
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
    href: "https://soundcloud.com/",
    label: "SoundCloud",
    Icon: IconBrandSoundcloud,
  },
] as const;

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main id="top" className="relative overflow-hidden pt-20">
      <div className="fixed inset-0 -z-10 opacity-70">
        <DarkVeil
          hueShift={0}
          noiseIntensity={0.07}
          scanlineIntensity={0.15}
          speed={1.5}
          scanlineFrequency={1}
          warpAmount={5}
          verticalOffset={0.1}
        />
      </div>

      <HomeHero />

      {/* <div className="kcontainer flex min-h-screen flex-col gap-14 pb-16 pt-4 ">
        <section
          id="about"
          className="grid scroll-mt-28 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]"
        >
          <Card className="border border-border/60 bg-card/72">
            <CardHeader>
              <CardTitle>{m.home_about_title()}</CardTitle>
              <CardDescription>{m.home_about_description()}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5 text-sm leading-8 text-muted-foreground sm:text-base">
              <p>{m.home_about_body_1()}</p>
              <p>{m.home_about_body_2()}</p>
            </CardContent>
          </Card>

          <Card className="border border-border/60 bg-card/64">
            <CardHeader>
              <CardTitle>{m.home_focus_title()}</CardTitle>
              <CardDescription>{m.home_focus_description()}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <FeaturePill>{m.home_focus_item_1()}</FeaturePill>
              <FeaturePill>{m.home_focus_item_2()}</FeaturePill>
              <FeaturePill>{m.home_focus_item_3()}</FeaturePill>
              <FeaturePill>{m.home_focus_item_4()}</FeaturePill>
            </CardContent>
          </Card>
        </section>

        <section id="music" className="flex scroll-mt-28 flex-col gap-6">
          <SectionIntro
            badge={m.home_music_badge()}
            title={m.home_music_title()}
            description={m.home_music_description()}
          />
          <div className="grid gap-6 lg:grid-cols-3">
            {releases.map((release) => (
              <Card key={release.artwork} className="border border-border/60 bg-card/72">
                <CardHeader className="gap-4">
                  <div className="aspect-square rounded-2xl border border-border/60 bg-[radial-gradient(circle_at_top,rgba(123,92,255,0.22),transparent_55%),linear-gradient(135deg,rgba(255,255,255,0.1),rgba(255,255,255,0.02))] p-4">
                    <div className="flex size-full items-end rounded-[1.3rem] border border-white/10 bg-black/25 p-4">
                      <span className="text-xs font-medium uppercase tracking-[0.35em] text-white/70">
                        {release.artwork}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Badge variant="outline" className="w-fit">
                      {release.eyebrow()}
                    </Badge>
                    <CardTitle className="text-xl">{release.title()}</CardTitle>
                    <CardDescription>{release.description()}</CardDescription>
                  </div>
                </CardHeader>
                <CardFooter className="flex flex-wrap gap-2 border-t border-border/60 pt-6">
                  {releaseLinks.map(({ href, label, Icon }) => (
                    <a
                      key={`${release.artwork}-${href}`}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                      })}
                    >
                      <Icon data-icon="inline-start" />
                      {label()}
                    </a>
                  ))}
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>

        <section
          id="course"
          className="grid scroll-mt-28 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.82fr)]"
        >
          <Card className="border border-border/60 bg-card/72">
            <CardHeader>
              <CardTitle>{m.home_course_title()}</CardTitle>
              <CardDescription>{m.home_course_description()}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <p className="max-w-3xl text-sm leading-8 text-muted-foreground sm:text-base">
                {m.home_course_body()}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <FeaturePill>{m.home_course_item_1()}</FeaturePill>
                <FeaturePill>{m.home_course_item_2()}</FeaturePill>
                <FeaturePill>{m.home_course_item_3()}</FeaturePill>
                <FeaturePill>{m.home_course_item_4()}</FeaturePill>
              </div>
            </CardContent>
            <CardFooter className="border-t border-border/60 pt-6">
              <a href="#contact" className={buttonVariants({ size: "lg" })}>
                <IconArrowUpRight data-icon="inline-end" />
                {m.home_course_cta()}
              </a>
            </CardFooter>
          </Card>

          <Card className="border border-border/60 bg-card/64">
            <CardHeader>
              <CardTitle>{m.home_course_note_title()}</CardTitle>
              <CardDescription>{m.home_course_note_description()}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm leading-8 text-muted-foreground">
              <p>{m.home_course_note_body_1()}</p>
              <p>{m.home_course_note_body_2()}</p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)]">
          <Card className="border border-border/60 bg-card/72">
            <CardHeader>
              <CardTitle>{m.home_faq_title()}</CardTitle>
              <CardDescription>{m.home_faq_description()}</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion defaultValue={[faqItems[0].id]}>
                {faqItems.map((item) => (
                  <AccordionItem key={item.id} value={item.id}>
                    <AccordionTrigger>{item.question()}</AccordionTrigger>
                    <AccordionContent>{item.answer()}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>

          <Card id="contact" className="scroll-mt-28 border border-border/60 bg-card/64">
            <CardHeader>
              <CardTitle>{m.home_contact_title()}</CardTitle>
              <CardDescription>{m.home_contact_description()}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <a
                href="mailto:contact@lilsbd.com"
                className={cn(buttonVariants({ size: "lg" }), "justify-center")}
              >
                <IconMail data-icon="inline-start" />
                {m.home_contact_email_cta()}
              </a>
              <Separator />
              <div className="flex flex-wrap gap-2">
                {socialLinks.map(({ href, label, Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    <Icon data-icon="inline-start" />
                    {label}
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </div> */}
    </main>
  );
}

function SectionIntro({
  badge,
  title,
  description,
}: {
  badge: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Badge variant="outline" className="w-fit">
        {badge}
      </Badge>
      <div className="flex flex-col gap-3">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
        <p className="text-sm leading-8 text-muted-foreground sm:text-base">{description}</p>
      </div>
    </div>
  );
}

function FeaturePill({ children }: { children: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/65 px-4 py-3 text-sm leading-7 text-muted-foreground">
      {children}
    </div>
  );
}
