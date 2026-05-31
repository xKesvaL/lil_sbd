import {
  IconArrowLeft,
  IconArrowRight,
  IconClock,
  IconDownload,
  IconExternalLink,
  IconPlayerPlay,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { MdxContent } from "#/components/mdx-content.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button, buttonVariants } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  accessibleCourseChapters,
  type CourseChapterNode,
  type CourseLessonNode,
  courseLandingChapter,
} from "#/lib/course.ts";
import { m } from "#/paraglide/messages";

function StatusBadge({ status }: { status: "published" | "coming-soon" | "draft" }) {
  if (status === "published") {
    return <Badge>{m["course.status.published"]()}</Badge>;
  }

  if (status === "coming-soon") {
    return <Badge variant="outline">{m["course.status.coming_soon"]()}</Badge>;
  }

  return <Badge variant="secondary">{m["course.status.draft"]()}</Badge>;
}

function CourseHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-4">
        {eyebrow ? (
          <Badge
            variant="outline"
            className="border-primary/35 bg-background/40 px-3 py-1 text-[0.7rem] uppercase tracking-[0.28em]"
          >
            {eyebrow}
          </Badge>
        ) : null}
        <div className="space-y-4">
          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-5xl">{title}</h1>
          {description ? (
            <p className="max-w-3xl text-base leading-8 text-muted-foreground md:text-lg">
              {description}
            </p>
          ) : null}
        </div>
      </div>

      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}

function DetailList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ResourceList({
  items,
  icon,
}: {
  items: Array<{
    label: string;
    href: string;
    description?: string;
    format?: string;
  }>;
  icon: ReactNode;
}) {
  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <a
          key={`${item.label}-${item.href}`}
          href={item.href}
          target={item.href.startsWith("http") ? "_blank" : undefined}
          rel={item.href.startsWith("http") ? "noreferrer" : undefined}
          className="flex items-start gap-3 border border-border/60 bg-card/40 p-4 transition-colors hover:border-primary/35 hover:bg-card/65"
        >
          <span className="mt-0.5 text-primary">{icon}</span>
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block text-sm font-medium text-foreground">{item.label}</span>
            {item.description ? (
              <span className="block text-sm leading-6 text-muted-foreground">
                {item.description}
              </span>
            ) : null}
          </span>
          {item.format ? (
            <Badge variant="outline">{item.format}</Badge>
          ) : (
            <IconExternalLink className="size-4 shrink-0" />
          )}
        </a>
      ))}
    </div>
  );
}

function ChapterCard({ chapter }: { chapter: CourseChapterNode }) {
  const lessonCount = chapter.lessons.length;

  return (
    <Card className="border border-border/60 bg-card/45 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <Badge variant="outline" className="border-primary/25 bg-primary/8">
              {chapter.displayNumber}
            </Badge>
            <CardTitle className="text-2xl">{chapter.title}</CardTitle>
          </div>
          <StatusBadge status={chapter.status} />
        </div>
        <CardDescription className="leading-7">{chapter.summary}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {chapter.goals.length > 0 ? <DetailList items={chapter.goals} /> : null}

        <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          <span>
            {lessonCount} {m["course.cards.lessons"]()}
          </span>
        </div>
      </CardContent>

      <CardFooter>
        <Link
          to="/course/$chapterSlug"
          params={{ chapterSlug: chapter.slug }}
          className={`${buttonVariants({ size: "lg" })} w-full justify-between`}
        >
          {m["course.landing.explore"]()}
          <IconArrowRight />
        </Link>
      </CardFooter>
    </Card>
  );
}

function LessonCard({ chapter, lesson }: { chapter: CourseChapterNode; lesson: CourseLessonNode }) {
  return (
    <Card className="border border-border/60 bg-card/40 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <Badge variant="outline" className="border-primary/25 bg-primary/8">
              {lesson.displayNumber}
            </Badge>
            <CardTitle className="text-xl">{lesson.title}</CardTitle>
          </div>
          <StatusBadge status={lesson.status} />
        </div>
        <CardDescription className="leading-7">{lesson.summary}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {lesson.duration ? (
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <IconClock className="size-4" />
            <span>
              {m["course.lesson.duration"]()}: {lesson.duration}
            </span>
          </div>
        ) : null}

        {lesson.prerequisites.length > 0 ? <DetailList items={lesson.prerequisites} /> : null}
      </CardContent>

      <CardFooter>
        <Link
          to="/course/$chapterSlug/$lessonSlug"
          params={{ chapterSlug: chapter.slug, lessonSlug: lesson.slug }}
          className={`${buttonVariants({ variant: lesson.status === "coming-soon" ? "outline" : "default" })} w-full justify-between`}
        >
          {lesson.status === "coming-soon"
            ? m["course.status.coming_soon"]()
            : m["course.lesson.open"]()}
          <IconArrowRight />
        </Link>
      </CardFooter>
    </Card>
  );
}

function MetaGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.8fr)]">{children}</div>
  );
}

export function CourseLandingPage() {
  const totalLessons = accessibleCourseChapters.reduce(
    (count, chapter) => count + chapter.lessons.length,
    0,
  );

  return (
    <main className="kcontainer section pt-28 md:pt-32">
      <div className="space-y-12">
        <section className="border border-primary/18 bg-linear-to-br from-primary/14 via-card/50 to-card/55 p-6 md:p-8 lg:p-10 backdrop-blur-sm">
          <CourseHeading
            eyebrow={m["course.landing.eyebrow"]()}
            title={m["course.landing.title"]()}
            description={m["course.landing.description"]()}
            actions={
              <>
                {courseLandingChapter ? (
                  <Link
                    to="/course/$chapterSlug"
                    params={{ chapterSlug: courseLandingChapter.slug }}
                    className={buttonVariants({ size: "lg" })}
                  >
                    {m["course.landing.start"]()}
                    <IconArrowRight />
                  </Link>
                ) : null}
              </>
            }
          />

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <Card className="border border-border/50 bg-background/40">
              <CardHeader>
                <CardTitle>{accessibleCourseChapters.length}</CardTitle>
                <CardDescription>{m["course.stats.chapters"]()}</CardDescription>
              </CardHeader>
            </Card>
            <Card className="border border-border/50 bg-background/40">
              <CardHeader>
                <CardTitle>{totalLessons}</CardTitle>
                <CardDescription>{m["course.stats.lessons"]()}</CardDescription>
              </CardHeader>
            </Card>
            <Card className="border border-border/50 bg-background/40">
              <CardHeader>
                <CardTitle>{m["course.stats.free_value"]()}</CardTitle>
                <CardDescription>{m["course.stats.free_label"]()}</CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>

        <section className="space-y-6">
          <CourseHeading
            eyebrow={m["course.roadmap.eyebrow"]()}
            title={m["course.roadmap.title"]()}
            description={m["course.roadmap.description"]()}
          />

          {accessibleCourseChapters.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {accessibleCourseChapters.map((chapter) => (
                <ChapterCard key={chapter.slug} chapter={chapter} />
              ))}
            </div>
          ) : (
            <Card className="border border-dashed border-border/60 bg-card/35">
              <CardHeader>
                <CardTitle>{m["course.roadmap.empty"]()}</CardTitle>
              </CardHeader>
            </Card>
          )}
        </section>
      </div>
    </main>
  );
}

