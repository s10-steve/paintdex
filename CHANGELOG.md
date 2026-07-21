# Changelog

All notable changes to Paintdex are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-07-21

### Added

- Signed-out prompt in the visualiser explaining that signing in saves your
  schemes to your account (shown only when accounts are configured).
- A confirmation before the visualiser's Reset button clears a non-empty scheme.

### Changed

- **Scheme visualiser element sizing is now order-based.** The per-element size
  sliders are gone; each element's bar is sized by its position (largest-area
  element first) and elements can be reordered with ↑↓ buttons. Order elements by
  how much of the model they cover (armour first, lenses last). Exported schemes
  no longer include an element `weight`; older exports still import (the key is
  ignored). The per-paint weight slider is unchanged.
- The blend toggle's **Banded** mode now also flattens wash/glaze/weathering
  overlays to a thin line, matching the ramp's hard steps; **Blended** keeps the
  feathered bands. Weathering overlays are also less transparent.
- Visualiser left column reordered (explanation → "My schemes" → scheme title →
  elements) and the how-to rewritten as short paragraphs.
- **Sign in with Google** button now follows dark mode (re-rendered with a
  matching theme), and uses a shorter "Sign in" label on mobile so it fits the
  phone header.
- On mobile, the header nav collapses into a menu, keeping the header within the
  viewport.
- README setup (Supabase/Vercel/OAuth) reframed from owner voice to generic "run
  your own instance" steps ahead of open-sourcing.

### Removed

- Site-wide "work in progress" banner.
- The manual light/dark toggle — the theme now follows the system setting only.

### Fixed

- The "Sign in with Google" button rendered light/white and illegible in dark
  mode.
- The sign-in button made the header wider than the viewport on mobile.
- Search inputs auto-zoomed on iOS Safari (font-size below 16px); they now use
  16px on mobile.

## [0.3.0] - 2026-07-20

### Added

- **Optional user accounts**, powered by Supabase called **directly from the
  browser** — there are still no Next.js API routes and no server components
  reading request-time data, so the site stays static and free to host. Access
  is enforced by Row-Level Security (`supabase/schema.sql`), so the public
  `NEXT_PUBLIC_*` keys are safe to ship. With the env vars unset, the site
  behaves exactly as before (accounts hide themselves; the visualiser stays
  `localStorage`-only).
- **Sign in with Google** via Google Identity Services (`signInWithIdToken`).
  Because auth runs from our own origin, Google's consent screen is branded to
  `paintdex.app` rather than the Supabase callback domain — no paid Supabase
  custom domain needed.
- **Saved schemes synced to your account**: a "My schemes" picker
  (new / select / delete) in the visualiser, debounced autosave, and first-login
  adoption of the scheme built while signed out. The signed-out path is
  unchanged.
- **Brand logo** (`public/logo.svg`) — a colour-wheel "lens" mark — shown in the
  header, plus a 1200×630 social-share image (`public/og-image.png`) wired into
  OpenGraph/Twitter metadata.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
  `NEXT_PUBLIC_GOOGLE_CLIENT_ID` environment variables (documented in
  `.env.example`).

### Changed

- Extracted `toExportShape()` in `src/lib/scheme/io.ts`, shared by the JSON
  export and the account-sync path (stored as `jsonb`, no stringify round trip).
- The header brand mark is now the SVG logo instead of a CSS conic gradient.

## [0.2.0] - 2026-07-19

