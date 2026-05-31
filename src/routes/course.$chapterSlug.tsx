import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/course/$chapterSlug")({
  component: CourseChapterLayout,
});

function CourseChapterLayout() {
  return <Outlet />;
}
