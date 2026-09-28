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

**Every push to `main` deploys to production, so a PR that changes what
painters see is a release, and it carries its own version and date.** Putting
them off until "later" is what let [`CHANGELOG.md`](CHANGELOG.md) drift behind
what's actually live.

### In your PR: write the entry and version it

**Any PR that changes `src/` adds its entries under a new
`## [X.Y.Z] - YYYY-MM-DD` heading, just below the empty `## [Unreleased]`, and
bumps the version, in that PR.** CI enforces the entry.

- **Version:** a minor bump for anything new, a patch for fixes only (the site
  is pre-1.0, per [SemVer](https://semver.org/spec/v2.0.0.html)). Change
  `version` in `package.json` and the two root `"version"` fields at the top of
  `package-lock.json` by hand — don't regenerate the lock file.
- **Date:** the day it merges. If your PR waits, update the date before it
  merges.
- **Two PRs in flight** will both claim the next number; whichever merges
  second gets a conflict at the top of the changelog, which is the cue to
  renumber and re-date.

Write for someone who paints miniatures, not for someone reading the diff: what
changed, why it's better, and what it costs. The existing entries are the house
style — they name the trade-offs ("the photo is all that travels for now")
rather than hiding them. Group under the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
headings: `Added`, `Changed`, `Fixed`, `Removed`, `Security`, plus `Development`
for things that aren't user-facing but explain why the rest is safe.

If a change genuinely isn't user-facing — a pure refactor, a test-only change —
put the **`no changelog`** label on the PR and the check goes green. Paint-data
corrections, dependency bumps and doc-only changes aren't checked at all.

### After merging: tag it

Tag the merge commit straight away:
`git tag -a vX.Y.Z -m vX.Y.Z <merge-sha> && git push origin vX.Y.Z`. It's the
one step that can't live in the PR, because the commit doesn't exist until it
merges. The tag is what makes "which commit is production running?"
answerable.

**If the release needs database changes, apply them first.** Migrations in
`supabase/migrations/` are run by hand against production *before* the deploy
that depends on them, and confirmed rather than assumed — see
[`supabase/README.md`](supabase/README.md). Merging is the point of no return
here, because it deploys; withholding the version number does not hold the
deploy back.

## Code of conduct

Be kind and constructive. This is a hobby project for a hobby community.
