import { createFileRoute } from "@tanstack/react-router";
import { CourseLessonPage, CourseNotFoundPage } from "#/containers/course/course-pages.tsx";
import { findAccessibleCourseChapter, findAccessibleCourseLesson } from "#/lib/course.ts";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/course/$chapterSlug/$lessonSlug")({
  head: ({ params }) => {
    const chapter = findAccessibleCourseChapter(params.chapterSlug);
    const lesson = findAccessibleCourseLesson(params.chapterSlug, params.lessonSlug);

    return {
      meta: [
        {
          title: lesson
            ? `${lesson.displayNumber} ${lesson.title} | ${m["course.meta.suffix"]()}`
            : `${m["course.not_found.title"]()} | ${m["course.meta.suffix"]()}`,
        },
        {
          name: "description",
          content: lesson?.summary ?? m["course.not_found.description"](),
        },
        ...((lesson?.shouldNoindex ?? chapter?.shouldNoindex)
          ? [{ name: "robots", content: "noindex, nofollow" }]
          : []),
      ],
    };
  },
  component: CourseLessonRoute,
});

function CourseLessonRoute() {
  const { chapterSlug, lessonSlug } = Route.useParams();
  const chapter = findAccessibleCourseChapter(chapterSlug);
  const lesson = findAccessibleCourseLesson(chapterSlug, lessonSlug);

  if (!chapter || !lesson) {
    return <CourseNotFoundPage />;
  }

  const lessonIndex = chapter.lessons.findIndex((entry) => entry.slug === lesson.slug);
  const nextLesson = chapter.lessons[lessonIndex + 1] ?? null;

  return <CourseLessonPage chapter={chapter} lesson={lesson} nextLesson={nextLesson} />;
}
