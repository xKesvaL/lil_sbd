import { IconMenu2, IconPlayerPlay } from "@tabler/icons-react";
import { cn } from "@/lib/utils.ts";
import { m } from "@/paraglide/messages";
import ParaglideLocaleSwitcher from "../LocaleSwitcher";
import { buttonVariants } from "../ui/button";
import { Separator } from "../ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";

const navItems = [
  { href: "#about", label: () => m.home_nav_about() },
  { href: "#music", label: () => m.home_nav_music() },
  { href: "#course", label: () => m.home_nav_course() },
  { href: "#contact", label: () => m.home_nav_contact() },
] as const;

function scrollToHash(hash: string) {
  if (typeof document === "undefined") {
    return;
  }

  const target = document.querySelector(hash);

  if (target instanceof HTMLElement) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", hash);
  }
}

export const Header = () => {
  return (
    <header className="sticky top-4 z-40 kcontainer">
      <div className="flex items-center gap-3  rounded-full border border-border/60 bg-background/78 px-4 py-3 shadow-lg shadow-black/10 backdrop-blur-md sm:px-5">
        <a href="#top" className="min-w-0">
          <span className="block text-[0.65rem] font-medium uppercase tracking-[0.32em] text-muted-foreground">
            {m.home_header_kicker()}
          </span>
          <span className="block truncate text-sm font-medium sm:text-base">
            {m.home_eyebrow()}
          </span>
        </a>

        <Separator orientation="vertical" className="hidden h-8 md:block" />

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "rounded-full text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label()}
            </a>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-3 md:flex">
          <ParaglideLocaleSwitcher compact />
          <a href="#music" className={buttonVariants({ size: "sm" })}>
            <IconPlayerPlay data-icon="inline-start" />
            {m.home_header_cta()}
          </a>
        </div>

        <div className="ml-auto md:hidden">
          <Sheet>
            <SheetTrigger
              render={
                <button
                  type="button"
                  className={buttonVariants({
                    variant: "outline",
                    size: "icon-sm",
                  })}
                />
              }
              aria-label={m.home_menu_open_label()}
            >
              <IconMenu2 />
            </SheetTrigger>
            <SheetContent side="right" className="border-border/60 bg-popover/96">
              <SheetHeader className="border-b border-border/60">
                <SheetTitle>{m.home_eyebrow()}</SheetTitle>
                <SheetDescription>{m.home_header_tagline()}</SheetDescription>
              </SheetHeader>

              <div className="flex flex-col gap-2 p-6">
                <ParaglideLocaleSwitcher className="mb-2" />
                {navItems.map((item) => (
                  <SheetClose
                    key={item.href}
                    onClick={() => scrollToHash(item.href)}
                    render={
                      <button
                        type="button"
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "lg" }),
                          "justify-start",
                        )}
                      />
                    }
                  >
                    {item.label()}
                  </SheetClose>
                ))}
              </div>

              <SheetFooter className="border-t border-border/60">
                <SheetClose
                  onClick={() => scrollToHash("#music")}
                  render={
                    <button
                      type="button"
                      className={cn(buttonVariants({ size: "lg" }), "justify-center")}
                    />
                  }
                >
                  <IconPlayerPlay data-icon="inline-start" />
                  {m.home_header_cta()}
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};
