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

```bash
npm install
npm run dev
```

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
- `src/components/` — UI components
- `src/app/` — routes (`/`, `/paints`, `/paints/[id]`)
- `scripts/` — data import + validation

Keep pure, testable logic in `src/lib` and add a test in `test/` when you
change colour maths or filtering.

## Code of conduct

Be kind and constructive. This is a hobby project for a hobby community.
