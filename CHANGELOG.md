# Changelog

All notable changes to Paintdex are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.12.0] - 2026-08-02

A code-review pass over everything added since accounts landed, rather than a
feature release. Most of it is things that were quietly wrong.

### Security

- **Schemes you share by link are no longer readable by anyone who asks.**
  Publishing a scheme is meant to make it reachable *by its link* — the link
  carries a long random token precisely so nobody can guess it. In fact the
  database rule behind it said "readable by anyone", full stop: with the public
  key the site ships, it was possible to ask for every published scheme at once
  and get back each one's title, full contents and the id of the account that
  owned it, without needing any link. A shared scheme is now genuinely unlisted —
  reachable only by its own slug, and the owner's account id is no longer part of
  what a viewer receives. **This needs a database change applied before the
  update goes live** (see `supabase/schema.sql`).

### Added

- **You can place a photo label without a mouse.** The share-image studio let you
  choose an element from the keyboard but not say where on the model it points,
  which made the feature's central step mouse-only. With an element armed, Enter
  now drops its marker in the middle of the photo and the arrow keys move it —
  hold Shift to move further.

### Fixed

- **Importing a scheme file no longer overwrites the scheme you had saved.** When
  signed in, importing a `.json` replaced whatever scheme was open — including in
  your account — with no warning and no way back. Import now saves the file as a
  *new* scheme, leaving the one you were on untouched. **Reset** behaved the same
  way and is fixed the same way.
- **Switching schemes mid-save no longer copies one over another.** If you
  changed to a different scheme in the second or so after an edit, the save
  landing afterwards could attach your new scheme's contents to the old one's
  name — and the next reload would write it over the top.
- **A corrupted browser copy of a scheme can no longer wipe the saved one.** If
  the scheme stored in your browser became unreadable, the editor fell back to a
  blank one and then saved *that* over your account's copy at the next sign-in.
- **Shared links now show a preview on social media.** Facebook and Twitter check
  a site's `robots.txt` before fetching a page, and ours told them not to look at
  shared schemes — so the preview image and description that the share page
  exists to provide were never fetched. Shared links still stay out of search
  results.
- **Sharing a scheme deleted on another device now says so**, instead of
  reporting success and handing you a link that leads nowhere.
- **The paint search box no longer shows one thing while the results show
  another.** Going back to a previous search left the box holding the old text.
- **The search suggestions are readable by a screen reader.** Arrowing down the
  list announced nothing at all, on both the homepage and the paints page.
- **⌘-click on "Back to all paints" opens a new tab again**, rather than
  navigating the current one.
- **The filters drawer on a phone behaves like a proper dialog** — Escape closes
  it, the keyboard stays inside it while it's open, and focus returns to the
  button that opened it.
- **Each scheme keeps its own share photo.** Every scheme shared a single photo
  and set of labels, so opening the studio for one scheme showed another's photo,
  with labels landing wherever an element of the same name — "Armour", "Lenses" —
  had been placed on a different model.
- **A photo too large to store now tells you**, instead of disappearing at the
  next reload. Labels pushed off the edge of the frame can also be dragged back
  in rather than being stranded.
- **The "Download PNG" button reports a failure** rather than silently doing
  nothing.
- **Reaching the saved-scheme limit is explained properly.** The message appeared
  in a spot that the next keystroke overwrote a second later, which was most of
  the time.
- Filters could be lost by ticking a facet at the moment a search was being
  applied, and a very long scheme name could be rejected by the server with no
  explanation. Both fixed.

### Changed

- **The paints list is faster to type in.** Every keystroke re-filtered and
  re-sorted all 5,011 paints twice over; it now does that only when the query
  actually changes. The paint database is also downloaded once per visit rather
  than twice.
- The filter checkboxes now read the same aloud as they look on screen — "Oil",
  not "oil".

## [0.11.0] - 2026-08-01

### Added

- **The filters you have applied are now listed at the top of the filter panel.**
  Now that filters follow you from the paint list into a paint page and back, you
  could arrive somewhere with four of them already applied and no way to see what
  they were — the ticked boxes could be several groups down a scrolling sidebar,
  and on a phone they were behind a closed **Filters** drawer. Each applied filter
  is now a chip at the top of the panel, next to **Clear all**, and clicking one
  removes just that filter. On a phone the same list sits above the results, so
  you can see and undo a filter without opening the drawer at all.

### Changed

- **The alternatives plot's vertical axis is labelled.** It now says "Lightness"
  down the side, with a swatch of the darkest and the lightest match at each end —
  the same treatment the horizontal axis already had. Previously the only mention
  of what "up" meant was tucked into the caption underneath.
