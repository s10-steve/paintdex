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
- `src/components/` — client components (`paints-browser`, `similar-colours`
  (the shell: filters + the List/Plot toggle), `similar-list` (the ΔE-ranked
  cards), `similar-plot` (the hue/lightness plot — see "The alternatives plot"
  below),
  `scheme-visualiser`, `scheme-bars` (the shared bar visualisation + hover/
  tooltip, used by the editor and the read-only `scheme-view`), `site-header`,
  `mobile-nav`, `profile-nav` (signed-in-only header links),
  `home-scheme-carousel` (the homepage's auto-rotating example schemes — renders
  the real `Bar`, not a mock), etc.), plus `auth/`
  (`auth-provider` with the `useAuth` hook + Google Identity Services init;
  `sign-in-button`) and `profile/` (`schemes-manager` for `/my-schemes`,
  `paints-placeholder` for `/my-paints`, and the shared `signed-in-gate`), and
  `scheme/` (the visualiser's presentational pieces: `element-card`, `layer-row`,
  `add-paint`, `icon-btn`, `role-tag`, plus the share-image studio —
  `poster-studio` (the modal) and `poster-canvas` (the interactive preview)).
  The theme follows the system setting (no manual toggle).
- `src/hooks/` — stateful React logic shared between components or lifted out of
  one: `use-browse-index` (loads the catalogue; used by all four views that need
  it), `use-element-width` (a `ResizeObserver` wrapper; the alternatives plot lays
  out in real pixels, so it needs a measured width), and the visualiser's three
  state layers — `use-local-scheme`
  (`localStorage`), `use-scheme-sync` (accounts, sign-in reconciliation,
  autosave), `use-scheme-share` (publishing a share link), `use-scheme-preset`
  (loads an example scheme from `?preset=<slug>`). `use-poster` holds
  the share-image state (photo, framing, anchors) in its own `localStorage` key
  — deliberately *not* in the scheme document, which has to stay portable.
- `src/lib/` — pure logic, node-testable: `color/` (hex↔Lab, CIEDE2000, LCh,
  contrast, colour families), `paints/` (load, filter, types, plus `scatter.ts` —
  the alternatives plot's layout maths), `scheme/` (bar maths, JSON
  import/export, types). Also `supabase/` (browser client +
  hand-written row types) and `data/` (per-table CRUD, e.g. `schemes.ts`) — these
  touch the network, so keep them thin and keep the logic in the pure modules.
  `supabase/server.ts` is the anon server-read client used only by the
  `/scheme/[slug]` route; `scheme/share.ts` holds the pure share-slug helpers.
  `scheme/poster.ts` is the pure layout maths for the share image (callout
  packing, photo framing, anchor projection); `scheme/poster-draw.ts` is its
  Canvas 2D renderer — see "Share images" below. `scheme/presets.ts` holds the
  curated example schemes — see "Example schemes" below.
- `supabase/schema.sql` — the Postgres tables + Row-Level Security for accounts
  (run in the Supabase SQL editor; not applied automatically).
- `data/paints/*.json` — the paint catalogue, one file per brand.
- `scripts/` — `build-browse-index.ts`, `build-similar-index.ts`,
  `validate-data.ts`, `import-source.mjs`.