export function CourseChapterPage({ chapter }: { chapter: CourseChapterNode }) {
  return (
    <main className="kcontainer section pt-28 md:pt-32">
      <div className="space-y-10">
        <section className="space-y-6">
          <Link
            to="/course"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <IconArrowLeft className="size-4" />
            {m["course.chapter.back"]()}
          </Link>

          <CourseHeading
            eyebrow={`${chapter.displayNumber} · ${m["course.chapter.eyebrow"]()}`}
            title={chapter.title}
            description={chapter.summary}
          />
        </section>

        <MetaGrid>
          <Card className="border border-border/60 bg-card/40 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>{m["course.chapter.about"]()}</CardTitle>
              <CardDescription>{m["course.chapter.about_description"]()}</CardDescription>
            </CardHeader>
            <CardContent>
              <MdxContent code={chapter.mdx} />
            </CardContent>
          </Card>

          <div className="space-y-4">
            {chapter.goals.length > 0 ? (
              <Card className="border border-border/60 bg-card/40">
                <CardHeader>
                  <CardTitle>{m["course.chapter.goals"]()}</CardTitle>
                </CardHeader>
                <CardContent>
                  <DetailList items={chapter.goals} />
                </CardContent>
              </Card>
            ) : null}

            {chapter.resources.length > 0 ? (
              <Card className="border border-border/60 bg-card/40">
                <CardHeader>
                  <CardTitle>{m["course.chapter.resources"]()}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResourceList
                    items={chapter.resources}
                    icon={<IconExternalLink className="size-4" />}
                  />
                </CardContent>
              </Card>
            ) : null}
          </div>
        </MetaGrid>

        {chapter.lessons.length > 0 ? (
          <section className="space-y-6">
            <CourseHeading
              title={m["course.chapter.lessons"]()}
              description={m["course.chapter.lessons_description"]()}
            />
            <div className="grid gap-4 xl:grid-cols-2">
              {chapter.lessons.map((lesson) => (
                <LessonCard key={lesson.slug} chapter={chapter} lesson={lesson} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

export function CourseLessonPage({
  chapter,
  lesson,
  nextLesson,
}: {
  chapter: CourseChapterNode;
  lesson: CourseLessonNode;
  nextLesson: CourseLessonNode | null;
}) {
  const showVideo = lesson.status === "published" && lesson.youtubeId;

  return (
    <main className="kcontainer section pt-28 md:pt-32">
      <div className="space-y-10">
        <section className="space-y-6">
          <Link
            to="/course/$chapterSlug"
            params={{ chapterSlug: chapter.slug }}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <IconArrowLeft className="size-4" />
            {m["course.lesson.back"]()}
          </Link>

          <CourseHeading
            eyebrow={`${lesson.displayNumber} · ${chapter.title}`}
            title={lesson.title}
            description={lesson.summary}
            actions={<StatusBadge status={lesson.status} />}
          />
        </section>

        <MetaGrid>
          <div className="space-y-4">
            {showVideo ? (
              <div className="overflow-hidden border border-border/60 bg-card/45">
                <div className="aspect-video">
                  <iframe
                    title={lesson.title}
                    src={`https://www.youtube.com/embed/${lesson.youtubeId}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="size-full"
                  />
                </div>
              </div>
            ) : (
              <Card className="border border-dashed border-primary/25 bg-primary/6">
                <CardHeader>
                  <CardTitle>{m["course.placeholder.title"]()}</CardTitle>
                  <CardDescription className="leading-7">
                    {m["course.placeholder.description"]()}
                  </CardDescription>
                </CardHeader>
              </Card>
            )}

            <Card className="border border-border/60 bg-card/40 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>{m["course.lesson.notes"]()}</CardTitle>
              </CardHeader>
              <CardContent>
                <MdxContent code={lesson.mdx} />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {lesson.duration ? (
              <Card className="border border-border/60 bg-card/40">
                <CardHeader>
                  <CardTitle>{m["course.lesson.duration"]()}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <IconClock className="size-4" />
                    <span>{lesson.duration}</span>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {lesson.prerequisites.length > 0 ? (
              <Card className="border border-border/60 bg-card/40">
                <CardHeader>
                  <CardTitle>{m["course.lesson.prerequisites"]()}</CardTitle>
                </CardHeader>
                <CardContent>
                  <DetailList items={lesson.prerequisites} />
                </CardContent>
              </Card>
            ) : null}

            {lesson.toolsUsed.length > 0 ? (
              <Card className="border border-border/60 bg-card/40">
                <CardHeader>
                  <CardTitle>{m["course.lesson.tools"]()}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {lesson.toolsUsed.map((tool) => (
                      <Badge
                        key={tool}
                        variant="outline"
                        className="border-border/60 bg-background/35"
                      >
                        {tool}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {lesson.resources.length > 0 ? (
              <Card className="border border-border/60 bg-card/40">
                <CardHeader>
                  <CardTitle>{m["course.lesson.resources"]()}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResourceList
                    items={lesson.resources}
                    icon={<IconExternalLink className="size-4" />}
                  />
                </CardContent>
              </Card>
            ) : null}

            {lesson.downloads.length > 0 ? (
              <Card className="border border-border/60 bg-card/40">
                <CardHeader>
                  <CardTitle>{m["course.lesson.downloads"]()}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResourceList
                    items={lesson.downloads}
                    icon={<IconDownload className="size-4" />}
                  />
                </CardContent>
              </Card>
            ) : null}

            {showVideo ? (
              <Button asChild size="lg" className="w-full justify-between">
                <a
                  href={`https://www.youtube.com/watch?v=${lesson.youtubeId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {m["course.lesson.watch"]()}
                  <IconPlayerPlay />
                </a>
              </Button>
            ) : null}

            {nextLesson ? (
              <Card className="border border-primary/20 bg-linear-to-br from-primary/10 via-card/55 to-card/55">
                <CardHeader>
                  <CardDescription>{m["course.lesson.next"]()}</CardDescription>
                  <CardTitle>
                    {nextLesson.displayNumber} {nextLesson.title}
                  </CardTitle>
                </CardHeader>
                <CardFooter>
                  <Link
                    to="/course/$chapterSlug/$lessonSlug"
                    params={{
                      chapterSlug: chapter.slug,
                      lessonSlug: nextLesson.slug,
                    }}
                    className={`${buttonVariants({ variant: nextLesson.status === "coming-soon" ? "outline" : "default" })} w-full justify-between`}
                  >
                    {nextLesson.status === "coming-soon"
                      ? m["course.status.coming_soon"]()
                      : m["course.lesson.open"]()}
                    <IconArrowRight />
                  </Link>
                </CardFooter>
              </Card>
            ) : null}
          </div>
        </MetaGrid>
      </div>
    </main>
  );
}

export function CourseNotFoundPage() {
  return (
    <main className="kcontainer section pt-28 md:pt-32">
      <Card className="border border-dashed border-border/60 bg-card/35">
        <CardHeader>
          <CardTitle className="text-3xl">{m["course.not_found.title"]()}</CardTitle>
          <CardDescription className="max-w-2xl leading-7">
            {m["course.not_found.description"]()}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link to="/course" className={buttonVariants()}>
            {m["course.not_found.cta"]()}
            <IconArrowRight />
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
