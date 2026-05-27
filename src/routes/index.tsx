import { createFileRoute } from '@tanstack/react-router'
import {
  IconArrowUpRight,
  IconBolt,
  IconBrandInstagram,
  IconBrandSoundcloud,
  IconBrandSpotify,
  IconBrandTiktok,
  IconBrandYoutube,
  IconMail,
  IconMenu2,
  IconMicrophone2,
  IconMusic,
  IconPlayerPlay,
  IconSchool,
} from '@tabler/icons-react'

import { m } from '#/paraglide/messages'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '#about', label: () => m.home_nav_about() },
  { href: '#music', label: () => m.home_nav_music() },
  { href: '#course', label: () => m.home_nav_course() },
  { href: '#contact', label: () => m.home_nav_contact() },
] as const

const releaseLinks = [
  {
    href: 'https://open.spotify.com/',
    label: () => m.home_release_link_spotify(),
    Icon: IconBrandSpotify,
  },
  {
    href: 'https://soundcloud.com/',
    label: () => m.home_release_link_soundcloud(),
    Icon: IconBrandSoundcloud,
  },
  {
    href: 'https://music.youtube.com/',
    label: () => m.home_release_link_youtube(),
    Icon: IconBrandYoutube,
  },
] as const

const releases = [
  {
    artwork: 'LS-01',
    eyebrow: () => m.home_release_1_eyebrow(),
    title: () => m.home_release_1_title(),
    description: () => m.home_release_1_description(),
  },
  {
    artwork: 'LS-02',
    eyebrow: () => m.home_release_2_eyebrow(),
    title: () => m.home_release_2_title(),
    description: () => m.home_release_2_description(),
  },
  {
    artwork: 'LS-03',
    eyebrow: () => m.home_release_3_eyebrow(),
    title: () => m.home_release_3_title(),
    description: () => m.home_release_3_description(),
  },
] as const

const faqItems = [
  {
    id: 'faq-1',
    question: () => m.home_faq_1_question(),
    answer: () => m.home_faq_1_answer(),
  },
  {
    id: 'faq-2',
    question: () => m.home_faq_2_question(),
    answer: () => m.home_faq_2_answer(),
  },
  {
    id: 'faq-3',
    question: () => m.home_faq_3_question(),
    answer: () => m.home_faq_3_answer(),
  },
] as const

const socialLinks = [
  {
    href: 'https://instagram.com/',
    label: 'Instagram',
    Icon: IconBrandInstagram,
  },
  {
    href: 'https://tiktok.com/',
    label: 'TikTok',
    Icon: IconBrandTiktok,
  },
  {
    href: 'https://open.spotify.com/',
    label: 'Spotify',
    Icon: IconBrandSpotify,
  },
  {
    href: 'https://youtube.com/',
    label: 'YouTube',
    Icon: IconBrandYoutube,
  },
  {
    href: 'https://soundcloud.com/',
    label: 'SoundCloud',
    Icon: IconBrandSoundcloud,
  },
] as const

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main id="top" className="relative overflow-hidden">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-14 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <SiteHeader />

        <section className="grid scroll-mt-28 gap-8 pt-4 lg:grid-cols-[minmax(0,1.12fr)_22rem] lg:items-end lg:pt-8">
          <div className="flex flex-col gap-8">
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
              <a
                href="#music"
                className={cn(buttonVariants({ size: 'lg' }), 'justify-center sm:w-auto')}
              >
                <IconPlayerPlay data-icon="inline-start" />
                {m.home_primary_cta()}
              </a>
              <a
                href="#course"
                className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'justify-center sm:w-auto')}
              >
                <IconSchool data-icon="inline-start" />
                {m.home_secondary_cta()}
              </a>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <TopicTile title={m.home_feature_1_title()} description={m.home_feature_1_description()} />
              <TopicTile title={m.home_feature_2_title()} description={m.home_feature_2_description()} />
              <TopicTile title={m.home_feature_3_title()} description={m.home_feature_3_description()} />
            </div>
          </div>

          <Card className="border border-border/60 bg-card/70">
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
              {releaseLinks.map(({ href, label, Icon }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  <Icon data-icon="inline-start" />
                  {label()}
                </a>
              ))}
            </CardFooter>
          </Card>
        </section>

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
                      className={buttonVariants({ variant: 'outline', size: 'sm' })}
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
              <a href="#contact" className={buttonVariants({ size: 'lg' })}>
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
                className={cn(buttonVariants({ size: 'lg' }), 'justify-center')}
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
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    <Icon data-icon="inline-start" />
                    {label}
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}

