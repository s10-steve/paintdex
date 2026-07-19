# Paintdex

An open, community-maintained database of miniature paints with hex colour
values — searchable, filterable, and able to find visually similar colours
across brands.

> **Status:** covers the paint database, perceptual colour matching and a paint
> scheme visualiser. User accounts, owned-paint inventories, and shareable
> recipe links are planned (see [Roadmap](#roadmap)).

## Features

- **Searchable, filterable database** of 4,900+ paints across 11 brands —
  **Citadel**, **Vallejo**, **AK Interactive**, **The Army Painter**, **Duncan
  Rhodes**, **Green Stuff World**, **Liquitex**, **Mig**, **P3**, **Scale 75**
  and **Tamiya**. Filter by brand, product range, finish type, colour family and
  metallic finish — every filter is encoded in the URL, so any view is
  shareable.
- **Perceptual colour matching.** Every paint page lists the closest colours
  ranked by **CIEDE2000** (ΔE) — the industry-standard perceptual colour
  distance — with filters to narrow the matches by brand or type.
- **Paint scheme visualiser.** Plan a miniature's colour scheme on `/visualiser`:
  group your paints by element (armour, robes, lenses…) and preview every
  element's colours as aligned, optionally-blended vertical bars, so the whole
  model reads together. Paints carry a role (base, layer, highlight, wash, glaze,
  weathering) and a weight; elements have a weight that sets their bar width.
  Search the database to add a paint or enter a custom name + hex. Schemes
  autosave in your browser and export/import as JSON.
- **Light & dark mode**, following your system preference with a manual toggle.
- **Responsive** desktop and mobile layouts.
- **Open data.** The paint database is plain JSON in this repo, so anyone can
  fix a colour or add a paint via a pull request.

## Tech stack

- [Next.js](https://nextjs.org/) (App Router) + TypeScript, statically generated
- [Tailwind CSS](https://tailwindcss.com/) v4
- [next-themes](https://github.com/pacocoursey/next-themes) for theming
- [zod](https://zod.dev/) for data validation
- [Vitest](https://vitest.dev/) for unit tests

No database or backend is required — the site is fully static.

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

### Scripts

| Command                 | Description                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `npm run dev`           | Start the dev server                                                                         |
| `npm run build`         | Production build (statically generates every paint page)                                     |
| `npm run lint`          | ESLint                                                                                       |
| `npm run test`          | Unit tests (colour maths + filtering)                                                        |
| `npm run validate:data` | Validate `data/paints/*.json` against the schema                                             |
| `npm run build:index`   | Precompute the browse index + similar-colour lists (runs automatically before `dev`/`build`) |
| `npm run import:source` | (Re)import paint data from the upstream dataset                                              |

## Deploying

The app is a standard Next.js project and deploys to
[Vercel](https://vercel.com/) with zero configuration — import the repo and
Vercel handles the build. Because everything is static, the free Hobby tier is
plenty and there is nothing to keep warm.

## Contributing to the paint data

The paint database lives in [`data/paints/`](data/paints/) as one JSON file per
brand. Spotted a wrong hex value or a missing paint? Edits are just JSON — see
[`data/paints/README.md`](data/paints/README.md) for the schema and
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the workflow. `npm run validate:data`
checks your changes, and CI runs it on every PR.

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

### Minor UI tweaks

- [ ] The search box currently says "search by name, brand, range or code" but
      I'm pretty sure it only matches name and code? That's fine, filters work
      for the rest but please update the search text to be accurate.
- [ ] Autocomplete search suggestions (e.g. typing "abaddon" should suggest
      "Abaddon Black" and "Abaddon Grey")
- [x] On the paint page, add a filter for the match grouping. By default have it
      only show matches of 'close' or better.

### Paint database and UI features

- [x] Paint database: search, filter, colour families
- [x] Similar-colour matching (CIEDE2000)
- [x] Paint scheme visualiser (`/visualiser`): group paints by element and
      preview the whole scheme's colours as blended vertical bars, with roles,
      per-paint and per-element weights, and JSON export/import
- [x] Light/dark + responsive
- [ ] Add URL links to the paint database for the official product pages (e.g.
      Citadel paints link to the Games Workshop site). Would help ensure
      correctness and tie in with adding new ranges and paints.
- [ ] Add more paint brands and ranges
- [x] Light/dark follows the system by default, with a manual toggle to override
- [x] Add a flag for metallic paints, and a filter for metallic vs non-metallic
      (e.g Auric Armour Gold is listed as similar to yellows and golds, but
      really they're completely different use cases)
- [x] Add filters to the similar-colour list (e.g. only show paints from a
      certain brand, or only show paints of a certain type)
- [ ] Interactive colour wheel (à la
      [Canva's colour wheel](https://www.canva.com/colors/color-wheel/)) that
      suggests matching paints based on the colours you pick

### Real live website

- [ ] Deploy to Vercel, make it an actual live website, and get some users to
      try it out. The paint data is already in the repo, so the site can be
      deployed without any backend or database.

### User accounts & recipe features

- [ ] User accounts & login
- [ ] Save the paints you own
- [ ] Painting recipes with colour-coded guide text
- [ ] Public, shareable recipe links (no login to view) with suggestions from
      paints you own

### Known issues & fixes

Follow-ups from the initial code review, to address as the catalogue grows:

- [x] **Browse-page bundle size.** The paint dataset is now precomputed (Lab +
      colour family) into `public/browse-index.json` by
      `npm run build:browse-index` and fetched at runtime, so it no longer ships
      in the `/paints` client JS bundle. (~850 KB of data left the bundle; ~175
      KB gzipped over the wire as a cacheable static asset.)
- [x] **Build-time scaling.** Similar-colour lists are now precomputed once by
      `npm run build:similar-index` (sharded across CPU cores) into
      `.cache/similar-index.json`, and each paint page reads its list as an O(1)
      lookup instead of running `findSimilar` over the whole dataset at render.
      The static-generation phase no longer grows with the square of the
      catalogue size.
- [x] **Search debounce race.** The debounced search commit closes over a stale
      `searchParams`, so toggling a facet mid-debounce can drop it. `clearAll`
      also doesn't cancel the pending timer, and the timer isn't cleared on
      unmount.
- [x] **Validate URL filter params.** The `type` query param is cast to
      `PaintType[]` without validation — filter it against the known set
      instead.
- [x] **Type the colour family.** `PaintWithLab.family` is `string` rather than
      `ColourFamily`, losing type safety where it would help.
- [x] **Remove dead code.** `getRanges()` in `src/lib/paints/load.ts` is unused
      (the browser computes range facets itself).

## License

[MIT](LICENSE)
