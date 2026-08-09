/**
 * How `/my-paints` arranges a collection: the group-by and sort-by vocabularies
 * and the maths behind them.
 *
 * Deliberately **not** part of `filter-params.ts`. That module owns the *URL*
 * vocabulary for `/paints` and `/paints/[id]`; this page keeps every bit of its
 * state in local React state, because it is `noindex` and per-user and a link to
 * it means nothing to anyone else. Nothing here is ever parsed from a query
 * string, so nothing here needs validating on read.
 *
 * It runs *after* `filterPaints`, on a bucket that has already been filtered and
 * name-sorted. `filterPaints` stays the browse sorter with its own `SortKey`;
 * widening that to carry hue would drag Lab maths into the path the whole
 * catalogue takes on every keystroke, to serve one page with a few hundred rows.
 */
import { COLOUR_FAMILIES, NEUTRAL_CHROMA, hexToLab, labToLch, type Lch } from "@/lib/color";
import { facetLabel } from "./facet-availability";
import { PAINT_TYPES, type BrowsePaint } from "./types";

export const COLLECTION_SORTS = ["name", "hue", "chroma", "lightness"] as const;
export type CollectionSort = (typeof COLLECTION_SORTS)[number];

/** What a collection can be grouped by. No grouping is the empty selection. */
export const GROUP_AXES = ["brand", "range", "type", "family"] as const;
export type GroupAxis = (typeof GROUP_AXES)[number];

/**
 * How many axes may be combined at once.
 *
 * Two is a product decision, not a limit of the fold below — three levels of
 * heading over a few hundred paints is a tree, not a list. Enforced by the
 * control (the remaining boxes disable), so this module stays a plain fold.
 */
export const MAX_GROUP_AXES = 2;

/**
 * One heading's worth of paints. `key` is `""` for the ungrouped whole.
 *
 * `paints` is everything under this heading at *any* depth, so a count is
 * `group.paints.length` at either level and no renderer has to sum its
 * children. `groups` empty means a leaf: render the list.
 */
export interface PaintGroup {
  key: string;
  label: string;
  paints: BrowsePaint[];
  groups: PaintGroup[];
}

/**
 * Hex → LCh, memoized at module scope and bounded.
 *
 * Keyed on the hex rather than the paint id, so the same colour under two
 * brands is computed once, and so a re-render with fresh objects still hits.
 * Module scope for the `lab-index.ts` reason — a `useMemo` dies with the
 * component, and this page remounts on every navigation back to it.
 *
 * `lab-index.ts`'s `withLab` is the wrong tool here: it memoizes on the *array's
 * identity*, which is stable only for the shared browse index. The buckets on
 * this page are freshly filtered arrays, so every call would miss and re-derive
 * Lab for the whole collection.
 *
 * `null` is a real answer: `hexToLab` throws on a malformed hex, and paint data
 * is best-effort. A paint that can't be converted still gets a row — it sorts
 * with the neutrals rather than taking the page down.
 */
const MAX_CACHE = 512;
const lchCache = new Map<string, Lch | null>();

function lchOf(hex: string): Lch | null {
  const hit = lchCache.get(hex);
  if (hit !== undefined) return hit;
  let value: Lch | null;
  try {
    value = labToLch(hexToLab(hex));
  } catch {
    value = null;
  }
  if (lchCache.size >= MAX_CACHE) lchCache.clear();
  lchCache.set(hex, value);
  return value;
}

const byName = (a: BrowsePaint, b: BrowsePaint) => a.name.localeCompare(b.name);

/**
 * Sort one list of paints. Every branch tie-breaks on name, matching
 * `filterPaints`, so two paints of the same colour never swap places between
 * renders.
 *
 * **Hue collects the near-neutrals at the end rather than interleaving them.**
 * Below `NEUTRAL_CHROMA` a Lab hue angle is noise, not merely small — the same
 * fact `pickScatterAxis` exists for — and about a quarter of the catalogue is
 * down there. Interleaved, a rack of greys is sprayed through the rainbow at
 * angles that mean nothing; collected, they're a grey run at the end, ordered
 * light-to-dark, which is how they'd sit on a shelf.
 */
