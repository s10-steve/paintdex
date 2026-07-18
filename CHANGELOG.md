# Changelog

All notable changes to Paintdex are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Eight more paint brands imported from the upstream dataset — The Army Painter,
  Duncan Rhodes, Green Stuff World, Liquitex, Mig, P3, Scale 75 and Tamiya —
  taking the catalogue from ~2,700 to 4,940 paints across 11 brands.
- Interactive colour-wheel idea added to the roadmap.

### Changed

- The `/paints` browse dataset is now served as a cacheable static asset
  (`public/browse-index.json`, precomputed with lightness + colour family) and
  fetched at runtime instead of being bundled into the client JS, which is
  preloaded to avoid a first-load waterfall. The largest client chunk drops from
  ~852 KB to ~222 KB and the JS no longer grows with the catalogue.
- Similar-colour lists are precomputed once (sharded across CPU cores) into
  `.cache/similar-index.json` and read as an O(1) lookup per paint page; the
  static-generation phase drops from ~32 s to ~17 s and no longer scales
  quadratically with the catalogue.
- The `import:source` script now treats a literal `"null"` code cell as no code.

### Fixed

- Search debounce race: a facet toggled mid-debounce is no longer dropped, and
  the timer is cancelled on clear-all and unmount.
- URL filter params (`type`, `sort`) are validated against the known sets
  instead of being cast blindly.
- `PaintWithLab.family` is now typed as `ColourFamily` rather than `string`.
- The precomputed similar-colour lists now match `findSimilar` exactly:
  `getAllPaints()` is ordered name-A–Z-within-brand (the same order the build
  scripts rank in), so paints sharing a hex break equal-distance ties
  identically instead of diverging on which fills the last slot.
- Paint detail pages are pinned to static rendering (`dynamicParams = false`),
  so an unknown id 404s at build instead of trying to read the build-only
  `.cache/similar-index.json` at request time.

### Removed

- Unused `getRanges()` helper from `src/lib/paints/load.ts`.

## [0.1.0] - 2026-07-18

First release: the paint database and colour matching.

### Added

- Searchable, filterable database of 2,600+ paints across Citadel, Vallejo and
  AK Interactive, with every filter encoded in the URL for shareable views.
- Perceptual colour matching on each paint page, ranking the closest colours by
  CIEDE2000 (ΔE) in CIE-Lab space, with an option to see other brands only.
- Filtering and sorting by brand, product range, finish type and colour family.
- Pure, dependency-free colour library (hex parsing, sRGB→XYZ→Lab conversion,
  CIEDE2000, WCAG luminance/contrast, coarse hue-family classification).
- Light and dark mode following the system preference, with a manual toggle.
- Responsive desktop and mobile layouts.
- Open, community-maintained paint data as plain JSON in `data/paints/`, with a
  Zod schema, a `validate:data` script enforcing unique ids and identities, and
  an `import:source` script to (re)import from the upstream dataset.
- Unit tests for the colour maths and filtering logic.
- CI pipeline running lint, data validation, tests and build on every PR.
