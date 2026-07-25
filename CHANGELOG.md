# Changelog

All notable changes to Paintdex are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`drybrush` role** in the scheme visualiser. It reads as a highlight pass —
  same ramp behaviour and share of the bar — but is its own role so a recipe can
  say which technique was used.
- First **component tests** (`test/scheme-visualiser.test.tsx`, jsdom +
  `@testing-library/react`), covering the sign-in reconciliation wiring — the one
  path where a bug silently loses a user's work. The suite still runs in node by
  default; component tests opt into jsdom per file.

### Changed

- **The visualiser now defaults to the banded (unblended) view**, which shows
  each paint as a discrete step and reads as a recipe rather than a gradient. The
  toggle still switches to the blended view, and the choice is remembered. The
  public shared-scheme viewer is banded to match.
- **Overlay bands are easier to read.** In the banded view every overlay
  (wash/glaze/weathering) is a 14px band rather than 8px. Weathering also takes
  the same share of the bar as a wash or glaze when blended, instead of being
  narrower than both.
- **Weathering keeps its own colour.** Overlays were all composited with
  `multiply`, which models a translucent ink tinted by the colour beneath. That's
  right for a wash or glaze, but wrong for weathering effects — opaque pigments
  sitting *on* the surface. Multiplying Nihilakh Oxide (`#66B39A`) over brass
  produced `#434530`, a brown-green nothing like the paint. Weathering now
  composites normally at 80% opacity, so it reads as itself while still letting a
  little of the base through; washes and glazes keep multiplying as before.
- `scheme-visualiser.tsx` split up (1,175 → 465 lines): its presentational pieces
  moved to `src/components/scheme/`, and its state layers to hooks in
  `src/hooks/` — `use-local-scheme`, `use-scheme-sync`, `use-scheme-share`. The
  browse-index fetch, previously duplicated across four components, is now the
  shared `useBrowseIndex()` hook, and the role pill is shared with the public
  viewer instead of being duplicated there.

### Fixed

- An overlay band landing at the very top or bottom of a bar is no longer
  half-clipped by the bar's rounded edge.

## [0.6.0] - 2026-07-22

### Added

- **Public, shareable scheme links.** Publish any saved scheme to an unguessable
  `/scheme/<slug>` link that anyone can open — no login — to see the colour-bar
  visualisation and the full paint recipe (each element's paints with name,
  brand · range, hex and role). This is the one deliberately **server-rendered**
  route: it emits per-scheme OpenGraph title/description and a generated
  colour-bar preview image (`opengraph-image.tsx`), so links pasted on
  Reddit/Instagram get a rich preview. It reads the scheme anonymously via Row-
  Level Security (`is_public = true`) with a server anon client
  (`src/lib/supabase/server.ts`); everything else stays static.
- **"Save a copy"** on a shared scheme: signed-in viewers can duplicate someone
  else's shared scheme into their own account and open it in the visualiser.
- **"My schemes" page (`/my-schemes`).** A dedicated home for managing saved
  schemes — rename, duplicate, delete, edit (opens in the visualiser), and share
  (publish / copy link) — reachable from the header. Replaces managing schemes
  through the cramped visualiser dropdown.
- **"My paints" page (`/my-paints`).** A placeholder for the upcoming
  owned-paints feature, so the profile area has an obvious home for it.
- **Profile links in the header**, shown only when signed in and grouped on the
  right beside the account icon (collapsing into the mobile menu), so they read
  as signed-in features.
- Pure share-slug helpers (`src/lib/scheme/share.ts`) with unit tests.

### Changed

- **Visualiser scheme controls consolidated.** The inline picker and the share
  controls are now a single card, and the picker's Delete button is gone —
  deleting a scheme is done from the "My schemes" page. The picker still
  new/selects and autosaves as before.
- The header account menu is now **auth-only** (email + Sign out); scheme
  management moved to the header profile links and the "My schemes" page.
- Extracted the bar visualisation and its hover/tooltip into a shared
  `scheme-bars` component (`Bar` + `useBarHover`), reused by the visualiser
  editor and the new read-only shared-scheme view.

## [0.5.0] - 2026-07-21

### Added

- **Autocomplete suggestions on the paint database search.** Typing in the
  `/paints` search box now shows a dropdown of matching paints (swatch, name,
  brand · range, hex); picking one jumps to that paint's page, with arrow-key
  navigation and combobox accessibility. Pressing Enter with nothing highlighted
  still filters the results grid as before. Reuses the same `filterPaints`
  matcher the scheme visualiser's add-paint search already uses.
- **SEO: JSON-LD structured data.** A `WebSite` + `SearchAction` (enabling a
  sitelinks search box pointing at `/paints`) and `Organization` on the home
  page, and `Product` + `BreadcrumbList` on each paint detail page, via a small
  `JsonLd` helper component.
- **SEO: canonical URLs** on every route. The browse page canonicalises to
  `/paints` so its `?q=`/filter query permutations don't fragment as duplicate
  content. Paint pages also get per-paint OpenGraph title/description.

### Changed

- The home page now sets its own title/description metadata instead of inheriting
  the site default, and sitemap entries carry `changeFrequency` hints.

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
