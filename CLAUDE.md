# CLAUDE.md

Guidance for AI agents (and humans) working in this repo.

## What Paintdex is

A **fully static** Next.js (App Router) site: a searchable database of ~4,900
miniature paints with hex colours, perceptual (CIEDE2000) colour matching, and a
paint scheme visualiser. **No backend, no database, no auth** — paint data is
plain JSON in the repo, pages are statically generated, and per-user state
(visualiser schemes) lives in `localStorage`. Live at
[paintdex.app](https://paintdex.app) on Vercel; every push to `main` deploys.

## Commands

```bash
npm ci                 # install (reproducible; use over `npm install`)
npm run dev            # dev server on :3000 (predev builds the indexes first)
npm run build          # production build (prebuild builds the indexes first)
npm run lint           # ESLint
npm run test           # Vitest unit tests (colour maths, filtering, scheme io)
npm run validate:data  # validate data/paints/*.json against the Zod schema
```

CI (`.github/workflows/ci.yml`, Node 24) runs lint → validate:data → test →
build on every PR. Run these before pushing.

## Build-time index generation (important)

`npm run build:index` runs automatically via the `predev`/`prebuild` hooks. It
produces two **gitignored, generated** files the app depends on:

- `public/browse-index.json` — the browse dataset, fetched client-side by the
  `/paints` and `/visualiser` pages (kept out of the JS bundle).
- `.cache/similar-index.json` — precomputed CIEDE2000 similar-colour lists, read
  at build time when statically generating each `/paints/[id]` page.

If these are missing, `next build`/`next dev` regenerate them. Don't commit them.

## Layout

- `src/app/` — routes: `/` (home), `/paints` (browse), `/paints/[id]` (paint
  detail, SSG with `dynamicParams = false`), `/visualiser`, plus `robots.ts` and
  `sitemap.ts`. Root `layout.tsx` holds metadata, the WIP banner, and Vercel
  Analytics/Speed Insights.
- `src/components/` — client components (`paints-browser`, `similar-colours`,
  `scheme-visualiser`, etc.).
- `src/lib/` — pure logic, node-testable: `color/` (hex↔Lab, CIEDE2000,
  contrast, colour families), `paints/` (load, filter, types), `scheme/` (bar
  maths, JSON import/export, types).
- `data/paints/*.json` — the paint catalogue, one file per brand.
- `scripts/` — `build-browse-index.ts`, `build-similar-index.ts`,
  `validate-data.ts`, `import-source.mjs`.
- `test/` — Vitest suites for the `src/lib` logic.
- Import alias: `@/*` → `src/*`.

## Conventions & gotchas

- **URL is the source of truth** for browse filters/search (shareable views). On
  the statically-generated `/paints` page, update the URL with
  `window.history.replaceState`, **not** `router.replace` — `router.replace` is
  a no-op when the page was hard-loaded with query params (e.g. arriving from the
  homepage search), which silently freezes the results. See
  `src/components/paints-browser.tsx`.
- Keep everything **static** — no server components that read request-time data,
  no API routes. `getAllPaints()` and friends run at build time.
- Colour and scheme logic in `src/lib` is pure (no React/DOM) so it stays
  unit-testable; add tests in `test/` when changing it.
- The canonical site URL (`https://paintdex.app`) is hardcoded in
  `layout.tsx` (`metadataBase`), `robots.ts`, and `sitemap.ts` — update all
  three together if it ever changes.
- Paint hex values are best-effort; treat data edits as data, and run
  `npm run validate:data`.

## Deploying

Vercel builds `main` for production and gives every PR a preview URL. Nothing to
configure — it's a zero-config static Next.js app.
