import { createFileRoute } from "@tanstack/react-router";
import { CourseChapterPage, CourseNotFoundPage } from "#/containers/course/course-pages.tsx";
import { findAccessibleCourseChapter } from "#/lib/course.ts";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/course/$chapterSlug/")({
  head: ({ params }) => {
    const chapter = findAccessibleCourseChapter(params.chapterSlug);

    return {
      meta: [
        {
          title: chapter
            ? `${chapter.displayNumber} ${chapter.title} | ${m["course.meta.suffix"]()}`
            : `${m["course.not_found.title"]()} | ${m["course.meta.suffix"]()}`,
        },
        {
          name: "description",
          content: chapter?.summary ?? m["course.not_found.description"](),
        },
        ...(chapter?.shouldNoindex ? [{ name: "robots", content: "noindex, nofollow" }] : []),
      ],
    };
  },
  component: CourseChapterIndexRoute,
});

function CourseChapterIndexRoute() {
  const { chapterSlug } = Route.useParams();
  const chapter = findAccessibleCourseChapter(chapterSlug);

  if (!chapter) {
    return <CourseNotFoundPage />;
  }

  return <CourseChapterPage chapter={chapter} />;
}