First public release — Paintdex is now live at
[paintdex.app](https://paintdex.app).

### Added

- **Paint scheme visualiser** (`/visualiser`): plan a miniature's paint scheme
  by grouping paints into elements (armour, robes, lenses…) and see every
  element's colours as aligned vertical bars, so the whole scheme reads
  together. Each paint carries a role — base/layer/highlight build a weighted
  tonal ramp, while wash/glaze/weathering render as translucent overlay passes —
  plus a weight; each element has a weight that sets its bar width. A blend
  toggle switches the bars between smooth gradients and hard bands. Add paints by
  searching the browse index (reusing `filterPaints`) or enter a custom name +
  hex for anything not in the database. Schemes autosave to `localStorage` and
  can be exported/imported as JSON (no account needed). Pure bar and
  import/export logic lives in `src/lib/scheme/` with unit tests.
- Eight more paint brands imported from the upstream dataset — The Army Painter,
  Duncan Rhodes, Green Stuff World, Liquitex, Mig, P3, Scale 75 and Tamiya —
  taking the catalogue from ~2,700 to 4,940 paints across 11 brands.
- Metallic-finish flag (`metallic`) on paint records, independent of `type`
  since brands classify metallics inconsistently. Seeded from `type: "metallic"`
  plus a vetted set of Citadel metallics, shown as a badge on paint cards and
  detail pages, and community-correctable like hex values.
- Metallic/non-metallic filter on the `/paints` browse page (encoded in the URL).
- Filters on each paint's similar-colour list, reusing the browse page's
  checkbox facets: multi-select Brand, Type and Range, plus a Metallic /
  Non-metallic finish control. Applying a filter re-ranks the whole catalogue
  client-side (reusing the browse index) rather than narrowing the precomputed
  top matches, so e.g. filtering Auric Armour Gold's matches to a single brand
  surfaces real matches from deeper in the catalogue instead of an empty list.
  This replaces the old "other brands only" toggle, whose precomputed cross-brand
  list is no longer built — halving the similar-colour index cache.
- A "Minimum match" control on the similar-colour list that hides looser matches
  by ΔE band (Identical → Show all), defaulting to "Close or better" so the
  least-useful matches are trimmed out of the box.
- Interactive colour-wheel idea added to the roadmap.
- **Public launch on Vercel** at [paintdex.app](https://paintdex.app), with a
  `robots.txt` and a `sitemap.xml` covering every paint page (generated from the
  catalogue). Vercel Analytics and Speed Insights are wired in for traffic and
  real-world performance monitoring.
- Site-wide "work in progress" banner, and a homepage callout giving the paint
  scheme visualiser top billing.

### Changed

- Canonical, social-share and sitemap URLs now point at the production domain
  (`paintdex.app`).
- The visualiser now starts from an empty scheme and Reset clears it, instead of
  seeding a built-in example scheme.
- Homepage copy refreshed for launch (dropped the open-source framing while the
  repository is private).

- The `/paints` browse dataset is now served as a cacheable static asset
  (`public/browse-index.json`, precomputed with lightness + colour family) and
  fetched at runtime instead of being bundled into the client JS, which is
  preloaded to avoid a first-load waterfall. The largest client chunk drops from
  ~852 KB to ~222 KB and the JS no longer grows with the catalogue.
- Similar-colour lists are precomputed once (sharded across CPU cores) into
  `.cache/similar-index.json` and read as an O(1) lookup per paint page; the
  static-generation phase drops from ~32 s to ~17 s and no longer scales
  quadratically with the catalogue.
- The `import:source` script now treats a literal `"null"` code cell as no code.
- Browse-page filters now hide options that would return nothing given the other
  active filters (e.g. selecting Vallejo removes Citadel-only types like
  `contrast` and narrows the Range list). This generalises the previous
  brand-scoped Range list to every facet, and matches the similar-colour list.

### Fixed

- Browse search and filters no longer get stuck when the page is opened directly
  with query params (e.g. following the homepage search to `/paints?q=…`). On a
  statically-generated page `router.replace` was a no-op in that case, so the
  URL — and the results — never updated; URL writes now go through the History
  API, which syncs reliably.
- Search debounce race: a facet toggled mid-debounce is no longer dropped, and
  the timer is cancelled on clear-all and unmount.
- URL filter params (`type`, `sort`) are validated against the known sets
  instead of being cast blindly.
- `PaintWithLab.family` is now typed as `ColourFamily` rather than `string`.
- The precomputed similar-colour lists now match `findSimilar` exactly:
  `getAllPaints()` is ordered name-A–Z-within-brand (the same order the build
  scripts rank in), so paints sharing a hex break equal-distance ties
  identically instead of diverging on which fills the last slot.
- Paint detail pages are pinned to static rendering (`dynamicParams = false`),
  so an unknown id 404s at build instead of trying to read the build-only
  `.cache/similar-index.json` at request time.

### Removed

- Unused `getRanges()` helper from `src/lib/paints/load.ts`.

## [0.1.0] - 2026-07-18

First release: the paint database and colour matching.

### Added

- Searchable, filterable database of 2,600+ paints across Citadel, Vallejo and
  AK Interactive, with every filter encoded in the URL for shareable views.
- Perceptual colour matching on each paint page, ranking the closest colours by
  CIEDE2000 (ΔE) in CIE-Lab space, with an option to see other brands only.
- Filtering and sorting by brand, product range, finish type and colour family.
- Pure, dependency-free colour library (hex parsing, sRGB→XYZ→Lab conversion,
  CIEDE2000, WCAG luminance/contrast, coarse hue-family classification).
- Light and dark mode following the system preference, with a manual toggle.
- Responsive desktop and mobile layouts.
- Open, community-maintained paint data as plain JSON in `data/paints/`, with a
  Zod schema, a `validate:data` script enforcing unique ids and identities, and
  an `import:source` script to (re)import from the upstream dataset.
- Unit tests for the colour maths and filtering logic.
- CI pipeline running lint, data validation, tests and build on every PR.
