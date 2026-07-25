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
  distance — with filters to narrow the matches by brand or type. Great for
  comparing paints across brands.
- **Paint scheme visualiser.** Plan a miniature's colour scheme on
  `/visualiser`: Group your paints by element (armour, robes, lenses, etc) and
  preview every element's colours as aligned, optionally-blended vertical bars.
  Paints carry a role (base, layer, highlight, drybrush, wash, glaze,
  weathering) and a weight; each element's bar is sized by its order —
  largest-area element first.
  Search the database to add a paint or enter a custom name + hex. Schemes
  autosave in your browser and export/import as JSON — or sync to your account
  when signed in.
- **Accounts (optional).** Sign in with Google to sync your saved schemes across
  devices; without an account, schemes save to your browser. A **My schemes**
  page (`/my-schemes`) manages your schemes — rename, duplicate, delete and
  share. A placeholder **My paints** page (`/my-paints`) marks where owned-paint
  inventories will go.
- **Shareable scheme links.** Publish any saved scheme to an unguessable
  `/scheme/<slug>` link that anyone can open — no login — to see the visual and
  the full paint recipe, with a rich colour preview when pasted on social sites.
  Signed-in viewers can save a copy to their own account.
- **Share images.** Turn a scheme plus a photo of your model into a 4:5 PNG for
  social media: drop a marker on each part of the model and it gets a callout
  with that element's colour ramp and paint names, joined by a leader line.
  Frame the photo, add your handle, and optionally show manufacturers and roles.
  The photo is rendered in your browser and never uploaded.
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
free to host.

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
| `npm run test`          | Unit tests (colour maths + filtering)                                                        |
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

Ideas we'd love help with — see [`CONTRIBUTING.md`](CONTRIBUTING.md) if you want
to pick one up. Shipped work is tracked in [`CHANGELOG.md`](CHANGELOG.md).

### Social sharing features

Generating a labelled share image has shipped — see **Share images** above. What
is left of that idea:

- [ ] Store the uploaded photo against the scheme (Supabase Storage) rather than
      in the browser only, so it follows you across devices and can appear on
      the public `/scheme/<slug>` page.
- [ ] More aspect ratios for the share image — 1:1 for a square feed post, 9:16
      for stories. It is 4:5 only today.
- [ ] Split a long scheme across several share images instead of truncating the
      paint lists, so every element stays readable.

### Paint database and UI features

- [ ] Add more paint brands and ranges
- [ ] Add
      [AK Interactive effects](https://ak-interactive.com/product-category/paints/paints-weathering/all-weathering-effects/)
      range (includes commonly used weathering effects like Rust Streaks and
      Streaking Grime)
- [ ] Interactive colour wheel (à la
      [Canva's colour wheel](https://www.canva.com/colors/color-wheel/)) that
      suggests matching paints based on colours you pick. Would be useful if
      you're looking to design custom schemes with colours that work well
      together. Could also be a different way to visualise colour schemes in
      `/visualise`
- [ ] Is it possible to compute the hue and luminance relationships between
      paints? It'd be cool if `/paints` showed similar paints arranged in a grid
      with axes representing hue and luminance. So if you're looking for
      something slightly different to the paint you have, you can see the
      options in a more intuitive way than just a list of similar colours.

### My paints feature

- [ ] Save the paints you own
- [ ] Example/starter schemes to explore in the visualiser — likely built on top
      of user accounts and saved schemes (e.g. a curated gallery you can load
      and tweak), rather than a single scheme baked into the app
- [ ] Paint schemes can suggest only paints from your collection
- [ ] Wishlist for paints you don't own yet but want to buy

## License

[MIT](LICENSE)
