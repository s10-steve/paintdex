# Changelog

All notable changes to Paintdex are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet._

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

[Unreleased]: https://github.com/s10-steve/paintdex/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/s10-steve/paintdex/releases/tag/v0.1.0
