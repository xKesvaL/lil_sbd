import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/course")({
  component: CourseLayout,
});

function CourseLayout() {
  return <Outlet />;
}