- `test/` — Vitest suites for the `src/lib` logic (including `scatter.test.ts`,
  which is where the alternatives plot's behaviour is pinned), plus
  `scheme-visualiser.test.tsx` and `scheme-preset.test.tsx`, which cover the two
  places a bug loses user data (sign-in reconciliation; `?preset=` seeding), and
  `home-scheme-carousel.test.tsx`. The environment is `node` by default;
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
- The visualiser has **two** deep links, both read from `window.location` in an
  effect (never `useSearchParams`, so the page stays static and needs no Suspense
  boundary), and both strip their param with `history.replaceState` once handled:
  `?scheme=<uuid>` selects one of the signed-in user's saved rows
  (`use-scheme-sync`), and `?preset=<slug>` loads a curated example
  (`use-scheme-preset`). See "Example schemes" below for why the second one is
  the more dangerous of the two.

## Example schemes (the homepage carousel)

`src/lib/scheme/presets.ts` holds a handful of curated schemes, shown by
`home-scheme-carousel` on the homepage and loadable into the visualiser via
`/visualiser?preset=<slug>`.

- **Presets store catalogue ids and a hand-picked `SchemeRole`, never hexes.** The
  role has to be by hand — the catalogue's `range`/`type` vocabulary is a
  different thing entirely ("Shade" is a product line; `wash` is how a paint reads
  in a bar). Hexes come from a `PaintLookup` passed in by the caller, so a hex
  correction in `data/paints/` reaches the homepage for free.
- `presets.ts` **must not import `@/lib/paints/load`** — that's the whole reason
  the lookup is a parameter. `page.tsx` passes `getPaintById` at build time and
  hands plain resolved props to the client; the visualiser passes a map over the
  browse index it already fetched. Import the loader from a client component and
  the ~4,900-paint catalogue lands in the browser bundle.
- Element/paint ids are derived from `slug` + position, **not `uid()`** — that's a
  session counter, so server and client would disagree and React keys would
  collide between slides.
- `test/presets.test.ts` is a **drift guard**: it fails if any preset id has left
  the catalogue. That's what makes storing ids instead of hexes safe. It
  deliberately does *not* assert the `fallback` hexes match the catalogue, or
  every legitimate data correction would go red.
- **`?preset=` can destroy work, so it's gated.** `use-scheme-preset` waits for
  `mounted` (past the `localStorage` restore) **and** `ready` from
  `use-scheme-sync` (past sign-in reconciliation) before it touches the scheme.
  Then it branches on sign-in state, and the branch is the point:
  - **Signed in** → `adoptScheme`, which saves the example as a **new** row. The
    scheme they were on stays saved and selectable, so nothing is lost and
    **there is no confirm prompt** — one would be asking permission for something
    that isn't happening. (It also stops the account autosave writing the example
    over the active row.)
  - **Signed out** → `localStorage` is the only copy, so loading an example really
    does destroy the editor's contents. `window.confirm` first, whenever
    `schemeHasContent`.

  Remove any one of those and `test/scheme-preset.test.tsx` goes red. Two of its
  cases are deliberately awkward to keep honest: the `ready` gate is covered by a
  test that holds `listSchemes` open to force the losing ordering, and the
  signed-in path asserts `confirm` is *never* called.
- The share-image section on the homepage uses `public/sample-poster.jpg`, a real
  export from the studio (not a re-render), so it can't drift from what the
  feature actually produces. **It is paired with the `death-guard-30k` preset** —
  the scheme that painted the model in that photo — and its caption and CTA both
  say so. There is a separate, unrelated `death-guard` (40K) preset, so if you
  repoint that CTA, check you aren't captioning the photo with a recipe that
  didn't paint it.
- `Bar`'s `min-w-[56px]` floor is sized so a one-word element name fits on one
  line ("Tentacles" needs 54px). Lower it and long names split mid-word, because
  `break-words` is the only thing stopping them overflowing into the next bar and
  `hyphens: auto` can't help — hyphenation doesn't apply to an emergency break.

## The alternatives plot

The paint detail page's second view of its matches: the same candidates as the
ΔE list, placed by hue shift (across) and lightness (up), with the paint you're
on at the origin. `src/lib/paints/scatter.ts` is the pure layout maths;
`src/components/similar-plot.tsx` renders it. The list is still the default.

- **x is relative to the reference paint, y is relative lightness.** Both are
  signed differences, so the reference sits on the zero lines and switching axes
  never moves it. An absolute 0–360 hue axis was rejected: a paint's ΔE<10
  neighbourhood spans ±10–35°, which would compress into a ~5% sliver.
- **Only the hue domain is symmetric.** Hue can shift either way with no bound.
  Lightness and chroma both have hard limits, and forcing symmetry on them wasted
  half the plot on the paints that need it most — nothing is *less* saturated than
  Abaddon Black (C\* = 0) and nothing is darker, so a symmetric domain handed the
  entire left and bottom halves to values that cannot exist.
- **Near-neutral targets get a saturation axis, not a hue axis.** Below
  `NEUTRAL_CHROMA` (10) a Lab hue angle is noise, not merely small — Administratum
  Grey's near matches span −180…+161° of "hue shift". That's about a quarter of
  the catalogue, including heavily-visited pages, so `pickScatterAxis` is v1
  scope, not a refinement. Both axes stay offered; the label says "Saturation"
  because "chroma" isn't a word miniature painters use. Individual near-neutral
  candidates in hue mode are flagged `hueUncertain` and drawn with a dashed ring —
  never hidden, and never damped toward 0, which would be a different lie.
- **The plot recomputes its candidates; it does not use the precomputed index.**
  `.cache/similar-index.json` holds 16 per paint, which spans about ±5° of hue —
  a vertical smear, not a scatter. Don't "fix" that by raising its `LIMIT`: the
  client never reads that file (the page inlines those records into the RSC
  payload), so 120 would add ~18KB to each of 4,961 static pages to serve a
  non-default view. The list's own data path is deliberately left untouched, both
  because its instant fetch-free first render is a real feature and because the
  cached distances are rounded to 3dp, so a client recompute reorders ties and
  visibly reshuffles the default view.
