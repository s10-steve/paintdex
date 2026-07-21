# CLAUDE.md

Guidance for AI agents (and humans) working in this repo.

## What Paintdex is

A **static** Next.js (App Router) site: a searchable database of ~4,900
miniature paints with hex colours, perceptual (CIEDE2000) colour matching, and a
paint scheme visualiser. Paint data is plain JSON in the repo and pages are
statically generated. Per-user state (visualiser schemes) lives in
`localStorage` by default. Live at [paintdex.app](https://paintdex.app) on
Vercel; every push to `main` deploys.

**Accounts (optional).** Sign-in and saved schemes are powered by **Supabase**,
called **directly from the browser** — there are still **no Next.js API routes
and no server components that read request-time data**, so the site stays
static; the backend lives entirely outside Vercel. Access is enforced by Row-
Level Security (see `supabase/schema.sql`), which is why the public
`NEXT_PUBLIC_SUPABASE_*` anon key is safe to ship (see `.env.example`). Sign-in
uses **Google Identity Services** in the browser (the `signInWithIdToken` flow),
so Google's consent screen is branded to our own domain rather than the Supabase
callback domain. If those env vars are unset the site runs exactly as before —
account features hide themselves and the visualiser falls back to `localStorage`
only.

**"Keep everything static" is a cost-driven convention, not a hard limit.**
`output: 'export'` is **not** set in `next.config.ts`, so Next.js server
features (API routes, server components, server actions) *are* available on
Vercel — we deliberately avoid them to keep the site free to host and
maintenance-free (there's no revenue model), not because the build forbids them.
A future contributor can revisit this on purpose. The most likely reason to
would be server-rendered pages for SEO; note that's **not** needed for the
planned share links, which are user-to-user, not public search resources.

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
  `sitemap.ts`. Root `layout.tsx` holds metadata (incl. OpenGraph/Twitter),
  wraps the app in `ThemeProvider` + `AuthProvider`, and mounts the header and
  Vercel Analytics/Speed Insights.
- `src/components/` — client components (`paints-browser`, `similar-colours`,
  `scheme-visualiser`, `site-header`, `mobile-nav`, etc.), plus `auth/`
  (`auth-provider` with the `useAuth` hook + Google Identity Services init;
  `sign-in-button`). The theme follows the system setting (no manual toggle).
- `src/lib/` — pure logic, node-testable: `color/` (hex↔Lab, CIEDE2000,
  contrast, colour families), `paints/` (load, filter, types), `scheme/` (bar
  maths, JSON import/export, types). Also `supabase/` (browser client +
  hand-written row types) and `data/` (per-table CRUD, e.g. `schemes.ts`) — these
  touch the network, so keep them thin and keep the logic in the pure modules.
- `supabase/schema.sql` — the Postgres tables + Row-Level Security for accounts
  (run in the Supabase SQL editor; not applied automatically).
- `data/paints/*.json` — the paint catalogue, one file per brand.
- `scripts/` — `build-browse-index.ts`, `build-similar-index.ts`,
  `validate-data.ts`, `import-source.mjs`.
- `test/` — Vitest suites for the `src/lib` logic.
- `src/types/gis.d.ts` — minimal typings for the Google Identity Services lib.
- `.env.example` — the three `NEXT_PUBLIC_*` vars accounts need (Supabase URL +
  anon key, Google client id).
- Import alias: `@/*` → `src/*`.

## Conventions & gotchas

- **URL is the source of truth** for browse filters/search (shareable views). On
  the statically-generated `/paints` page, update the URL with
  `window.history.replaceState`, **not** `router.replace` — `router.replace` is
  a no-op when the page was hard-loaded with query params (e.g. arriving from the
  homepage search), which silently freezes the results. See
  `src/components/paints-browser.tsx`.
- Keep everything **static** — no server components that read request-time data,
  no API routes. `getAllPaints()` and friends run at build time. This is a
  cost-driven convention, not a technical constraint (`output: 'export'` is not
  set); see "What Paintdex is" above before relaxing it. Account features follow
  it too: Supabase is called from the browser, never via a Next.js route.
- Colour and scheme logic in `src/lib` is pure (no React/DOM) so it stays
  unit-testable; add tests in `test/` when changing it.
- The canonical site URL (`https://paintdex.app`) is hardcoded in
  `layout.tsx` (`metadataBase`), `robots.ts`, and `sitemap.ts` — update all
  three together if it ever changes.
- Paint hex values are best-effort; treat data edits as data, and run
  `npm run validate:data`.

## Deploying

Vercel builds `main` for production and gives every PR a preview URL — it's a
zero-config static Next.js app. The **core site needs no configuration**;
**accounts** additionally need the three `NEXT_PUBLIC_*` env vars (see
`.env.example`) set in Vercel (Production/Preview/Development) — they're inlined
at build time, so add them and redeploy. Google sign-in also requires the site's
origins in the OAuth client's Authorized JavaScript origins, and the client id
listed under Supabase → Auth → Providers → Google. With the env vars absent, the
build still succeeds and ships the site without accounts.
