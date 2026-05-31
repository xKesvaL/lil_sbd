import { createFileRoute } from "@tanstack/react-router";
import DarkVeil from "#/components/react-bits/dark-veil.tsx";
import { HomeCourse } from "#/containers/home/home-course.tsx";
import { HomeHero } from "#/containers/home/home-hero.tsx";
import { HomeSections } from "#/containers/home/home-sections.tsx";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main id="top" className="relative overflow-hidden pt-20">
      <div className="fixed inset-0 -z-10 opacity-70">
        <DarkVeil
          hueShift={0}
          noiseIntensity={0.07}
          scanlineIntensity={0.15}
          speed={1.5}
          scanlineFrequency={1}
          warpAmount={5}
          verticalOffset={0.2}
        />
      </div>

      <HomeHero />
      <HomeCourse />

      <HomeSections />
    </main>
  );
}
