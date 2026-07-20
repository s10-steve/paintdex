# Paintdex

A database of miniature paints with hex colour values — searchable, filterable,
and able to find visually similar colours across brands.

> **Status:** covers the paint database, perceptual colour matching and a paint
> scheme visualiser. The project is intended to be open-sourced in future — the
> paint catalogue especially, so the community can help keep colours accurate.
> User accounts, owned-paint inventories, and shareable recipe links are also
> planned (see [Roadmap](#roadmap)).

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
- **Paint scheme visualiser.** Plan a miniature's colour scheme on
  `/visualiser`: group your paints by element (armour, robes, lenses…) and
  preview every element's colours as aligned, optionally-blended vertical bars,
  so the whole model reads together. Paints carry a role (base, layer,
  highlight, wash, glaze, weathering) and a weight; elements have a weight that
  sets their bar width. Search the database to add a paint or enter a custom
  name + hex. Schemes autosave in your browser and export/import as JSON.
- **Light & dark mode**, following your system preference with a manual toggle.
- **Responsive** desktop and mobile layouts.
- **Plain-JSON data.** The paint database is plain JSON, one file per brand. The
  catalogue is intended to be open-sourced, so the community can help fix colours
  and add paints.

## Tech stack

- [Next.js](https://nextjs.org/) (App Router) + TypeScript, statically generated
- [Tailwind CSS](https://tailwindcss.com/) v4
- [next-themes](https://github.com/pacocoursey/next-themes) for theming
- [zod](https://zod.dev/) for data validation
- [Vitest](https://vitest.dev/) for unit tests
- [Supabase](https://supabase.com/) for optional accounts (sign-in + saved
  schemes), called directly from the browser
- Hosted on [Vercel](https://vercel.com/), with Vercel Analytics and Speed
  Insights for traffic and performance monitoring

The core site (paint database, matching, visualiser) needs no backend — it's
statically generated and the paint data ships in the repo. **Accounts are
optional**: the browser talks to Supabase directly, so the site stays static and
free to host. If the Supabase env vars are unset, accounts simply don't appear
and schemes are saved to `localStorage`, as before.

### Accounts setup (optional)

1. Create a free [Supabase](https://supabase.com/) project and run
   [`supabase/schema.sql`](supabase/schema.sql) in its SQL editor.
2. Create a Google OAuth **client ID** (Google Cloud → Credentials → OAuth
   client ID → Web application). Add your origins (`http://localhost:3000`,
   `https://paintdex.app`) to **Authorized JavaScript origins**.
3. Enable the **Google** provider under Supabase → Authentication → Providers,
   and add the client ID above to its **Client IDs** field (this is what lets
   Supabase accept the browser-issued ID token).
4. Copy [`.env.example`](.env.example) to `.env.local` and set
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (all public; data access is protected by
   Row-Level Security). Set the same three in Vercel for production.

> **How sign-in is wired (and why).** Sign-in uses **Google Identity Services**
> to obtain an ID token in the browser, then exchanges it with Supabase via
> `signInWithIdToken`. Because this runs from our own origin, Google's consent
> screen is branded to `paintdex.app` rather than the Supabase callback domain —
> and it needs **no paid Supabase custom domain**. (Showing a custom *logo* on
> the consent screen still requires Google's brand verification, which is now
> achievable since the domain is one we own.)

## Getting started

The project targets **Node 24** (the version CI runs — see
[`.nvmrc`](.nvmrc)). With [nvm](https://github.com/nvm-sh/nvm) or
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

Paintdex is live at [paintdex.app](https://paintdex.app), hosted on
[Vercel](https://vercel.com/). It's a standard Next.js project that deploys with
zero configuration: every push to `main` builds and ships to production, and
pull requests get their own preview URLs. Because everything is static, the free
Hobby tier is plenty and there is nothing to keep warm.

## Contributing to the paint data

The paint database lives in [`data/paints/`](data/paints/) as one JSON file per
brand — and is the part of the project most intended to be opened up. Edits are
just JSON: see [`data/paints/README.md`](data/paints/README.md) for the schema
and [`CONTRIBUTING.md`](CONTRIBUTING.md) for the workflow. Once the repo is
public, corrections and additions will be welcome via pull request.
`npm run validate:data` checks changes, and CI runs it on every PR.

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
- [ ] Review and correct the paint hex values — some are noticeably off (e.g.
      Nuln Oil), as the initial data was best-effort. So far, fixes have been
      manual: open the manufacturer's product page and sample the swatch image
      with the macOS Digital Colour Meter (this is how several Vallejo hexes
      were corrected). Worth exploring a bot/scraper that pulls product details
      and hex values straight from each manufacturer's website to do this at
      scale — ideally cross-checked against the official product-page links above.
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
- [ ] Is it possible to compute the hue and luminance relationships between
      paints? It'd be cool to have the similar paints arranged in a grid with
      axes representing hue and luminance. So if you're looking for something
      slightly different to the paint you have, you can see the options in a
      more intuitive way than just a list of similar colours.

### Real live website

- [x] Deploy to Vercel and make it an actual live website —
      [paintdex.app](https://paintdex.app). The paint data ships in the repo, so
      the site runs with no backend or database.
- [ ] Get some users to try it out and gather feedback.

### User accounts & recipe features

- [x] User accounts & login (Google sign-in via Supabase)
- [ ] Save the paints you own
- [x] Save your paint schemes (synced to your account, with local schemes
      migrated on first sign-in)
- [ ] Example/starter schemes to explore in the visualiser — likely built on
      top of user accounts and saved schemes (e.g. a curated gallery you can
      load and tweak), rather than a single scheme baked into the app
- [ ] Paint schemes can suggest only paints from your collection
- [ ] Wishlist for paints you don't own yet but want to buy
- [ ] Public, shareable recipe links (no login to view) with suggestions from
      paints you own (based on colour similarity)

## License

[MIT](LICENSE)
