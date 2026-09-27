# Paint data

This folder is the open, community-maintained source of truth for Paintdex. Each
file is a JSON array of paint records for one brand:

- `warhammer.json` — Warhammer, formerly Citadel Colour (Games Workshop),
  including Tone Pro. The paints sold as Citadel keep their `citadel-*` ids —
  see "Ids outlive brand names" below
- `vallejo.json` — Vallejo
- `ak-interactive.json` — AK Interactive (incl. Real Colors)
- `army-painter.json` — The Army Painter (Warpaints, Speedpaint, …)
- `duncan-rhodes.json` — Duncan Rhodes Painting Academy
- `green-stuff-world.json` — Green Stuff World
- `liquitex.json` — Liquitex
- `mig.json` — AMMO by Mig Jimenez
- `p3.json` — Privateer Press Formula P3
- `scale-75.json` — Scale 75
- `tamiya.json` — Tamiya

## Record schema

```jsonc
{
  "id": "citadel-abaddon-black", // unique slug: <brand-slug>-<name-slug>
  "name": "Abaddon Black", // display name
  "brand": "Warhammer", // brand name
  "range": "Base", // the product-line heading its page shows
  "ranges": ["Real Colors - Air", "Real Colors - WWII"], // OPTIONAL: every heading, if >1
  "type": "opaque", // what the paint does (see below)
  "hex": "#231F20", // uppercase #RRGGBB
  "code": null, // OPTIONAL manufacturer code, or null
  "discontinued": false,
  "metallic": true, // OPTIONAL: metallic finish (absent = false)
}
```

**`type`** says what the paint *does*, comparably across brands:

| type | for |
|---|---|
| `opaque` | an ordinary covering paint — base, layer, dry, most airbrush and spray colours |
| `contrast` | a one-coat paint that shades as it colours (Contrast, Speedpaint, Xpress Color) |
| `wash` | a wash or shade, including enamel panel-line washes |
| `glaze` | a transparent colour, including "Clear …" paints |
| `ink` | an ink |
| `primer` | a primer, pot or can |
| `varnish` | a varnish (Ardcoat, Munitorum Varnish, gloss/matt/satin) |
| `medium` | a thinner, retarder or mixing medium (Lahmian Medium) |
| `technical` | a texture or effect (Astrogranite, crackle, mud, blood) |

A brand's own product line ("Base", "Layer", "Tone Pro") is `range`, not
`type`. A name is a poor guide: "Medium Blue" and "Basic Skin Tone" are
`opaque`.

**`metallic`** marks a metallic finish, and is the only place a metallic is
marked: some brands ship a dedicated metallic line, others file golds and
silvers among their ordinary colours, and Scale 75's Metal N Alchemy mixes
both. If a metallic paint isn't flagged (a gold that shows up as "similar" to
flat yellows), add `"metallic": true` and open a PR. Omit the field for
non-metallic paints.

### Ranges (`data/ranges.json`)

What's true of a whole range lives there, not on each paint: how it's
delivered (`format`: `brush`, `airbrush` — sold to spray straight from the
bottle — or `spray`), what binds it (`binder`: `acrylic`, `enamel`, `oil`,
`lacquer`), its product `line`, a URL `slug`, the `defaultType` for new paints,
and `discontinued` when the whole line is off the market. The rare paint that
breaks its range's rule is listed under `exceptions`.

**`ranges[]` may only list headings on one product line.** AK prints the same
Real Colors bottle under "Air" and "WWII", and that's what the field is for. A
paint sold in two lines — Game Color and Game Air, a Tamiya pot and its spray
can — is two different paints, with two records: someone can own one without
the other.

### Rules (enforced by `npm run validate:data`)

- `id` must be a lowercase slug (`a-z`, `0-9`, `-`) and unique across **all**
  files.
- `hex` must be uppercase `#RRGGBB`.
- No two paints may share the same `brand` + `name` + `hex` + `range`.
- `type` must be one of the values above.
- Every paint's range has an entry in `data/ranges.json`, and every entry has
  a paint.
- A paint's `ranges[]` all sit on one product line.
- A paint in a discontinued range is marked `discontinued`.

### Ids outlive brand names

An id is an address — paint pages, saved collections and the example schemes
all point at one — so it is never changed to follow a rebrand. When Games
Workshop dropped the Citadel name, those paints became `"brand": "Warhammer"`
and kept their `citadel-*` ids; paints launched since (Tone Pro) get
`warhammer-*` ones. The `<brand-slug>-<name-slug>` rule is for minting new ids,
not for checking old ones.

## How to fix or add a paint

1. Edit the relevant JSON file (or add a new object to the array). A paint in
   a range that isn't in `data/ranges.json` yet needs an entry there too.
2. Run `npm run validate:data` to check your change.
3. Open a pull request. CI runs the same validation.

Keeping the files alphabetically sorted by name is nice but not required.

## Attribution & licensing

The initial data was imported from
[`Arcturus5404/miniature-paints`](https://github.com/Arcturus5404/miniature-paints),
licensed under the MIT License (© 2022 Rick Fleuren / the Miniature Painter Pro
team). The import step lives in
[`scripts/import-source.mjs`](../../scripts/import-source.mjs).

Hex values are approximate and derived from manufacturer/community sources — the
whole point of keeping them here as open data is that anyone can correct them.

Brand, product and faction names are trademarks of their respective owners.
Paintdex is not affiliated with any paint manufacturer or game publisher.