- **Alternative paint cards give the name the full width.** The match badge
  ("Very close ΔE 2.7") now sits below the name alongside the brand and range,
  rather than beside it. Sharing a line with the badge left long names — "Xb-518
  Zashchitniy Zeleno (russian Postwar Green)" and the like — wrapping to five or
  six words-per-line, with a squashed badge next to them.

### Fixed

- **Notices about your saved schemes are no longer easy to miss.** "That scheme
  was deleted on another device" appeared inside the **My schemes** panel, which
  is often scrolled off the screen — so the thing that explained why your scheme
  had changed was frequently invisible. Messages like this now appear in a box at
  the bottom of the screen, wherever you happen to be on the page, and can be
  dismissed. The same format is used for failures on **My schemes**.

## [0.10.1] - 2026-08-01

### Fixed

- **Deleting a saved scheme now sticks.** With the same account open on two
  devices, deleting a scheme on one and refreshing the other quietly re-created
  it — and refreshing the first brought it back, so a scheme could only really be
  deleted when nothing else had it open. Each device now knows *which* saved
  scheme it is holding rather than trying to recognise it by its contents, so a
  deletion made elsewhere is reported and the most recent remaining scheme opens
  instead. Nothing is ever re-created.
- **Renaming a scheme no longer duplicates it.** Renaming on one device while
  another had it open produced a second copy, and the other device would then
  write its old name back over yours. The new name now lands everywhere, and
  there is still exactly one scheme.
- **+ New scheme starts a new scheme.** On **My schemes** it opened whichever
  scheme you last had in the designer.
- **Editing a scheme deleted on another device no longer reports "Saved" into
  nothing.** It now tells you what happened and moves you to a scheme that still
  exists — and, importantly, it makes sure the scheme really is gone before
  saying so, rather than mistaking an expired sign-in for a deletion.
- **Your scheme list could include other people's published schemes.** Anything
  shared by link was visible in every signed-in user's **My schemes** and in the
  designer's scheme picker. Only ever schemes their owners had deliberately
  published, and never editable by anyone else — but they were never meant to
  appear there.
- Unsaved edits are no longer at risk when a scheme changes elsewhere: if the
  editor is holding changes that haven't reached the server yet, they're kept and
  saved to the same scheme rather than being replaced by the stored copy.

### Changed

- **Schemes refresh when you come back to the tab.** A rename or delete made on
  your phone shows up on your laptop when you switch back to it, instead of only
  after a manual reload.

## [0.10.0] - 2026-07-28

### Added

- **The alternatives plot.** Every paint page can now show its matches arranged
  in space rather than as a ranked list: the paint you're on sits at the centre,
  and each alternative is placed by how it differs from it — hue shift across,
  lightness up. When you want something *slightly* different to the paint in your
  hand, that answers "which way does this one move?" instead of only "how close
  is it?". Greys and other near-neutrals get a saturation axis instead, because
  below a certain saturation a hue angle is noise rather than information — and
  that covers about a quarter of the catalogue, including paints like Abaddon
  Black and Administratum Grey.

  The marks are keyboard-navigable in the same ΔE order as the list, each
  announcing its position, so the axes aren't a visual-only channel. Where too
  many matches would tile into an unreadable block — on a phone especially, or
  for a paint with hundreds of near matches — the plot drops the furthest and
  says how many it left out, and flags any marks it had to nudge apart to keep
  them clickable. The ranked list is still the default view; the toggle sits
  above the matches and rides along in the URL.

- **Filters that follow you.** Narrow the matches to a brand and the filter stays
  applied as you click through — swatch to swatch to swatch — so you can explore
  one manufacturer's range by walking it. The same filters now carry between the
  full paint list and an individual paint page **in both directions**, losing
  nothing on the round trip: filter on `/paints`, click into a paint, keep
  filtering there, and **Back to all paints** returns you to the list exactly as
  you left it. Everything lives in the URL, so any filtered view is a link you
  can share or bookmark.

- **Include discontinued paints** is now available on paint pages too, not just
  browse — useful when you're matching a paint you already own that is no longer
  made, and it means the box you ticked on browse keeps doing something after you
  click into a colour.

### Changed

- **Alternative paint cards are bigger and no longer truncate.** Names and the
  brand · range line wrap to a second line instead of being cut off, which was
  happening on well over a quarter of the catalogue; the swatches are larger too.