- **Two caps, and both are reported.** `MAX_POINTS` (120) is the compute ceiling;
  `capForArea` is the readability one and is what binds on a phone, where 120
  touch-sized marks tile the plot into a solid block. Whatever is dropped shows up
  in `layout.omittedCount` and in the caption, like the poster's `layout.omitted`.
- **Overlap is bounded, not eliminated.** `MAX_DISPLACEMENT_R` caps how far a mark
  may sit from the truth, and it deliberately outranks clickability: inside 3
  radii only ~7 marks fit a diameter apart, so dense piles stay partly stacked and
  `layout.overlapping` says how many. Vallejo White is the case that forces this —
  203 near matches share only 113 distinct hexes, so ~90 marks start life exactly
  coincident, which is also why there's a deterministic golden-angle pre-spread
  (a zero-length separation vector has no gradient to follow). There is no spring
  pulling marks home: it silently balanced the separation force, so piles settled
  overlapped while still reporting `converged: true`.
- Marks may cross x = 0 under relaxation. Clamping the sign would fight the packer
  exactly where it's needed; the bounded displacement plus a tether line on
  `displaced` marks is the honest signal instead.
- `layout.inset` is published for the renderer to read back, for the same reason
  as `PosterLayout.rowHeight` — a renderer that insets by its own number puts
  every gridline slightly off its own marks, and nothing looks broken enough to
  notice.
- **SVG for the chrome, HTML anchors for the marks.** An `<a>` inside `<svg>` is
  an `SVGAElement`, which gives up real focus rings, `border-radius` and Tailwind
  classes for nothing. `prefetch={false}` on those links is load-bearing: App
  Router prefetches static routes on viewport intersection, so leaving it on fires
  ~120 RSC requests the moment the plot scrolls into view.
- **DOM order is the ΔE ranking**, so reading order, link order and keyboard order
  all match the list. Closest-on-top is done with `z-index`; reversing the DOM to
  paint it would read the ranking out backwards to a screen reader. Marks are a
  roving-tabindex group (one tab stop, arrows walk the ranking) and each carries
  its position in its `aria-label`, so the axes aren't a visual-only channel —
  this is deliberately *not* the poster's pointer-only anchor problem repeated.
- `?view=plot` is read from `window.location` in a mount effect (never
  `useSearchParams` — this page has no Suspense boundary) and written with
  `history.replaceState`, never `router.replace`.

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
- `layoutPoster` takes the whole `PosterOptions` and derives the paint-row pitch
  itself (`paintRowHeight`), publishing it as `layout.rowHeight` for the renderer
  to read back. Don't pass a pre-computed pitch alongside the options: showing
  manufacturers makes rows two lines tall, and a caller that sets `showBrands`
  but reserves one-line space gets text crushed into the next paint, silently.
- `ctx.font` can't take a CSS variable — use `resolveFontFamily()` and
  `await document.fonts.ready`, or the export silently ships in system sans.
- Two renderer caveats worth knowing: `ctx.letterSpacing` is unsupported in
  older Safari/Firefox, where the tracked text (element names, the credit line)
  simply renders untracked rather than breaking; and `setShadow` is ambient
  state, so anything drawn between a `setShadow(ctx, …)` and its reset inherits
  the blur — `drawRampStrip` clears it deliberately for exactly that reason.
- **Placing an anchor is pointer-only.** There is no keyboard path to putting a
  marker on the model. The modal itself is fine (focus trap, Escape, restore),
  but this is a real accessibility gap, not an oversight — fixing it needs a
  keyboard nudge mode, e.g. arrow keys moving the armed element's anchor.
- The photo persists in `localStorage` under `paintdex-poster-photo-v1`, split
  from the settings key so panning doesn't re-serialise a megabyte per pointer
  event. On a shared device the last photo survives a reload; **Remove** clears
  it.

## Deploying

Vercel builds `main` for production and gives every PR a preview URL — it's a
zero-config static Next.js app. The **core site needs no configuration**;
**accounts** additionally need the three `NEXT_PUBLIC_*` env vars (see
`.env.example`) set in Vercel (Production/Preview/Development) — they're inlined
at build time, so add them and redeploy. Google sign-in also requires the site's
origins in the OAuth client's Authorized JavaScript origins, and the client id
listed under Supabase → Auth → Providers → Google. With the env vars absent, the
build still succeeds and ships the site without accounts.
