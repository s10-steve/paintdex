# Paintdex

A website aimed at miniature painting hobbyists. Featuring a database of
miniature paints with hex colour values — searchable, filterable, and able to
find visually similar colours across brands. Plus the ability to design and
visualise a miniature's colour scheme, using the database to pick paints and
preview how they read together. Optional user accounts let you save your
schemes, sync them across devices, and share them by link.

## Features

- **Searchable, filterable database** of 4,900+ paints across 11 brands —
  **Citadel**, **Vallejo**, **AK Interactive**, **The Army Painter**, **Duncan
  Rhodes**, **Green Stuff World**, **Liquitex**, **Mig**, **P3**, **Scale 75**
  and **Tamiya**. Filter by brand, product range, finish type, colour family and
  metallic finish.
- **Perceptual colour matching.** Every paint page lists the closest colours
  ranked by **CIEDE2000** (ΔE) — the industry-standard perceptual colour
  distance — with filters to narrow the matches by brand, product range, finish
  type, metallic finish and whether to include discontinued paints. Those are the
  same filters as the main database page, and they carry between the two. Great
  for comparing paints across brands.
- **Alternatives plot.** The same matches, arranged spatially instead of as a
  ranked list: the paint you're on sits at the centre and every alternative is
  placed by how it differs from it — hue shift across, lightness up. So when you
  want something *slightly* different to the paint you have, you can see which
  way each option moves rather than just how close it is. For greys and other
  near-neutrals, where a hue angle carries no real information, the horizontal
  axis switches to saturation. Marks are keyboard-navigable in ΔE order, and the
  plot always reports what it couldn't fit. **Filters stay applied as you click
  through** — narrow to a brand and you can explore that whole range swatch by
  swatch, and the same filters carry between the full list and an individual
  paint in both directions, so nothing is lost on the round trip. They live in
  the URL, so a filtered view is a shareable link — and because they follow you,
  whatever is currently applied is listed as removable chips at the top of the
  filter panel, so an inherited filter is never invisible.
- **Paint scheme visualiser.** Plan a miniature's colour scheme on
  `/visualiser`: Group your paints by element (armour, robes, lenses, etc) and
  preview every element's colours as aligned, optionally-blended vertical bars.
  Paints carry a role (base, layer, highlight, drybrush, wash, glaze,
  weathering) and a weight; each element's bar is sized by its order —
  largest-area element first. Search the database to add a paint or enter a
  custom name + hex. Schemes autosave in your browser and export/import as JSON
  — or sync to your account when signed in.
- **Example schemes.** The homepage carousels through a few real, recognisable
  schemes — rendered by the same component the visualiser uses, not a mock-up —
  and any of them opens straight into the designer to tweak. Each stores
  catalogue paint ids rather than colours, so a hex correction in the paint data
  updates the examples automatically.
- **Accounts (optional).** Sign in with Google to sync your saved schemes across
  devices; without an account, schemes save to your browser. A **My schemes**
  page (`/my-schemes`) manages your schemes — rename, duplicate, delete and
  share. Edit on your phone and your laptop picks it up when you switch back to
  it; rename or delete on one device and the others follow rather than ending up
  with a second copy. A placeholder **My paints** page (`/my-paints`) marks where
  owned-paint inventories will go.
- **Shareable scheme links.** Publish any saved scheme to an unguessable
  `/scheme/<slug>` link that anyone can open — no login — to see the visual and
  the full paint recipe, with a rich colour preview when pasted on social sites.
  Signed-in viewers can save a copy to their own account.
- **Share images.** Turn a scheme plus a photo of your model into a PNG for
  social media — 4:5 for the feed, 1:1 for a square post, 9:16 for a story. Drop
  a marker on each part of the model and it gets a callout with that element's
  colour ramp and paint names, joined by a leader line. Frame the photo, add your
  handle, and optionally show manufacturers and roles. Signed in, the photo is
  saved to your account, so it follows you between devices and shows on the
  scheme's public share page if you publish it; signed out, it stays in your
  browser and is never uploaded.
- **Light & dark mode**, following your system preference.
- **Responsive** desktop and mobile layouts.
- **Plain-JSON data.** The paint database is plain JSON, one file per brand.
  Intended to be easy to maintain and update. See
  [`data/paints/README.md`](data/paints/README.md) for the schema and
  [`CONTRIBUTING.md`](CONTRIBUTING.md) for the workflow.

## Tech stack

