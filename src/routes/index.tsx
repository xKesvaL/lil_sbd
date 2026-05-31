import { createFileRoute } from "@tanstack/react-router";

import { HomeCourse } from "#/containers/home/home-course.tsx";
import { HomeHero } from "#/containers/home/home-hero.tsx";
import { HomeSections } from "#/containers/home/home-sections.tsx";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <>
      <HomeHero />
      <HomeCourse />

      <HomeSections />
    </>
  );
}
