# Paintdex

A database of miniature paints with hex colour values — searchable, filterable,
and able to find visually similar colours across brands.

> **Status:** covers the paint database, perceptual colour matching, a paint
> scheme visualiser, and optional accounts (Google sign-in with your schemes
> synced to your account). Owned-paint inventories and shareable recipe links
> are planned next (see [Roadmap](#roadmap)); the project will be open-sourced
> once those are in, so the community can help keep the paint catalogue accurate.

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
  highlight, wash, glaze, weathering) and a weight; each element's bar is sized
  by its order — largest-area element first — and elements can be reordered.
  Search the database to add a paint or enter a custom name + hex. Schemes
  autosave in your browser and export/import as JSON — or sync to your account
  when signed in.
- **Accounts (optional).** Sign in with Google to sync your saved schemes across
  devices; without an account, schemes save to your browser exactly as before.
  Owned-paint inventories and shareable recipe links are planned.
- **Light & dark mode**, following your system preference.
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

You only need this to stand up your **own** accounts backend (running your own
instance, or hacking on the account features). The core site — paint database,
matching, visualiser — needs none of it and runs fully static without these
steps.

1. Create a free [Supabase](https://supabase.com/) project and run
   [`supabase/schema.sql`](supabase/schema.sql) in its SQL editor.
2. Create a Google OAuth **client ID** (Google Cloud → Credentials → OAuth
   client ID → Web application). Add your own origins to **Authorized
   JavaScript origins** — `http://localhost:3000` for local dev, plus whatever
   domain you deploy to.
3. Enable the **Google** provider under Supabase → Authentication → Providers,
   and add the client ID above to its **Client IDs** field (this is what lets
   Supabase accept the browser-issued ID token).
4. Copy [`.env.example`](.env.example) to `.env.local` and set
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (all public; data access is protected by
   Row-Level Security). Set the same three wherever you host (e.g. Vercel) for
   production.

> **How sign-in is wired (and why).** Sign-in uses **Google Identity Services**
> to obtain an ID token in the browser, then exchanges it with Supabase via
> `signInWithIdToken`. Because this runs from your own origin, Google's consent
> screen is branded to your own domain rather than the Supabase callback domain —
> and it needs **no paid Supabase custom domain**. (Showing a custom *logo* on
> the consent screen still requires Google's brand verification, which needs a
> domain you own.)

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

It's a standard Next.js project that deploys with zero configuration — nothing
to configure for the core site, and no server to keep warm since everything is
static. The public instance at [paintdex.app](https://paintdex.app) is hosted on
[Vercel](https://vercel.com/) (every push to `main` builds and ships to
production, pull requests get their own preview URLs, and the free Hobby tier is
plenty), but any host that runs Next.js — or serves a static export — works just
as well.

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
- [x] Update the favicon to match the new colour-wheel logo
      (`public/logo.svg`).
- [x] Tapping a search box on mobile zooms the page in, which then lets it
      scroll left/right. Likely the iOS Safari behaviour where it auto-zooms
      inputs with a font-size below 16px — check the search inputs' font size
      and/or the viewport `meta`.
- [x] Add an "are you sure?" confirmation dialog to the Reset button in the
      scheme visualiser.
- [x] Rearrange the Scheme Visualiser layout. Currently the scheme name sits in
      the middle of the explanation text and above the "My schemes" dropdown.
      Better order: "Scheme Visualiser" heading + explanation full-width at the
      top; then the "My schemes" dropdown; then the scheme title and the scheme
      itself.
- [x] The "Sign in with Google" button renders light/white in dark mode — it's
      Google's own iframe button, so re-render it with a dark `theme` when the
      resolved theme changes.
- [x] Make the weathering overlays in the scheme visualiser less transparent.
- [x] Simplify the scheme visualiser: drop the per-element size sliders and size
      each element's bar by its order instead (largest-area element first), with
      ↑↓ buttons to reorder elements. Add a note to order elements by how much of
      the model they cover (e.g. armour first, lenses last).
- [x] When the blend toggle is off (Banded), also flatten washes/glazes/
      weathering to a thin line instead of a feathered band.

### Paint database and UI features

- [x] Paint database: search, filter, colour families
- [x] Similar-colour matching (CIEDE2000)
- [x] Paint scheme visualiser (`/visualiser`): group paints by element and
      preview the whole scheme's colours as blended vertical bars, with roles,
      per-paint weights, order-based element sizing, and JSON export/import
- [x] Light/dark + responsive
- [ ] Review and correct the paint hex values — some are noticeably off, as the
      initial data was best-effort. Fixes are manual: open the manufacturer's
      product page and sample the swatch image with the macOS Digital Colour
      Meter (this is how several Vallejo hexes were corrected, and how Nuln Oil
      was fixed).
- [ ] Add more paint brands and ranges
- [x] Light/dark follows the system preference
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
- [ ] Fix specific hex values: Nuln Oil Gloss is wrong — should match the
      non-gloss Nuln Oil; Agrax Earthshade looks wrong too — should be a darker
      brown.
- [ ] Add an "export as Markdown" option for paint schemes (alongside the
      existing JSON export).

### Real live website

- [x] Deploy to Vercel and make it an actual live website —
      [paintdex.app](https://paintdex.app). The paint data ships in the repo, so
      the site runs with no backend or database.
- [ ] Get some users to try it out and gather feedback.
- [ ] Do an SEO pass on the site (metadata, structured data, per-page titles,
      sitemap coverage, etc.).

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
- [ ] Add a privacy policy and terms of service, then link them from Google
      Auth Platform → Branding. Needed for Google OAuth verification (and lets
      us show the app logo on the consent screen). See Google's
      [verification requirements](https://support.google.com/cloud/answer/13464321).

### Open source

- [ ] Open-source the repo once the user accounts & recipe features above have
      shipped, so the community can help keep the paint catalogue accurate.
- [x] Review the README before going public — it read like a guide to reproduce
      our exact live deployment (owner voice, `paintdex.app` infra). Reframe the
      Supabase/Vercel setup as optional "run your own instance" steps so it
      orients contributors rather than handing over the keys to the live site.

## License

[MIT](LICENSE)
