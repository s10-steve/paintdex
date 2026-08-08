import type { BrowsePaint } from "./types";

/**
 * Recover a catalogue id for a paint that only carries its name and maker.
 *
 * The visualiser needs this because **a `SchemePaint` has no catalogue id**. Its
 * `id` is an ephemeral React key: `toExportShape` strips it, `importSchemeObject`
 * mints a fresh one, and `add-paint.tsx` discards `BrowsePaint.id` at the moment
 * a paint is added. Even `presets.ts`, which stores real catalogue ids, resolves
 * them to a name/brand/range/hex and throws the id away. So the only route from
 * a saved scheme back to the catalogue is to match on what survived.
 *
 * Deliberately *not* fixed by persisting an id on `SchemePaint`. That field
 * would have to be conditionally spread to keep a paint's serialisation
 * byte-identical (or every stored `syncedCanon` stops matching and every
 * document looks dirty on its next load — see "Mixes and notes"), it would be
 * absent from every scheme saved before now, and this lookup would still be
 * needed as the fallback. One mechanism is better than one and a half.
 */

/** The fields a scheme paint actually carries. */
export interface CatalogueQuery {
  name: string;
  brand: string;
  range: string;
  custom?: boolean;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * `brand|range|name` and `brand|name`. Two keys, because a paint sold in more
 * than one range can be recorded under either — `Paint.range` is the *primary*
 * line while `ranges` holds the rest, and a scheme saved from one and compared
 * against the other would miss on the narrow key alone.
 *
 * Hex is deliberately not part of either key. Paint hexes are best-effort and do
 * get corrected — that's why `presets.test.ts` refuses to assert its fallback
 * hexes match the catalogue — so keying on colour would silently break every
 * older scheme the day a correction landed.
 */
const wideKey = (brand: string, name: string) => `${norm(brand)}|${norm(name)}`;
const narrowKey = (brand: string, range: string, name: string) =>
  `${norm(brand)}|${norm(range)}|${norm(name)}`;

interface Index {
  narrow: Map<string, string>;
  wide: Map<string, string>;
}

/**
 * Memoized per array, at module scope, for the `lab-index.ts` reason: a
 * `useMemo` dies with its component, and this is read once per layer row — so a
 * per-component index would rebuild a 5,000-entry map for every row of every
 * scheme, every mount. Keyed on the array's identity, which is stable because
 * `fetchBrowseIndex` hands the same cached array to every caller. A `WeakMap` so
 * a test fixture or a mocked hook gets its own entry and can still be collected.
 */
const cache = new WeakMap<readonly BrowsePaint[], Index>();

function indexOf(paints: readonly BrowsePaint[]): Index {
  const hit = cache.get(paints);
  if (hit) return hit;

  const narrow = new Map<string, string>();
  const wide = new Map<string, string>();
  for (const p of paints) {
    // First wins on both maps. The narrow key is the disambiguating one, so a
    // wide-key collision only decides between paints that share a brand and a
    // name across two ranges — where either answer is the same colour, and
    // `Paint.id` is itself documented as "optionally range-disambiguated".
    const nk = narrowKey(p.brand, p.range, p.name);
    if (!narrow.has(nk)) narrow.set(nk, p.id);
    for (const range of p.ranges ?? [p.range]) {
      const rk = narrowKey(p.brand, range, p.name);
      if (!narrow.has(rk)) narrow.set(rk, p.id);
    }
    const wk = wideKey(p.brand, p.name);
    if (!wide.has(wk)) wide.set(wk, p.id);
  }

  const index = { narrow, wide };
  cache.set(paints, index);
  return index;
}

/**
 * The catalogue id for a scheme paint, or `null` when there isn't one.
 *
 * `null` is a normal answer, not a failure, and callers render no control for
 * it. Three ways to get it: a hand-entered custom colour (there is no catalogue
 * paint to add), a catalogue that hasn't loaded yet, and a paint whose name or
 * brand has changed since the scheme was saved. All three fail in the safe
 * direction — a missing button, never a wrong one.
 */
export function cataloguePaintId(
  paint: CatalogueQuery,
  paints: readonly BrowsePaint[] | null,
): string | null {
  if (!paints || paints.length === 0) return null;
  // Mirrors `isCustomColour` in `scheme/types.ts` without importing it: this
  // module must stay free of scheme types, so `paints/` doesn't gain a
  // dependency on `scheme/` for one boolean.
  if (paint.custom && (!paint.brand || paint.brand === "custom")) return null;
  if (!paint.name || !paint.brand) return null;

  const { narrow, wide } = indexOf(paints);
  return (
    narrow.get(narrowKey(paint.brand, paint.range, paint.name)) ??
    wide.get(wideKey(paint.brand, paint.name)) ??
    null
  );
}