function SiteHeader() {
  return (
    <header className="sticky top-4 z-40">
      <div className="flex items-center gap-3 rounded-full border border-border/60 bg-background/78 px-4 py-3 shadow-lg shadow-black/10 backdrop-blur-md sm:px-5">
        <a href="#top" className="min-w-0">
          <span className="block text-[0.65rem] font-medium uppercase tracking-[0.32em] text-muted-foreground">
            {m.home_header_kicker()}
          </span>
          <span className="block truncate text-sm font-medium sm:text-base">{m.home_eyebrow()}</span>
        </a>

        <Separator orientation="vertical" className="hidden h-8 md:block" />

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                'rounded-full text-muted-foreground hover:text-foreground'
              )}
            >
              {item.label()}
            </a>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-3 md:flex">
          <LocaleSwitcher compact />
          <a href="#music" className={buttonVariants({ size: 'sm' })}>
            <IconPlayerPlay data-icon="inline-start" />
            {m.home_header_cta()}
          </a>
        </div>

        <div className="ml-auto md:hidden">
          <Sheet>
            <SheetTrigger
              render={<button type="button" className={buttonVariants({ variant: 'outline', size: 'icon-sm' })} />}
              aria-label={m.home_menu_open_label()}
            >
              <IconMenu2 />
            </SheetTrigger>
            <SheetContent side="right" className="border-border/60 bg-popover/96">
              <SheetHeader className="border-b border-border/60">
                <SheetTitle>{m.home_eyebrow()}</SheetTitle>
                <SheetDescription>{m.home_header_tagline()}</SheetDescription>
              </SheetHeader>

              <div className="flex flex-col gap-2 p-6">
                <LocaleSwitcher className="mb-2" />
                {navItems.map((item) => (
                  <SheetClose
                    key={item.href}
                    onClick={() => scrollToHash(item.href)}
                    render={<button type="button" className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'justify-start')} />}
                  >
                    {item.label()}
                  </SheetClose>
                ))}
              </div>

              <SheetFooter className="border-t border-border/60">
                <SheetClose
                  onClick={() => scrollToHash('#music')}
                  render={<button type="button" className={cn(buttonVariants({ size: 'lg' }), 'justify-center')} />}
                >
                  <IconPlayerPlay data-icon="inline-start" />
                  {m.home_header_cta()}
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}

function scrollToHash(hash: string) {
  if (typeof document === 'undefined') {
    return
  }

  const target = document.querySelector(hash)

  if (target instanceof HTMLElement) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.history.replaceState(null, '', hash)
  }
}

function SectionIntro({
  badge,
  title,
  description,
}: {
  badge: string
  title: string
  description: string
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
  )
}

function TopicTile({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-3xl border border-border/50 bg-card/62 p-5">
      <div className="flex flex-col gap-2">
        <p className="text-base font-medium">{title}</p>
        <p className="text-sm leading-7 text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

function InfoRow({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof IconMusic
  title: string
  description: string
}) {
  return (
    <div className="flex gap-4 rounded-2xl border border-border/50 bg-background/65 p-4">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border/50 bg-background">
        <Icon />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

function FeaturePill({ children }: { children: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/65 px-4 py-3 text-sm leading-7 text-muted-foreground">
      {children}
    </div>
  )
}
