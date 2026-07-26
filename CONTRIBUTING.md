# Contributing to Paintdex

Thanks for helping! There are two common kinds of contribution.

## 1. Fixing or adding paint data

This is the most valuable contribution and needs no coding.

1. Find the right file in [`data/paints/`](data/paints/) (one per brand).
2. Edit the JSON — correct a `hex` value, add a missing paint, mark one
   `discontinued`, etc. The record schema and rules are documented in
   [`data/paints/README.md`](data/paints/README.md).
3. Run `npm run validate:data` (CI runs this too).
4. Open a pull request describing what you changed and, ideally, your source
   for a colour value.

## 2. Code changes

The project targets **Node 24** (see [`.nvmrc`](.nvmrc); `nvm use` picks it up).

```bash
npm ci
npm run dev
```

That's the whole setup — **you don't need a backend or any configuration.** The
core site (paint database, colour matching, visualiser) is statically generated
from the JSON in `data/paints/`, so it runs fully out of the box. Optional
account features are the only thing that needs environment variables; with them
unset, sign-in hides itself and schemes save to your browser's `localStorage`.
See [`.env.example`](.env.example) if you specifically want to work on accounts.

Before opening a PR, please make sure the following pass:

```bash
npm run lint
npm run test
npm run validate:data
npm run build
```

### Project layout

- `data/paints/*.json` — the open paint database (source of truth)
- `src/lib/color/` — colour maths (hex → Lab, CIEDE2000, colour families)
- `src/lib/paints/` — types, zod schema, data loader, search/filter/similarity
- `src/lib/scheme/` — scheme bar maths, JSON import/export, share-slug helpers,
  the curated example schemes (`presets.ts`), and the share-image layout + Canvas
  renderer (`poster.ts`, `poster-draw.ts`)
- `src/lib/data/` — per-table Supabase CRUD (e.g. saved schemes)
- `src/lib/supabase/` — browser client + the anon server client used only by
  the `/scheme/[slug]` share viewer
- `src/components/` — UI components
- `src/app/` — routes: `/`, `/paints`, `/paints/[id]`, `/visualiser`,
  `/my-schemes`, `/my-paints`, `/scheme/[slug]` (the one server-rendered route)
- `scripts/` — data import + validation

Keep pure, testable logic in `src/lib` and add a test in `test/` when you
change colour maths or filtering.

## Code of conduct

Be kind and constructive. This is a hobby project for a hobby community.
