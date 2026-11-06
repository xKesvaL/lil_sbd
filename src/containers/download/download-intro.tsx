import { m } from "#/paraglide/messages";

export function DownloadIntro() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="border bg-background/50 px-2 py-1 text-xs font-medium tracking-widest uppercase">
          {m["download.intro.eyebrow"]()}
        </div>
      </div>
      <h1 className="text-5xl font-bold italic md:text-6xl">{m["download.intro.title"]()}</h1>
      <p className="max-w-3xl text-lg">{m["download.intro.description"]()}</p>
    </div>
  );
}
