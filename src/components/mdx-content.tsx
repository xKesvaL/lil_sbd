import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { cn } from "#/lib/utils.ts";

type MdxContentProps = {
  code: string;
  className?: string;
};

const mdxComponents = {
  a: (props: React.ComponentProps<"a">) => (
    <a
      {...props}
      className={cn("text-primary underline underline-offset-4", props.className)}
      target={props.href?.startsWith("http") ? "_blank" : props.target}
      rel={props.href?.startsWith("http") ? "noreferrer" : props.rel}
    />
  ),
  h1: (props: React.ComponentProps<"h1">) => (
    <h1
      {...props}
      className={cn("text-3xl font-semibold tracking-tight md:text-4xl", props.className)}
    />
  ),
  h2: (props: React.ComponentProps<"h2">) => (
    <h2
      {...props}
      className={cn("mt-10 text-2xl font-semibold tracking-tight text-foreground", props.className)}
    />
  ),
  h3: (props: React.ComponentProps<"h3">) => (
    <h3 {...props} className={cn("mt-8 text-xl font-medium text-foreground", props.className)} />
  ),
  p: (props: React.ComponentProps<"p">) => (
    <p {...props} className={cn("text-base leading-8 text-muted-foreground", props.className)} />
  ),
  ul: (props: React.ComponentProps<"ul">) => (
    <ul
      {...props}
      className={cn("space-y-3 pl-5 text-base leading-7 text-muted-foreground", props.className)}
    />
  ),
  ol: (props: React.ComponentProps<"ol">) => (
    <ol
      {...props}
      className={cn("space-y-3 pl-5 text-base leading-7 text-muted-foreground", props.className)}
    />
  ),
  li: (props: React.ComponentProps<"li">) => (
    <li {...props} className={cn("pl-1", props.className)} />
  ),
  strong: (props: React.ComponentProps<"strong">) => (
    <strong {...props} className={cn("font-semibold text-foreground", props.className)} />
  ),
  code: (props: React.ComponentProps<"code">) => (
    <code
      {...props}
      className={cn(
        "rounded-md bg-muted/70 px-1.5 py-0.5 text-sm text-foreground",
        props.className,
      )}
    />
  ),
};

export function MdxContent({ code, className }: MdxContentProps) {
  const Component = React.useMemo(() => {
    const evaluator = new Function("_jsx_runtime", code) as (runtime: typeof jsxRuntime) => {
      default: React.ComponentType<{ components?: typeof mdxComponents }>;
    };

    return evaluator(jsxRuntime).default;
  }, [code]);

  return (
    <div className={cn("space-y-5", className)}>
      <Component components={mdxComponents} />
    </div>
  );
}
