import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/presskit")({
  component: PressKitLayout,
});

function PressKitLayout() {
  return <Outlet />;
}
