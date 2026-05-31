import { IconArrowRight } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { Button } from "#/components/ui/button.tsx";
import { m } from "#/paraglide/messages";

export const HomeCourse = () => {
  return (
    <section className="kcontainer section grid grid-cols-2 gap-8 md:gap-12 lg:gap-20 items-center">
      <div className="flex flex-col gap-4 bg-background/50 backdrop-blur-md p-6 border">
        <h2 className="text-4xl font-bold">{m["home.course.title"]()}</h2>
        <p className="text-lg max-w-prose">{m["home.course.description"]()}</p>
        <Button nativeButton={false} className="w-fit" render={<Link to="/course" />}>
          {m["home.course.cta"]()}
          <IconArrowRight />
        </Button>
      </div>
    </section>
  );
};
