# Paint data

This folder is the open, community-maintained source of truth for Paintdex.
Each file is a JSON array of paint records for one brand:

- `citadel.json` — Citadel Colour (Games Workshop)
- `vallejo.json` — Vallejo
- `ak-interactive.json` — AK Interactive (incl. Real Colors)

## Record schema

```jsonc
{
  "id": "citadel-abaddon-black",   // unique slug: <brand-slug>-<name-slug>
  "name": "Abaddon Black",         // display name
  "brand": "Citadel",              // brand name
  "range": "Base",                 // primary product line
  "ranges": ["Air", "Base"],       // OPTIONAL: all lines it appears in (if >1)
  "type": "base",                  // normalized finish (see below)
  "hex": "#231F20",                // uppercase #RRGGBB
  "code": null,                    // OPTIONAL manufacturer code, or null
  "discontinued": false
}
```

**`type`** is one of: `base`, `layer`, `shade`, `contrast`, `technical`,
`metallic`, `air`, `primer`, `spray`, `ink`, `wash`, `glaze`, `dry`, `other`.
It's a best-effort normalization of the finish; `range` keeps the brand's own
product-line label.

### Rules (enforced by `npm run validate:data`)

- `id` must be a lowercase slug (`a-z`, `0-9`, `-`) and unique across **all** files.
- `hex` must be uppercase `#RRGGBB`.
- No two paints may share the same `brand` + `name` + `hex`.
- `type` must be one of the values above.

## How to fix or add a paint

1. Edit the relevant JSON file (or add a new object to the array).
2. Run `npm run validate:data` to check your change.
3. Open a pull request. CI runs the same validation.

Keeping the files alphabetically sorted by name is nice but not required.

## Attribution & licensing

The initial data was imported from
[`Arcturus5404/miniature-paints`](https://github.com/Arcturus5404/miniature-paints),
licensed under the MIT License (© 2022 Rick Fleuren / the Miniature Painter Pro
team). The import step lives in [`scripts/import-source.mjs`](../../scripts/import-source.mjs).

Hex values are approximate and derived from manufacturer/community sources — the
whole point of keeping them here as open data is that anyone can correct them.

Brand and product names are trademarks of their respective owners. Paintdex is
not affiliated with any paint manufacturer.