- [Next.js](https://nextjs.org/) (App Router) + TypeScript, statically generated
- [Tailwind CSS](https://tailwindcss.com/) v4
- [next-themes](https://github.com/pacocoursey/next-themes) for theming
- [zod](https://zod.dev/) for data validation
- [Vitest](https://vitest.dev/) for unit tests
- [Supabase](https://supabase.com/) for optional accounts (sign-in + saved
  schemes), called directly from the browser
- Hosted on [Vercel](https://vercel.com/)

The core site (paint database, matching, visualiser) needs no backend — it's
statically generated and the paint data ships in the repo. **Accounts are
optional**: the browser talks to Supabase directly, so the site stays static and
free to host. There are two Supabase projects, production and staging, and
development runs against staging — see
[`supabase/README.md`](supabase/README.md).

## Getting started

The project targets **Node 24** (the version CI runs — see [`.nvmrc`](.nvmrc)).
With [nvm](https://github.com/nvm-sh/nvm) or
[fnm](https://github.com/Schniz/fnm), run `nvm use` to switch to it.

```bash
nvm use              # select Node 24 (optional, if you use nvm/fnm)
npm ci               # clean, reproducible install from package-lock.json
npm run dev          # http://localhost:3000
```

Use `npm ci` for setup: it installs exactly what's in `package-lock.json` and
never rewrites it. Reach for `npm install` only when you're intentionally adding
or updating a dependency (commit the resulting `package.json` **and**
`package-lock.json` together).

### Scripts

| Command                 | Description                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `npm run dev`           | Start the dev server                                                                         |
| `npm run build`         | Production build (statically generates every paint page)                                     |
| `npm run lint`          | ESLint                                                                                       |
| `npm run test`          | Unit and component tests (colour maths, filtering, plot layout, URL state, schemes)          |
| `npm run validate:data` | Validate `data/paints/*.json` against the schema                                             |
| `npm run build:index`   | Precompute the browse index + similar-colour lists (runs automatically before `dev`/`build`) |
| `npm run import:source` | (Re)import paint data from the upstream dataset                                              |

## Deploying

This is a standard Next.js project that deploys with zero configuration —
nothing to configure for the core site, and no server to keep warm since
everything is static. The public instance at
[paintdex.app](https://paintdex.app) is hosted on [Vercel](https://vercel.com/),
but any host that runs Next.js — or serves a static export — works just as well.

## Contributing to the paint data

The paint database lives in [`data/paints/`](data/paints/) as one JSON file per
brand. Edits are just JSON: see [`data/paints/README.md`](data/paints/README.md)
for the schema and [`CONTRIBUTING.md`](CONTRIBUTING.md) for the workflow.
Corrections and additions are welcome via pull request. `npm run validate:data`
checks changes, and CI runs it on every PR.

## Data attribution

The initial paint data was imported from the MIT-licensed
[`Arcturus5404/miniature-paints`](https://github.com/Arcturus5404/miniature-paints)
dataset (© 2022 Rick Fleuren / the Miniature Painter Pro team). Hex values are
best-effort and community-correctable. See
[`data/paints/README.md`](data/paints/README.md) for details.

Paintdex is not affiliated with or endorsed by Games Workshop, Vallejo, AK
Interactive, The Army Painter, Duncan Rhodes, Green Stuff World, Liquitex, AMMO
by Mig Jimenez, Privateer Press, Scale 75, Tamiya, or any paint manufacturer.
Brand and product names are trademarks of their respective owners.

## Roadmap

Ideas for future features.

### Social sharing features

Generating a labelled share image has shipped — see **Share images** above, along
with the two follow-ups that were open here:

- [x] Store the uploaded photo against the scheme (Supabase Storage) rather than
      in the browser only, so it follows you across devices and can appear on
      the public `/scheme/<slug>` page.
- [x] More aspect ratios for the share image — 1:1 for a square feed post, 9:16
      for stories.

Still open:

- [ ] Show the *composed* poster on the share page and in its OpenGraph image,
      rather than the bare photo. The layout maths is client-side Canvas, so this
      needs either a stored render or a server-side redraw — see the `next/og`
      note in `src/lib/scheme/poster-draw.ts` for why Satori can't do it directly.

### Paint database and UI features

- [ ] Add more paint brands and ranges
- [ ] **If the catalogue grows a lot, revisit how the browse index is delivered.**
      `public/browse-index.json` is a single file covering the whole catalogue
      (~1MB uncompressed at 4,961 paints, well compressed on the wire) and it's
      fetched by four views: browse, the homepage search, the visualiser's paint
      picker and the alternatives panel. Both the download and the client-side
      CIEDE2000 re-rank scale linearly with the catalogue, so adding brands in
      bulk is what would make this bite.
      **Not a current problem — Core Web Vitals are fine, and this is a note for
      later, not a todo.** When it does matter, the options are roughly: drop
      fields the client never reads, split the index (by brand, or a small search
      subset plus on-demand detail), or move the parse and the ΔE pass into a Web
      Worker so they stop touching the main thread. Each trades away some of the
      current "one static file, no backend" simplicity, so it wants measuring
      first. Per-page derived work is already memoized at module scope
      (`src/lib/paints/browse-index.ts`, `lab-index.ts`) — that part is done.
- [ ] Interactive colour wheel (à la
      [Canva's colour wheel](https://www.canva.com/colors/color-wheel/)) that
      suggests matching paints based on colours you pick. Would be useful if
      you're looking to design custom schemes with colours that work well
      together. Could also be a different way to visualise colour schemes in
      `/visualise`. The LCh helpers in `src/lib/color` (`labToLch`, `hueDelta`)
      are the reusable part of the alternatives plot for this — but note the wheel
      wants *absolute* polar hue/chroma over the whole catalogue, not one paint's
      ΔE neighbourhood, so it needs its own scales rather than `scatter.ts`'s.
- [x] Hue and luminance relationships between paints — shipped as the
      **alternatives plot** on each paint page (see Features above). Still open:
      the same treatment for the whole catalogue on `/paints`, which needs a
      different axis model (absolute rather than relative to one paint) and has to
      cope with ~4,900 points instead of ~120.

### My paints feature

- [ ] Save the paints you own
- [ ] Paint schemes can suggest only paints from your collection
- [ ] Wishlist for paints you don't own yet but want to buy

## License

[MIT](LICENSE)
