import { IconArrowUpRight } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { Button } from "#/components/ui/button.tsx";
import { accessibleCourseChapters } from "#/lib/course.ts";
import { m } from "#/paraglide/messages";

export const CourseHero = () => {
  const totalLessons = accessibleCourseChapters.reduce(
    (count, chapter) => count + chapter.lessons.length,
    0,
  );

  return (
    <section className="kcontainer section">
      <div className="flex flex-col gap-4">
        <h1 className="text-5xl lg:text-6xl font-bold max-w-prose">
          {m["course.landing.title"]()}
        </h1>
        <p className="text-lg max-w-prose text-muted-foreground">
          {m["course.landing.description"]()}
        </p>
        <div className="grid grid-cols-3 gap-4 md:gap-8 mt-6">
          <div className="border p-6 bg-background/50 backdrop-blur-md">
            <span className="text-5xl font-bold">{totalLessons}</span>
            <p className="text-muted-foreground text-lg">{m["course.landing.total_lessons"]()}</p>
          </div>
          <div className="border p-6 bg-background/50 backdrop-blur-md">
            <span className="text-5xl font-bold">{accessibleCourseChapters.length}</span>
            <p className="text-muted-foreground text-lg">{m["course.landing.total_chapters"]()}</p>
          </div>
          <div className="border p-6 bg-background/50 backdrop-blur-md">
            <span className="text-5xl font-bold">100%</span>
            <p className="text-muted-foreground text-lg">{m["course.landing.free_course"]()}</p>
          </div>
        </div>

        <Button
          nativeButton={false}
          className="w-fit mt-4 ml-auto"
          render={
            <Link
              to="/course/$chapterSlug"
              params={{ chapterSlug: accessibleCourseChapters[0]?.slug }}
            />
          }
        >
          {m["course.landing.start"]()}
          <IconArrowUpRight />
        </Button>
      </div>
    </section>
  );
};
