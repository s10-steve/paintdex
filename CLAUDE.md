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
A future contributor can revisit this on purpose.

**The one deliberate exception is `/scheme/[slug]`** — the public shared-scheme
viewer — which *is* server-rendered so it can emit per-scheme OpenGraph title,
description and a generated colour-bar preview image (`opengraph-image.tsx`),
giving shared links a rich preview on Reddit/Instagram/etc. It reads the scheme
anonymously via RLS (`is_public = true`) with a server anon client
(`src/lib/supabase/server.ts`). This was a considered call: it's free within
Vercel's Hobby allowance and the rich preview is the whole point of the feature.
Everything else stays static/client-rendered — don't add more server routes
without the same kind of deliberate reason.

## Commands

```bash
npm ci                 # install (reproducible; use over `npm install`)
npm run dev            # dev server on :3000 (predev builds the indexes first)
npm run build          # production build (prebuild builds the indexes first)
npm run lint           # ESLint
npm run test           # Vitest tests (colour maths, filtering, scheme io + sync)
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
  detail, SSG with `dynamicParams = false`), `/visualiser`, `/my-schemes`
  (static shell → client scheme manager) and `/my-paints` (placeholder for the
  owned-paints feature), `/scheme/[slug]` (**server-rendered** public
  shared-scheme viewer + `opengraph-image.tsx`), plus `robots.ts` and
  `sitemap.ts`. Root `layout.tsx` holds metadata (incl. OpenGraph/Twitter),
  wraps the app in `ThemeProvider` + `AuthProvider`, and mounts the header and
  Vercel Analytics/Speed Insights.
- `src/components/` — client components (`paints-browser`, `similar-colours`,
  `scheme-visualiser`, `scheme-bars` (the shared bar visualisation + hover/
  tooltip, used by the editor and the read-only `scheme-view`), `site-header`,
  `mobile-nav`, `profile-nav` (signed-in-only header links), etc.), plus `auth/`
  (`auth-provider` with the `useAuth` hook + Google Identity Services init;
  `sign-in-button`) and `profile/` (`schemes-manager` for `/my-schemes`,
  `paints-placeholder` for `/my-paints`, and the shared `signed-in-gate`), and
  `scheme/` (the visualiser's presentational pieces: `element-card`, `layer-row`,
  `add-paint`, `icon-btn`, `role-tag`, plus the share-image studio —
  `poster-studio` (the modal) and `poster-canvas` (the interactive preview)).
  The theme follows the system setting (no manual toggle).
- `src/hooks/` — stateful React logic shared between components or lifted out of
  one: `use-browse-index` (loads the catalogue; used by all four views that need
  it), and the visualiser's three state layers — `use-local-scheme`
  (`localStorage`), `use-scheme-sync` (accounts, sign-in reconciliation,
  autosave), `use-scheme-share` (publishing a share link). `use-poster` holds
  the share-image state (photo, framing, anchors) in its own `localStorage` key
  — deliberately *not* in the scheme document, which has to stay portable.
- `src/lib/` — pure logic, node-testable: `color/` (hex↔Lab, CIEDE2000,
  contrast, colour families), `paints/` (load, filter, types), `scheme/` (bar
  maths, JSON import/export, types). Also `supabase/` (browser client +
  hand-written row types) and `data/` (per-table CRUD, e.g. `schemes.ts`) — these
  touch the network, so keep them thin and keep the logic in the pure modules.
  `supabase/server.ts` is the anon server-read client used only by the
  `/scheme/[slug]` route; `scheme/share.ts` holds the pure share-slug helpers.
  `scheme/poster.ts` is the pure layout maths for the share image (callout
  packing, photo framing, anchor projection); `scheme/poster-draw.ts` is its
  Canvas 2D renderer — see "Share images" below.
- `supabase/schema.sql` — the Postgres tables + Row-Level Security for accounts
  (run in the Supabase SQL editor; not applied automatically).
- `data/paints/*.json` — the paint catalogue, one file per brand.
- `scripts/` — `build-browse-index.ts`, `build-similar-index.ts`,
  `validate-data.ts`, `import-source.mjs`.
- `test/` — Vitest suites for the `src/lib` logic, plus
  `scheme-visualiser.test.tsx`, which covers the sign-in reconciliation wiring
  (the one place a bug loses user data). The environment is `node` by default;
  component tests opt into jsdom with a per-file `@vitest-environment jsdom`
  docblock, so the pure suites stay fast.
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
  no API routes — **except the one deliberate `/scheme/[slug]` server route**
  (rich share previews; see "What Paintdex is" above). `getAllPaints()` and
  friends run at build time. This is a cost-driven convention, not a technical
  constraint (`output: 'export'` is not set); see "What Paintdex is" above before
  relaxing it further. Account features follow it: Supabase is called from the
  browser (and, for that one server route, from an anon server client that can
  only read public rows).
- Colour and scheme logic in `src/lib` is pure (no React/DOM) so it stays
  unit-testable; add tests in `test/` when changing it.
- The canonical site URL (`https://paintdex.app`) is hardcoded in
  `layout.tsx` (`metadataBase`), `robots.ts`, and `sitemap.ts` — update all
  three together if it ever changes.
- Paint hex values are best-effort; treat data edits as data, and run
  `npm run validate:data`.

## Share images (the poster)

The visualiser's **Share image** button opens a studio that renders the scheme
over a photo of the model as a 4:5 PNG (1080×1350 logical, exported at 2×) for
social media: one callout per element, each with the element's banded ramp and
its paint names, joined by a leader line to a point on the model.

Things to know before changing it:

- **Canvas 2D, hand-rolled, no dependencies.** `next/og` (Satori) was rejected:
  it supports neither CSS gradients nor blend modes, which is why
  `opengraph-image.tsx` already draws banded solids and drops overlays entirely.
  Canvas does both, and running client-side means **the photo never leaves the
  browser** — there is no upload and no server route.
- **One renderer for preview and export.** `drawPoster()` takes a `scale`; the
  preview passes `devicePixelRatio`, the export passes 2. Don't add a second
  drawing path. Editor-only chrome (grab handles) is drawn by `poster-canvas`
  *after* `drawPoster`, so it can never reach the PNG.
- **Anchors are normalised against the source photo, not the poster**, so they
  stay on the model when the user zooms or pans. `photoRect()` is shared by the
  renderer and by `projectAnchor`/`unprojectAnchor` — keep it that way.
- Anchors persist by element **index plus name** (`reconcileAnchors`), because
  `SchemeElement.id` comes from `uid.ts` and is regenerated every session.
- Poster state is **not** part of `ExportShape` — schemes stay portable and
  `canonicalScheme` comparison is unaffected. The photo lives in `localStorage`
  under `paintdex-poster-v1`, degrading to a smaller re-encode and then to
  no-photo-at-all rather than losing the anchors to a quota error. Supabase
  Storage is a later phase.
- Layout degrades deterministically when callouts don't fit (tighten the gap →
  truncate paint lists with `+N more` → drop from the end of scheme order) and
  **always reports what it left out** in `layout.omitted`. Keep it that way; the
  studio surfaces those reasons to the user.
- `ctx.font` can't take a CSS variable — use `resolveFontFamily()` and
  `await document.fonts.ready`, or the export silently ships in system sans.

## Deploying

Vercel builds `main` for production and gives every PR a preview URL — it's a
zero-config static Next.js app. The **core site needs no configuration**;
**accounts** additionally need the three `NEXT_PUBLIC_*` env vars (see
`.env.example`) set in Vercel (Production/Preview/Development) — they're inlined
at build time, so add them and redeploy. Google sign-in also requires the site's
origins in the OAuth client's Authorized JavaScript origins, and the client id
listed under Supabase → Auth → Providers → Google. With the env vars absent, the
build still succeeds and ships the site without accounts.
