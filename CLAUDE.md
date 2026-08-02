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
anonymously through the slug-scoped `get_public_scheme` RPC with a server anon
client (`src/lib/supabase/server.ts`). This was a considered call: it's free within
Vercel's Hobby allowance and the rich preview is the whole point of the feature.
Everything else stays static/client-rendered — don't add more server routes
without the same kind of deliberate reason.

## Commands

```bash
npm ci                 # install (reproducible; use over `npm install`)
npm run dev            # dev server on :3000 (predev builds the indexes first)
npm run build          # production build (prebuild builds the indexes first)
npm run lint           # ESLint
npm run test           # Vitest (colour maths, filtering, scatter layout, URL
                       # codec, scheme io + sync, and a few components)
npm run validate:data  # validate data/paints/*.json against the Zod schema
```

CI (`.github/workflows/ci.yml`, Node 24) runs lint → validate:data → test →
build → `npm audit --audit-level=high` on every PR. Run these before pushing.

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
  below), `paint-facets` (the facet sidebar both paint pages render),
  `active-filters` (the removable chips summarising what's applied, rendered above
  the facet groups on both pages — see "The applied-filter chips" below),
  `alert-banner` (the app's one notice format — see "Notices" below),
  `paint-search-box` + `paint-suggestions` (the browse combobox and the
  autocomplete listbox the homepage search shares — they were two copies of the
  same markup, which is why one ARIA defect had to be fixed twice),
  `back-to-browse` (the paint page's "back" link, which carries the live filters),
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
  it — memoized at module scope in `lib/paints/browse-index.ts`, and seeded from
  that cache **synchronously** via `peekBrowseIndex()`, because awaiting an
  already-resolved promise still costs a render and that render is a loading
  skeleton; successes only, so a failed load stays retryable). Its consumers must
  memoize derived work at module scope too, not in a `useMemo` — see
  `paints/lab-index.ts`: re-deriving Lab for 4,961 records on each mount cost ~10ms,
  more than the JSON parse the fetch cache saves, because a `useMemo` dies with the
  component and a paint-to-paint navigation remounts. Also `use-similar-candidates`
  (the alternatives panel's three derivations of "which paints count" — sidebar
  availability, the re-ranked ΔE list, and the plot's own candidate set — in one
  place with the reasons they differ), `use-scheme-editor` (the visualiser's
  twelve immutable document updates), `use-share-actions` (publish / unpublish /
  copy link, shared by the visualiser's share card and `/my-schemes`;
  `use-scheme-share` is a thin adapter over it for the sync-indicator error
  sink), `use-modal-dialog` (scroll lock, focus trap, Escape, focus restore —
  used by `PosterStudio` and browse's filter drawer),
  and `use-element-width` (a `ResizeObserver` wrapper; the alternatives plot lays
  out in real pixels, so it needs a measured width), and the visualiser's three
  state layers — `use-local-scheme`
  (`localStorage`), `use-scheme-sync` (accounts, reconciliation, autosave,
  tab-focus refetch), `use-scheme-share` (publishing a share link),
  `use-scheme-preset` (loads an example scheme from `?preset=<slug>`) and
  `use-scheme-new` (`?new=1`, a blank scheme). `use-initial-search` snapshots the
  query string at mount, which is what lets those three deep links agree on
  precedence — each strips its own param, so the live URL can't be asked who else
  was there. See "Which saved scheme is this?" below. `use-poster` holds
  the share-image state (photo, framing, anchors) in its own `localStorage` key
  — deliberately *not* in the scheme document, which has to stay portable.
- `src/lib/` — pure logic, node-testable: `color/` (hex↔Lab, CIEDE2000, LCh,
  contrast, colour families), `paints/` (load, filter, types, plus `scatter.ts` —
  the alternatives plot's layout maths — `filter-params.ts`, the URL vocabulary
  shared by both paint pages, `facet-availability.ts`, which owns the
  shared facet-pruning pass, `matchesFacets` — **the** facet predicate, used by
  `filterPaints`, the availability pass and the alternatives panel alike (there
  were three implementations of it) — and `facetLabel`, which cases a facet value
  for display so the visible text and the accessible name can't diverge;
  `active-filters.ts`, which turns either page's param state into the
  removable chip list, and `lab-index.ts`, a module-scope memo attaching Lab to
  the browse index), `scheme/` (bar maths, JSON import/export, types, plus `local-store.ts`,
  the sole owner of the visualiser's `localStorage` document and its **binding**
  — see "Which saved scheme is this?" below — and `sync.ts`, the pure
  reconciliation decisions `planReload`/`planSignInScheme`). Also `supabase/` (browser client +
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
- `data/paints/*.json` — the paint catalogue, one file per brand. **Adding one
  means adding its `import` to `src/lib/paints/load.ts` too**: that file
  hardcodes the list while the build scripts and the validator `readdirSync` the
  directory, so a new brand would reach the browse grid but not
  `generateStaticParams`, and with `dynamicParams = false` every one of its cards
  would be a hard 404. `test/catalogue-sources.test.ts` is the drift guard.
- `scripts/` — `build-browse-index.ts`, `build-similar-index.ts`,
  `validate-data.ts`, `import-source.mjs`. The importer's `mapType` is ordered
  most-specific-first, so an "Enamel Wash" stays a `wash`; its `oil` rule is
  `/\boil/` rather than a substring, or Scale 75's "Soil Works" range imports as
  14 oils.
- `test/` — Vitest suites for the `src/lib` logic (including `scatter.test.ts`,
  which is where the alternatives plot's behaviour is pinned, and
  `filter-params.test.ts`, which pins the URL codec, guards the comma
  assumption and fails if a `PAINT_TYPES` value has no paint behind it, and
  `facet-availability.test.ts`, and `active-filters.test.ts`, which pins what does
  and doesn't count as a chip, and `browse-index.test.ts` and
  `lab-index.test.ts`, which pin the two module-scope caches — including that a
  failed load stays retryable), plus `paints-browser.test.tsx` (browse's
  URL-derived state: the grid is a function of the params, and the controls write
  the params) and `paint-filters-travel.test.tsx`
  (the two fiddly halves of the filter round trip) and
  `scheme-visualiser.test.tsx`, `scheme-preset.test.tsx` and
  `scheme-new.test.tsx`, which cover the places a bug loses user data
  (reconciliation, including every multi-device case; `?preset=` seeding; `?new=1`),
  plus `local-store.test.ts` and `schemes-manager.test.tsx` (a delete has to
  stick), and `home-scheme-carousel.test.tsx`. Also `use-poster.test.tsx` (the
  poster's storage: per-scheme scoping, the legacy-key migration, and a
  `localStorage` that throws on every access, which is Safari with cookies
  blocked), `site-metadata.test.ts` (robots + sitemap — `/scheme/` was disallowed
  and nothing noticed) and `catalogue-sources.test.ts` (the `load.ts` drift
  guard). The environment is `node` by default;
  component tests opt into jsdom with a per-file `@vitest-environment jsdom`
  docblock, so the pure suites stay fast.
- `src/types/gis.d.ts` — minimal typings for the Google Identity Services lib.
- `.env.example` — the three `NEXT_PUBLIC_*` vars accounts need (Supabase URL +
  anon key, Google client id).
- Import alias: `@/*` → `src/*`.

## Conventions & gotchas

- **URL is the source of truth** for filters/search (shareable views) — on
  `/paints` *and* for the alternatives panel on `/paints/[id]`. On these
  statically-generated pages, update the URL with `window.history.replaceState`,
  **not** `router.replace` — `router.replace` is a no-op when the page was
  hard-loaded with query params (e.g. arriving from the homepage search), which
  silently freezes the results. See `src/components/paints-browser.tsx`.
  - `src/lib/paints/filter-params.ts` owns the **whole** vocabulary for both pages
    — `brand`, `range`, `type`, `metal`, `disc`, `family`, `q`, `sort`, `match`,
    `view` — plus `TRAVEL_PARAMS`, the allow-list an internal link may copy.
  - **Filters travel between the two pages, in both directions**, and the rule for
    what goes where generalises the one already stated for the plot's `axisChoice`
    below: **a param that says *which paints you want* is shared and travels; a
    param that says *how to present this page* stays local.**
    - `brand`/`range`/`type`/`metal`/`disc` are `SharedFacets`: applied by both
      pages, and rendered by one component (`paint-facets.tsx`) so the sidebars
      can't drift apart again — they previously disagreed on the heading, on the
      wording of the metallic option, and on which groups existed.
    - `sort` (browse) and `view` (paint page) are presentation and stay put.
    - `q` and `family` (browse-only) and `match` (panel-only) are filters with a
      control on one page: **carried in the URL, never applied by the other.**
  - **`family` is carried but not applied on `/paints/[id]`, deliberately.** Matches
    all cluster around the reference colour, so applying it would be a no-op most of
    the time and would silently empty the list at a family boundary, with no
    checkbox to explain it. Keeping it out of `SimilarParamState` also means an
    arrival from a family-filtered browse still counts as
    `isDefaultSimilarParams`, so the panel skips its restore and keeps the
    fetch-free precomputed first render.
  - **The two pages read the URL differently on purpose.** Browse uses
    `useSearchParams()` inside the `<Suspense>` in `src/app/paints/page.tsx`: it
    never remounts, so a mount-effect read would leave Back/Forward changing the
    URL with nothing re-reading it — and it has already paid the prerender cost.
    The panel reads `window.location` in a mount effect and must keep doing so (see
    "The alternatives plot"). Both write with `history.replaceState`. **The shared
    module is the codec, not the transport.**
  - **"Clear all" clears the controls in front of you** and preserves everything
    else — so browse no longer wipes `sort` (it never counted it as a filter), and
    the panel never destroys an inbound `q`/`family` the user has no way to restore.
  - **`?disc=1` on a paint page forces the client re-rank**, because the precomputed
    `.cache/similar-index.json` is itself built discontinued-free and can't be
    un-filtered client-side. That's why `hasSharedFacet` counts
    `includeDiscontinued` — but only when `true`, or every paint page would lose its
    instant first render.
  - Both sidebar copies are in the DOM at once (the desktop one is `hidden
    md:block`, not unmounted), so anything with an `id` or a radio-group `name`
    needs to differ per copy. `PaintFacets` is a component, so its own `useId`
    handles the radios; the panel's "Minimum match" select is one JSX value
    rendered twice, so it takes an explicit per-copy suffix instead.
  - Comma-joining is only safe because no brand or range name contains a comma —
    `test/filter-params.test.ts` has a drift guard that fails if one ever does.
  - Closed vocabularies are validated on read (`type` against `PAINT_TYPES`,
    `match` against `MATCH_VALUES`, `metal` against `1`/`0`) and unknown values
    dropped. `match` especially: it used to be `Number()`d straight from state,
    and `?match=abc` would have produced `distance < NaN` — an empty list with no
    error. Brands and ranges can't be validated in the pure module (it must not
    import the catalogue), so the component runs `sanitiseSimilarParams` against
    its facet props and heals the URL, otherwise a brand that has left the
    catalogue is an invisible active filter with no checkbox to untick.
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
- **RLS is the security boundary, not the query.** Permissive SELECT policies are
  OR-combined, so a second one widens access rather than narrowing it.
  `listSchemes(userId)` filters on `user_id` for that reason; don't drop it on
  the grounds that RLS "already scopes it". Anything reconciling against that
  list (see the binding, below) would otherwise treat a stranger's row as one of
  the user's own.
- **Published schemes are *unlisted*, not public.** `schemes` has exactly one
  SELECT policy — "select own". There used to be a second, `using (is_public =
  true)`, so the share viewer could read anonymously; because permissive policies
  OR together, that did not mean "readable via its link", it meant **readable by
  anyone who asks** — `select('*')` with the shipped anon key returned every
  published scheme in the database, title, full `data` and `user_id`, no slug
  required. The 40-bit token in `share.ts` is pointless if enumeration isn't
  needed. The only anonymous read is now `public.get_public_scheme(p_slug)`, a
  `security definer` function whose body *is* the security boundary: an equality
  match on `share_slug` plus `is_public`, no pattern match, no ordering, no
  offset, and `user_id` left out of the result. Keep it that narrow.
- **`supabase/schema.sql` is not applied automatically**, and on an existing
  project you do **not** paste the whole file. Write a delta in
  `supabase/migrations/` and run that. The SQL editor wraps a pasted script in
  one transaction, so an unrelated statement failing rolls your change back with
  it, silently — v0.12.0 shipped that way, leaving every share link on
  production broken *and* the policy it was removing still in place. Schema
  changes the code depends on must also run **before** the deploy that needs
  them.
- The canonical site URL (`https://paintdex.app`) is hardcoded in
  `layout.tsx` (`metadataBase`), `robots.ts`, and `sitemap.ts` — update all
  three together if it ever changes.
- Paint hex values are best-effort; treat data edits as data, and run
  `npm run validate:data`.
- The visualiser has **three** deep links, all read from `window.location` in an
  effect (never `useSearchParams`, so the page stays static and needs no Suspense
  boundary), and all strip their param with `history.replaceState` once handled:
  `?scheme=<uuid>` selects one of the signed-in user's saved rows
  (`use-scheme-sync`), `?new=1` starts a blank one (`use-scheme-new`), and
  `?preset=<slug>` loads a curated example (`use-scheme-preset`). See "Example
  schemes" below for why the last one is the most dangerous.
  - **Precedence is `?scheme=` > `?new=1` > `?preset=`**, and each hook checks it
    against `useInitialSearch()` — the query string as it arrived — not the live
    URL. Higher-precedence hooks run first and delete their own param, so by the
    time the next one looks, the evidence is gone: `?new=1&preset=x` loaded the
    preset and `?new=1&scheme=y` created a stray blank row.
  - `+ New scheme` on `/my-schemes` **must** carry `?new=1`. A bare link to
    `/visualiser` opens whatever the editor last held — nothing in the load path
    asks for a blank document — so the button reopened your last scheme.

## Which saved scheme is this? (the binding)

The visualiser's `localStorage` document (`paintdex-scheme-v1`, owned by
`src/lib/scheme/local-store.ts`) carries a **binding**: `{ id, userId,
syncedCanon }` — which saved row it came from, and the canonical form of what we
last successfully wrote to it.

**Identity used to be inferred from content** (`planSignInScheme` compares
canonical JSON, and `title` is part of it), and all three multi-device bugs came
from that one guess: a scheme renamed on another device, or deleted on another
device, stopped matching anything saved, looked like unsaved work, and was
inserted as a **new row**. Don't reintroduce content-matching for a document that
has a binding — `planReload` in `scheme/sync.ts` is the decision, and it's pure
and unit-tested.

Four things hold this together, and removing any one reopens a bug:

- **`syncedCanon` decides who wins**, not a timestamp (`updated_at` is the
  server's clock, ours is not). Equal to the document ⇒ nothing unflushed ⇒ the
  server's copy wins, which is how a remote rename lands. Different ⇒ the editor
  holds edits that never reached Supabase (the autosave is a 1s debounce with no
  `pagehide` flush) ⇒ keep them and let the autosave push them to the same row.
- **A row known to be gone clears the document, not just the binding**
  (`clearBoundScheme`). Clearing the binding alone leaves the content for the
  unbound path to adopt — the resurrection bug, one step further along. The user
  is told, and the most recent survivor is opened; nothing is ever re-created.
- **Writes report whether they matched a row.** `updateScheme`/`renameScheme`/
  `deleteScheme` end in `.select("id")` for that reason. Zero rows is ambiguous —
  it also happens when a session lapses to the anon key, where `auth.uid()` is
  null and RLS hides every row of ours — and **reading the row back cannot settle
  it**, because that select runs under the same policies. So the autosave asks
  `hasLiveSession()` (`supabase/session.ts`, a real `auth.getUser()` round trip,
  not `getSession()`) *first*, and only then reads `schemeExists()` as evidence.
  `/my-schemes` deliberately does **not** blank the local document when a rename
  reports zero rows — same ambiguity, and dropping a card is reversible where
  blanking a document isn't.
- **The binding is dropped on sign-out, but only once `authLoading` is false.**
  `user` is null during every cold load too, and clearing there would take every
  signed-in visitor back to guessing from content. The document itself stays, so
  signed-out editing is unchanged; the accepted trade-off is that sign out → edit
  → sign back in adopts a new row rather than clobbering the old one.

The autosave also waits for `ready`: a save that lands before the row list does
would push a stale copy over a remote rename. Known and out of scope: two
`/visualiser` tabs in the *same* browser still ping-pong writes to one row.

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
  **Don't cap the candidate list before handing it to `layoutScatter`** — doing so
  made `omittedCount` count only what that earlier call dropped, so a phone claimed
  "60 of 120" for a paint with ~350 matches. `findSimilar` sorts everything
  regardless of its `limit`, so passing the whole list costs no extra sort.
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
- **Marks are 24px (`markR` 12) at every width**, so WCAG 2.5.8 is met on pointer
  as well as touch without leaning on its "equivalent control" exception (which the
  List view would otherwise supply). The packer's `minSep` of `2r + 1` is the
  spacing it *aims* for — best-effort, not a guarantee: `relax` can exit at
  `MAX_ITERATIONS`, and `MAX_DISPLACEMENT_R` deliberately leaves dense piles
  overlapped (see the bullet below). What is guaranteed is that the remainder is
  counted and reported in `layout.overlapping`. It costs nothing: `capForArea` still allows
  ~140–170 marks at real desktop widths, above `MAX_POINTS`. And `sizeFor` must
  never floor the width above what it measured — the plot is `overflow-visible`, so
  a floor would push the page into sideways scrolling with nothing to clip it back.
- **The renderer reads the data, not the domain, for anything it says in words.**
  `fitAroundZero` pads *both* ends to the floor when candidates are tightly
  clustered, so a padded bound can describe a range containing no candidates at
  all: three slightly-more-saturated paints give `x.min = -2.5` with nothing muted
  anywhere. Hence the axis-end words gate on `lowEnd.ax < 0` / `highEnd.ax > 0`,
  and the "all within N" caption uses `max(|ax|)`.
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
- **The filters live in the URL and ride the links.** `?view=plot` and every
  filter param are read from `window.location` in one mount effect (never
  `useSearchParams` — this page has no Suspense boundary) and written through one
  writer with `history.replaceState`, never `router.replace`. List rows and plot
  marks append the current filter query to their `/paints/<id>` hrefs, which is
  what makes a filter survive clicking swatch → swatch → swatch — and they carry
  the browse-only params too, so a later "Back to all paints" restores them. `replaceState`
  rather than `pushState`, because the `<Link>` navigation already creates the
  history entry — so Back lands on the previous paint *with its filters* — and
  ticking four facets shouldn't cost four Back presses.
- Two consequences worth knowing. The page is prerendered with default state, so
  the static HTML always has clean hrefs and nothing query-bearing is crawlable.
  And the filters can only land on the *second* client render, so there is one
  frame of the unfiltered list. **Do not "fix" that with a `<Suspense>` boundary
  plus `useSearchParams`**: it works, but it pushes the whole alternatives section
  out of the prerendered HTML on all 4,961 pages, costing every visitor the
  instant fetch-free first render and the crawlable ΔE list, to spare one frame
  for the few arriving with params. The synchronous browse-index cache is what
  keeps that one frame from becoming a skeleton.
- **`axisChoice` deliberately does not persist.** It's derived per paint from the
  reference paint's chroma, so carrying an override to the next paint would force
  a decision made about one colour onto another — and with a quarter of the
  catalogue near-neutral, `axis=hue` on the next paint is exactly the meaningless
  axis `pickScatterAxis` exists to prevent. A filter says *which paints you want*
  and travels; the axis says *how to read one paint* and doesn't.

## The applied-filter chips

`src/lib/paints/active-filters.ts` turns either page's param state into a flat
list of removable chips, rendered by `components/active-filters.tsx` above the
facet groups on both sidebars. They exist because filters persist and travel:
you can arrive with four applied and no way to see them — several groups down a
scrolling sidebar, or behind a closed drawer on a phone.

- **A chip is a second *view* of the filter state, never a second writer.** Every
  `removeChip` branch routes through the `commit`/`toggle`/`toggleFacet` the page
  already owns, so the URL stays the single source of truth and there's one write
  path to audit.
- **What counts as a chip is what counts as a filter**, so the chips, the
  `Filters (N)` badge and "Clear all" can't disagree: `sort` and `view` never
  chip (presentation, and absent from the `*_CLEARABLE` lists), and neither does a
  default — `includeDiscontinued: false` or `minMatch === DEFAULT_MATCH` — or the
  summary would announce filters on an unfiltered page.
- **The panel emits no `q`/`family` chip.** It carries both in the URL but applies
  neither and has no control to restore them, so a chip would offer to remove a
  filter that isn't doing anything.
- **Labels arrive display-ready from the pure module**, not cased by CSS. The
  visible text and the `aria-label` have to be the same string, and CSS can't
  reach an attribute — `first-letter:uppercase` gave "Remove filter: oil" beside a
  chip reading "Oil". Only `type` and `family` are cased (lowercase internal
  vocabulary); brands and ranges carry their own. The chip's `value` keeps the raw
  catalogue string, which is what goes back to the toggle. The facet checkboxes
  had the opposite defect on the same page — a CSS `capitalize`, so the control
  announced "oil" while showing "Oil" — and both now go through the one
  `facetLabel`.
- **One ordered pass, not a splice.** `families` is gated by a flag rather than
  spliced in at `brands.size`, which was correct only while brands happened to be
  emitted first.
- **The mobile copy is suppressed while that page's drawer is open.** Both
  drawers render a second copy of the sidebar and neither is a real modal (no
  `aria-modal`, no focus trap), so leaving the mobile row mounted put two
  identical "Remove filter: X" buttons per chip in the tree and the Tab order.
  Browse and the panel both need this guard; browse shipped without it once.

## Notices

`components/alert-banner.tsx` is the app's one notice format: a red box fixed to
the bottom-centre of the viewport, `role="alert"` for `error` and `role="status"`
for `warning`.

- **It's presentational, deliberately not a toast provider.** Every caller already
  owns the state (`use-scheme-sync` has `notice`, `schemes-manager` has `error`),
  so a context would add runtime plumbing to a static site and buy nothing. The
  accepted trade-off: two banners from two owners would stack, and nothing renders
  two today.
- **Anything the user must act on goes through `notice`, not `syncState`.** The
  sync indicator is a small `aria-live` span that the next keystroke overwrites
  with "Saving…" a second later. The scheme cap used to live there, so a capped
  user clicking "Open in the designer" saw the only explanation flash past —
  with `?preset=` already stripped and no example loaded. `SyncState` has no
  "limit" member any more; use `notice`, which stays until dismissed.
- **Fixed positioning is the point.** The deleted-elsewhere notice used to render
  inside the signed-in-only "My schemes" card — set by a hook that runs whether or
  not that card is on screen, so on a scrolled page it was announced to nobody.
  Where a message is *owned* and where it is *seen* are now separate questions.
- **`tone` buys announcement semantics, not appearance.** Both tones are red on
  purpose; that's the format that was asked for, including for the
  deleted-elsewhere notice. A lower-key look should be a new tone with its own
  colours rather than a reinterpretation of `warning`.
- **Suppress it while a modal is open.** `PosterStudio` is `fixed inset-0 z-50`
  and traps Tab within its own subtree, so a banner rendered after it painted over
  the modal *and* put Dismiss on screen with no keyboard route to it. Raising the
  modal's z-index is not enough — that leaves a tabbable button behind an opaque
  backdrop. `notice` is state, so it reappears on close.
- `test/scheme-visualiser.test.tsx` and `test/schemes-manager.test.tsx` query these
  messages by role (`status` and `alert` respectively), so changing a tone changes
  what those suites find.

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
- **Placing an anchor works from the keyboard.** The canvas is focusable (and
  deliberately not `role="img"` — it's an editing surface): with an element
  armed, Enter drops its marker mid-frame and the arrows walk it, Shift for a
  coarser step. Arming from the Labels list moves focus to the canvas so the
  sequence flows. This was pointer-only, a WCAG 2.1.1 failure on the feature's
  central interaction; don't regress it by making the canvas inert again.
- **Poster state is per scheme.** `paintdex-poster-v1:<scope>` and
  `paintdex-poster-photo-v1:<scope>`, where the scope is the saved row's id, or
  `local` for a document with no row. Two fixed keys meant every scheme shared
  one photo, and `reconcileAnchors` then name-matched the old anchors onto any
  element of the new scheme with a matching name — "Armour" and "Lenses" being
  exactly what people reuse. The unscoped keys are still read for the `local`
  scope, so existing state migrates.
- The photo is split from the settings key so panning doesn't re-serialise a
  megabyte per pointer event. On a shared device the last photo survives a
  reload; **Remove** clears it. A photo too big to store says so rather than
  vanishing at the next reload.

## Deploying

Vercel builds `main` for production and gives every PR a preview URL — it's a
zero-config static Next.js app. **The database is not part of that**:
schema changes are applied by hand in the Supabase SQL editor — as a delta from
`supabase/migrations/`, never by re-pasting `schema.sql`, which is the bootstrap
for a fresh project and will take your change down with it if any of its other
statements fails. A change the code depends on (the `get_public_scheme` RPC,
say) has to be run *before* the deploy that needs it, and confirmed rather than
assumed. The **core site needs no configuration**;
**accounts** additionally need the three `NEXT_PUBLIC_*` env vars (see
`.env.example`) set in Vercel (Production/Preview/Development) — they're inlined
at build time, so add them and redeploy. Google sign-in also requires the site's
origins in the OAuth client's Authorized JavaScript origins, and the client id
listed under Supabase → Auth → Providers → Google. With the env vars absent, the
build still succeeds and ships the site without accounts.
