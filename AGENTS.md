# Agents

- Lil SBD is the user's artist project.
- Music direction: uptempo hardcore, with emphasis on zaag kicks and a more musical backbone.
- Site purpose: present who Lil SBD is, showcase the music, and promote a free production course.
- Tone: professional, human, direct, and not corny.

- Stack: TanStack Start, React 19, Vite+, shadcn/base UI, Tailwind v4, Paraglide i18n, Bun.
- Shell lives in `src/routes/__root.tsx`; it mounts the global `Header` and `Footer`.
- Keep `src/routes/index.tsx` thin. Homepage sections should live in `src/containers/home/*`.
- `src/components/layout/Header.tsx` owns global nav, locale switcher, listen-now UI, and the mobile sheet menu.
- `src/containers/home/home-hero.tsx` owns the above-the-fold hero, release card, provider shortcuts, and audio-player surface.
- Song/provider logic should stay centralized. `home-hero.tsx` already uses shared audio/song/provider state; do not duplicate it in route files.
- Copy lives in `messages/en.json`, `messages/fr.json`, and `messages/de.json`. Locale config lives in `project.inlang/settings.json`.
- After i18n changes, run `bun run build` or `bun run dev` to regenerate `src/paraglide`.
- Lil SBD copy should feel human, direct, and professional. Avoid corny language.
- Keep the dark purple brand direction. Do not casually change identity tokens in `src/styles.css`, especially `--primary` and `--accent`.
- Use existing shadcn/base components before inventing new primitives.
- Read current files before editing. The user actively changes the homepage structure.
- Prefer `bun run build` for validation after meaningful UI or i18n changes.
