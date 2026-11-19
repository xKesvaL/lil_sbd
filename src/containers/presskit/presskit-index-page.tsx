import { IconArrowRight, IconFolderDown } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "#/components/ui/button.tsx";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages";

export function PressKitIndexPage() {
  return (
    <section className="kcontainer section flex min-h-[55vh] flex-col items-start justify-center gap-6">
      <div className="border bg-background/50 px-2 py-1 text-xs font-medium tracking-widest uppercase">
        {m["presskit.index.eyebrow"]()}
      </div>

      <h1 className="text-5xl font-bold italic md:text-6xl">{m["presskit.index.title"]()}</h1>

      <p className="max-w-2xl text-lg text-muted-foreground">
        {m["presskit.index.description"]()}
      </p>

      <Link
        to="/presskit/download"
        className={cn(buttonVariants({ size: "lg" }), "mt-2")}
      >
        <IconFolderDown data-icon="inline-start" />
        {m["presskit.index.cta"]()}
        <IconArrowRight data-icon="inline-end" />
      </Link>
    </section>
  );
}
