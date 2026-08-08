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
- `src/lib/data/` — per-table Supabase CRUD (e.g. saved schemes) and the
  `scheme-photos` storage bucket
- `src/lib/supabase/` — browser client + the anon server client used only by
  the `/scheme/[slug]` share viewer
- `supabase/` — the database: `schema.sql` (fresh projects only), `migrations/`
  (deltas applied by hand), and `README.md`, the runbook for both. Changing the
  schema means reading that first — RLS is the whole security boundary, and
  production is a separate project from the one you develop against.
- `src/components/` — UI components
- `src/app/` — routes: `/`, `/paints`, `/paints/[id]`, `/visualiser`,
  `/my-schemes`, `/my-paints` (owned paints + wishlist), `/scheme/[slug]` (the
  one server-rendered route)
- `scripts/` — data import + validation

Keep pure, testable logic in `src/lib` and add a test in `test/` when you
change colour maths or filtering.

## 3. The changelog, and releasing

These are two separate jobs, and keeping them separate is what stops
[`CHANGELOG.md`](CHANGELOG.md) drifting behind what's actually live.

### In your PR: write the entry

**Any PR that changes `src/` adds its entries under `## [Unreleased]`, in that
PR.** CI enforces it. Don't add a version number or a date — that happens at
release.

Write for someone who paints miniatures, not for someone reading the diff: what
changed, why it's better, and what it costs. The existing entries are the house
style — they name the trade-offs ("the photo is all that travels for now")
rather than hiding them. Group under the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
headings: `Added`, `Changed`, `Fixed`, `Removed`, `Security`, plus `Development`
for things that aren't user-facing but explain why the rest is safe.

If a change genuinely isn't user-facing — a pure refactor, a test-only change —
put the **`no changelog`** label on the PR and the check goes green. Paint-data
corrections, dependency bumps and doc-only changes aren't checked at all.

### Releasing: put a version on it

**Every push to `main` deploys to production**, so a merge ships. Cutting a
version is a separate, deliberate act — it's how you say "this is a thing worth
announcing", not how you ship.

To cut one:

1. Rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`.
2. Add a fresh, empty `## [Unreleased]` above it.
3. Bump `version` in `package.json` to match.
4. Merge, then tag the merge commit: `git tag vX.Y.Z && git push origin vX.Y.Z`.

The tag is what makes "which commit is production running?" answerable. Versions
follow [SemVer](https://semver.org/spec/v2.0.0.html); while the site is pre-1.0,
a release with new features is a minor bump and a fix-only one is a patch.

**If the release needs database changes, apply them first.** Migrations in
`supabase/migrations/` are run by hand against production *before* the deploy
that depends on them, and confirmed rather than assumed — see
[`supabase/README.md`](supabase/README.md). Merging is the point of no return
here, because it deploys; withholding the version number does not hold the
deploy back.

## Code of conduct

Be kind and constructive. This is a hobby project for a hobby community.
