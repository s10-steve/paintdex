# Paintdex

An open, community-maintained database of miniature paints with hex colour
values — searchable, filterable, and able to find visually similar colours
across brands.

> **Status:** first release covers the paint database + colour matching.
> User accounts, owned-paint inventories, and shareable painting recipes are
> planned (see [Roadmap](#roadmap)).

## Features

- **Searchable, filterable database** of 4,900+ paints across 11 brands —
  **Citadel**, **Vallejo**, **AK Interactive**, **The Army Painter**,
  **Duncan Rhodes**, **Green Stuff World**, **Liquitex**, **Mig**, **P3**,
  **Scale 75** and **Tamiya**. Filter by brand, product range, finish type and
  colour family — every filter is encoded in the URL, so any view is shareable.
- **Perceptual colour matching.** Every paint page lists the closest colours
  ranked by **CIEDE2000** (ΔE) — the industry-standard perceptual colour
  distance — with an option to see other brands only.
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

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (statically generates every paint page) |
| `npm run lint` | ESLint |
| `npm run test` | Unit tests (colour maths + filtering) |
| `npm run validate:data` | Validate `data/paints/*.json` against the schema |
| `npm run import:source` | (Re)import paint data from the upstream dataset |

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

- [x] Paint database: search, filter, colour families
- [x] Similar-colour matching (CIEDE2000)
- [x] Light/dark + responsive
- [ ] Add more paint brands and ranges
- [ ] Make light/dark follow the system automatically (drop the manual toggle)
- [ ] User accounts & login
- [ ] Save the paints you own
- [ ] Painting recipes with colour-coded guide text
- [ ] Public, shareable recipe links (no login to view) with suggestions from
      paints you own
- [ ] Interactive colour wheel (à la
      [Canva's colour wheel](https://www.canva.com/colors/color-wheel/)) that
      suggests matching paints based on the colours you pick

### Known issues & fixes

Follow-ups from the initial code review, to address as the catalogue grows:

- [ ] **Browse-page bundle size.** The full paint dataset currently ships in the
      client JS bundle. Serve it as a cacheable static asset and precompute Lab
      values so the `/paints` bundle stays lean as more brands are added.
- [ ] **Build-time scaling.** Static generation runs `findSimilar` over the whole
      dataset for every paint page (~O(n²) CIEDE2000 calls). Fine at the current
      size, but cap or precompute similar-colour lists before the dataset grows
      much larger.
- [x] **Search debounce race.** The debounced search commit closes over a stale
      `searchParams`, so toggling a facet mid-debounce can drop it. `clearAll`
      also doesn't cancel the pending timer, and the timer isn't cleared on
      unmount.
- [x] **Validate URL filter params.** The `type` query param is cast to
      `PaintType[]` without validation — filter it against the known set instead.
- [x] **Type the colour family.** `PaintWithLab.family` is `string` rather than
      `ColourFamily`, losing type safety where it would help.
- [x] **Remove dead code.** `getRanges()` in `src/lib/paints/load.ts` is unused
      (the browser computes range facets itself).

## License

[MIT](LICENSE)
