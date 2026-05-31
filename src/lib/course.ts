import {
  allCourseChapters,
  allCourseLessons,
  type CourseChapter,
  type CourseLesson,
} from "content-collections";

export type CoursePageStatus = "published" | "coming-soon" | "draft";

export type CourseLessonNode = CourseLesson & {
  href: string;
  status: CoursePageStatus;
  isAccessible: boolean;
  shouldNoindex: boolean;
};

export type CourseChapterNode = CourseChapter & {
  href: string;
  status: CoursePageStatus;
  isAccessible: boolean;
  shouldNoindex: boolean;
  lessons: CourseLessonNode[];
};

function sortByNumber(a: number, b: number) {
  return a - b;
}

export function getCoursePageStatus(entry: { published: boolean; comingSoon: boolean }) {
  if (entry.published) {
    return "published" satisfies CoursePageStatus;
  }

  if (entry.comingSoon) {
    return "coming-soon" satisfies CoursePageStatus;
  }

  return "draft" satisfies CoursePageStatus;
}

export function shouldNoindexCoursePage(entry: {
  published: boolean;
  comingSoon: boolean;
  noindex: boolean;
}) {
  return entry.noindex || entry.comingSoon || !entry.published;
}

export function getCourseChapterHref(chapterSlug: string) {
  return `/course/${chapterSlug}`;
}

export function getCourseLessonHref(chapterSlug: string, lessonSlug: string) {
  return `${getCourseChapterHref(chapterSlug)}/${lessonSlug}`;
}

export function compareCourseChapters(a: CourseChapter, b: CourseChapter) {
  return sortByNumber(a.chapterOrder, b.chapterOrder);
}

export function compareCourseLessons(a: CourseLesson, b: CourseLesson) {
  return sortByNumber(a.lessonOrder, b.lessonOrder);
}

export const sortedCourseChapters = [...allCourseChapters].sort(compareCourseChapters);
export const sortedCourseLessons = [...allCourseLessons].sort(compareCourseLessons);

export const courseChapters = sortedCourseChapters.map((chapter) => {
  const lessons = sortedCourseLessons
    .filter((lesson) => lesson.chapterSlug === chapter.slug)
    .map((lesson) => {
      const status = getCoursePageStatus(lesson);

      return {
        ...lesson,
        href: getCourseLessonHref(chapter.slug, lesson.slug),
        status,
        isAccessible: status !== "draft",
        shouldNoindex: shouldNoindexCoursePage(lesson),
      } satisfies CourseLessonNode;
    });

  const status = getCoursePageStatus(chapter);

  return {
    ...chapter,
    href: getCourseChapterHref(chapter.slug),
    status,
    isAccessible: status !== "draft",
    shouldNoindex: shouldNoindexCoursePage(chapter),
    lessons,
  } satisfies CourseChapterNode;
});

export const accessibleCourseChapters = courseChapters.filter((chapter) => chapter.isAccessible);

export function findCourseChapter(chapterSlug: string) {
  return courseChapters.find((chapter) => chapter.slug === chapterSlug) ?? null;
}

export function findCourseLesson(chapterSlug: string, lessonSlug: string) {
  const chapter = findCourseChapter(chapterSlug);

  if (!chapter) {
    return null;
  }

  return chapter.lessons.find((lesson) => lesson.slug === lessonSlug) ?? null;
}

export function findAccessibleCourseChapter(chapterSlug: string) {
  const chapter = findCourseChapter(chapterSlug);

  if (!chapter || !chapter.isAccessible) {
    return null;
  }

  return chapter;
}

export function findAccessibleCourseLesson(chapterSlug: string, lessonSlug: string) {
  const lesson = findCourseLesson(chapterSlug, lessonSlug);

  if (!lesson || !lesson.isAccessible) {
    return null;
  }

  return lesson;
}

export const courseLandingChapter = accessibleCourseChapters[0] ?? null;