- **One filter sidebar, used by both pages.** Browse and the paint pages had
  drifted apart — different heading, different wording for the metallic option,
  different groups. They now render the same component, so they can't disagree
  again.
- **Browse's filter sidebar appears immediately** instead of waiting for the
  ~1MB catalogue file to download and parse.
- **Clear all clears the filters in front of you** and nothing else: browse no
  longer resets your sort order, and a paint page no longer discards a search or
  colour family you arrived with and have no control to restore.

### Fixed

- On mobile, the filter drawer and the desktop sidebar shared one radio group and
  one form label, so changing the finish in the drawer silently moved the hidden
  desktop control, and the **Minimum match** label pointed at the wrong menu.
- A brand that had been renamed or removed from the catalogue acted as an
  invisible filter if it was still in a URL — an empty grid with no checkbox to
  untick it. Unknown brands, ranges and filter values are now dropped on read and
  cleaned out of the address bar.
- Moving between paint pages re-downloaded and re-processed the whole catalogue
  each time. It's now computed once and reused, taking roughly 20ms of blocking
  work off every hop on a mid-range phone.

## [0.9.0] - 2026-07-26

### Added

- **Example schemes on the homepage.** A carousel of five real, fully worked
  schemes — **Ultramarines**, **Death Guard**, **Blood Angels**, **Necrons** and
  **Death Guard (30K)** — replaces the decorative colour bars that used to sit
  beside the visualiser pitch. Between them they cover 38 elements and 148 paints
  across four manufacturers, most elements running a full base → shade → layer →
  highlight recipe with weathering over the top. They're drawn by the same
  component the visualiser itself uses, so what you see on the homepage is genuine
  output: weighted tonal ramps, translucent wash and weathering bands, and each
  element's bar sized by its order. Hover a band to name the paint, exactly as in
  the app.

  Each example opens straight into the designer via `/visualiser?preset=<slug>`,
  so you can start from a finished scheme instead of a blank canvas. Signed in,
  the example is added as a **new** saved scheme and whatever you were working on
  stays untouched; signed out, you're asked first, because your browser holds the
  only copy.

  Examples store **catalogue paint ids and a role, never hex values**, so
  correcting a colour in `data/paints/` updates the homepage automatically. A test
  fails the build if an example ever references a paint that has been renamed or
  removed.

  The carousel rotates on its own but stays out of your way: it stops for
  `prefers-reduced-motion`, pauses on hover and on keyboard focus, stops
  permanently once you use the arrows or dots, and has an explicit pause button.

- **A share-image section on the homepage**, showing a real export from the studio
  rather than a mock-up, paired with the **Death Guard (30K)** example — the
  scheme that actually painted the model pictured. The feature previously had no
  mention anywhere outside the visualiser, so nobody who hadn't already built a
  scheme knew it existed.

### Changed

- The footer disclaimer now covers **game publishers** as well as paint
  manufacturers, and notes that the example schemes are unofficial fan recipes.

## [0.8.0] - 2026-07-25

### Added

- **Share images.** **Create shareable image** in the visualiser opens a studio
  that turns a scheme plus one photo of your model into a 4:5 PNG
  (2160×2700) for social media. Drop a marker on each part of the model and
  it gets a callout with that element's banded ramp and its paint names, joined
  by a leader line — the labelled-photo format painters post on Instagram,
  generated from the scheme you already built. Pan and zoom to frame the shot,
  add your handle, and optionally show each paint's manufacturer and role. Every
  image carries a quiet "generated with paintdex.app" credit.

  **Your photo never leaves the browser.** It is downscaled onto a canvas and
  rendered client-side — there is no upload and no new server route, so the site
  stays static. The photo and your marker positions are kept in this browser
  only (`localStorage`); syncing them to your account is a later phase.

  Markers are stored against the *photo*, not the poster, so they stay on the
  model when you re-frame it. When callouts can't all fit, the layout degrades
  predictably — tighter spacing, then truncated paint lists with `+N more`, then
  dropping the last elements — and always tells you what it left out.

### Changed

- **The visualiser's share actions are now a pair of buttons in their own box**,
  above the scheme editor: **Create shareable image** and **Create shareable
  link** (previously "Create share link", tucked into the signed-in scheme
  picker). Publish status and the copy-link control sit underneath them. The
  image button works signed out; the link button explains that it needs an
  account and a saved scheme.
- The paint "brand · range" label (and the **Custom colour** fallback for a
  colour you mixed yourself) is now a shared helper rather than being written
  out separately in the visualiser's editor rows and the public scheme viewer.

## [0.7.0] - 2026-07-25

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
