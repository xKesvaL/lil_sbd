import { createFileRoute } from "@tanstack/react-router";
import { CourseHero } from "#/containers/course/course-hero.tsx";
import { CourseLandingPage } from "#/containers/course/course-pages.tsx";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/course/")({
  head: () => ({
    meta: [
      {
        title: `${m["course.landing.title"]()} | ${m["course.meta.suffix"]()}`,
      },
      {
        name: "description",
        content: m["course.meta.landing_description"](),
      },
    ],
  }),
  component: CoursePage,
});

function CoursePage() {
  return (
    <>
      <CourseHero />
      <CourseLandingPage />
    </>
  );
}
