# Paintdex

An open, community-maintained database of miniature paints with hex colour
values — searchable, filterable, and able to find visually similar colours
across brands.

> **Status:** first release covers the paint database + colour matching.
> User accounts, owned-paint inventories, and shareable painting recipes are
> planned (see [Roadmap](#roadmap)).

## Features

- **Searchable, filterable database** of 2,600+ paints across **Citadel**,
  **Vallejo** and **AK Interactive**. Filter by brand, product range, finish
  type and colour family — every filter is encoded in the URL, so any view is
  shareable.
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
Interactive, or any paint manufacturer. Brand and product names are trademarks
of their respective owners.

## Roadmap

- [x] Paint database: search, filter, colour families
- [x] Similar-colour matching (CIEDE2000)
- [x] Light/dark + responsive
- [ ] User accounts & login
- [ ] Save the paints you own
- [ ] Painting recipes with colour-coded guide text
- [ ] Public, shareable recipe links (no login to view) with suggestions from
      paints you own

## License

[MIT](LICENSE)