function sortPaints(paints: readonly BrowsePaint[], sort: CollectionSort): BrowsePaint[] {
  const list = [...paints];

  if (sort === "name") return list.sort(byName);
  if (sort === "lightness") return list.sort((a, b) => a.l - b.l || byName(a, b));

  if (sort === "chroma") {
    // Most vivid first; the neutrals fall to the end on their own, so this
    // needs no separate bucket.
    return list.sort((a, b) => (lchOf(b.hex)?.c ?? -1) - (lchOf(a.hex)?.c ?? -1) || byName(a, b));
  }

  const chromatic: BrowsePaint[] = [];
  const neutral: BrowsePaint[] = [];
  for (const p of list) {
    const lch = lchOf(p.hex);
    if (lch && lch.c >= NEUTRAL_CHROMA) chromatic.push(p);
    else neutral.push(p);
  }
  // Lab's hue angle starts in the reds and runs yellow → green → blue →
  // purple, which is the order a painter would lay a palette out in.
  chromatic.sort((a, b) => lchOf(a.hex)!.h - lchOf(b.hex)!.h || byName(a, b));
  neutral.sort((a, b) => a.l - b.l || byName(a, b));
  return [...chromatic, ...neutral];
}

/** Which field each axis reads. */
const GROUP_KEY: Record<GroupAxis, (p: BrowsePaint) => string> = {
  brand: (p) => p.brand,
  range: (p) => p.range,
  type: (p) => p.type,
  family: (p) => p.family,
};

/**
 * How an axis's headings are ordered, and how its keys are labelled.
 *
 * `type` and `family` are closed vocabularies whose declared order means
 * something — base → layer → shade, red → … → neutral — so they follow it
 * rather than the alphabet, which would put Blue before Red and Wash before
 * Base. Brands and ranges have no such order and sort by label.
 *
 * Labels come from `facetLabel`, the one place a facet value is cased for
 * display, so a heading and the checkbox that filters by it can't disagree.
 */
const VOCABULARY: Partial<Record<GroupAxis, { order: readonly string[]; kind: "types" | "families" }>> = {
  type: { order: PAINT_TYPES, kind: "types" },
  family: { order: COLOUR_FAMILIES, kind: "families" },
};

/** One level of the fold: split by `axis`, then recurse into whatever's left. */
function foldAxis(
  paints: readonly BrowsePaint[],
  axis: GroupAxis,
  rest: readonly GroupAxis[],
): PaintGroup[] {
  const keyOf = GROUP_KEY[axis];
  // Insertion-ordered, but the keys are sorted below — the map only has to
  // preserve the *paints'* order within each bucket, which it does.
  const buckets = new Map<string, BrowsePaint[]>();
  for (const p of paints) {
    const key = keyOf(p);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(p);
    else buckets.set(key, [p]);
  }

  const vocab = VOCABULARY[axis];
  const order = vocab
    ? (a: string, b: string) => vocab.order.indexOf(a) - vocab.order.indexOf(b) || a.localeCompare(b)
    : (a: string, b: string) => a.localeCompare(b);

  return [...buckets.keys()].sort(order).map((key) => {
    const mine = buckets.get(key)!;
    return {
      key,
      label: vocab ? facetLabel(vocab.kind, key) : key,
      paints: mine,
      groups: rest.length ? foldAxis(mine, rest[0], rest.slice(1)) : [],
    };
  });
}

/**
 * Filtered paints → the sections `/my-paints` renders.
 *
 * `axes` is **ordered**: `axes[0]` is the outer heading, so ticking Brand then
 * Range gives Citadel → Base, and the other way round gives Base → Citadel.
 * An empty `axes` returns a single group with an empty key, so the caller has
 * one shape to render rather than a branch: no key means no heading.
 *
 * Sorting is applied once, up front, and the fold preserves order within each
 * bucket — so a leaf reads in the sort the user picked, whatever the nesting.
 */
export function groupCollection(
  paints: readonly BrowsePaint[],
  axes: readonly GroupAxis[],
  sort: CollectionSort,
): PaintGroup[] {
  const sorted = sortPaints(paints, sort);
  if (axes.length === 0) return [{ key: "", label: "", paints: sorted, groups: [] }];
  return foldAxis(sorted, axes[0], axes.slice(1));
}
