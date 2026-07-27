/**
 * Query-param serialisation for filter state.
 *
 * Two places filter the catalogue — the browse grid (`paints-browser.tsx`) and
 * the alternatives panel on a paint page (`similar-colours.tsx`) — and both keep
 * their state in the URL so a filtered view is shareable. This module holds the
 * shared vocabulary so they can't disagree about what `?brand=` means.
 *
 * Pure: no DOM, no React, no `window`. Callers read a `URLSearchParams` from
 * wherever suits them and write the result back with `history.replaceState`.
 *
 * **Multi-value facets are comma-joined**, matching the browse page's long-
 * standing format (`?brand=Citadel,Vallejo`). That's safe only because no brand
 * or range value contains a comma — checked across all 105 ranges. A future
 * product line with a comma in its name would split silently, so it would need an
 * escaping scheme here (and a migration for old links).
 */
import { PAINT_TYPES, type PaintType } from "./types";

/** Params the alternatives panel owns. Names are shared with the browse page. */
export const SIMILAR_PARAMS = {
  brand: "brand",
  range: "range",
  type: "type",
  metal: "metal",
  match: "match",
  view: "view",
} as const;

/** Restrict by metallic finish. Empty string means "no preference". */
export type MetallicFilter = "" | "only" | "exclude";

export type SimilarView = "list" | "plot";

/**
 * ΔE cutoffs offered by the "Minimum match" select, keyed to `matchLabel()`'s
 * bands. The value is the upper (exclusive) bound; `"all"` removes the cap.
 */
export const MATCH_VALUES = ["1", "2", "5", "10", "20", "all"] as const;
export type MatchValue = (typeof MATCH_VALUES)[number];

/** Looser matches aren't much use, so the panel opens at "Close or better". */
export const DEFAULT_MATCH: MatchValue = "10";

/** The numeric cutoff a `MatchValue` means. `"all"` is unbounded. */
export const matchCutoff = (v: string): number =>
  v === "all" ? Infinity : Number(v);

export interface SimilarParamState {
  brands: Set<string>;
  types: Set<string>;
  ranges: Set<string>;
  metallic: MetallicFilter;
  minMatch: MatchValue;
  view: SimilarView;
}

/** The state a paint page opens in when the URL carries nothing. */
export function emptySimilarParams(): SimilarParamState {
  return {
    brands: new Set(),
    types: new Set(),
    ranges: new Set(),
    metallic: "",
    minMatch: DEFAULT_MATCH,
    view: "list",
  };
}

/** Split a comma-joined facet param. Shared with the browse page. */
export function parseList(v: string | null): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

/**
 * Read filter state out of a query string.
 *
 * Unrecognised values are dropped rather than trusted: a URL is user-editable and
 * arrives from strangers' links, so `?type=nonsense` must not be able to produce
 * a filter that matches nothing with no way to see why. Brands and ranges are the
 * exception — they can't be validated here without importing the catalogue (which
 * would drag ~4,900 paints into the client bundle), and they don't need to be: a
 * stale brand simply matches nothing, and the sidebar always renders a selected
 * value so it can be unticked.
 */
export function readSimilarParams(params: URLSearchParams): SimilarParamState {
  const types = parseList(params.get(SIMILAR_PARAMS.type)).filter(
    (t): t is PaintType => (PAINT_TYPES as readonly string[]).includes(t),
  );

  const metalRaw = params.get(SIMILAR_PARAMS.metal);
  const metallic: MetallicFilter =
    metalRaw === "1" ? "only" : metalRaw === "0" ? "exclude" : "";

  const matchRaw = params.get(SIMILAR_PARAMS.match);
  const minMatch = (MATCH_VALUES as readonly string[]).includes(matchRaw ?? "")
    ? (matchRaw as MatchValue)
    : DEFAULT_MATCH;

  return {
    brands: new Set(parseList(params.get(SIMILAR_PARAMS.brand))),
    types: new Set<string>(types),
    ranges: new Set(parseList(params.get(SIMILAR_PARAMS.range))),
    metallic,
    minMatch,
    view: params.get(SIMILAR_PARAMS.view) === "plot" ? "plot" : "list",
  };
}

/** Serialise a facet set, or delete the param when nothing is selected. */
function setList(params: URLSearchParams, key: string, values: Set<string>) {
  // Sorted so the same selection always produces the same URL, whatever order
  // the boxes were ticked in — otherwise a shared link differs per user.
  if (values.size) params.set(key, [...values].sort().join(","));
  else params.delete(key);
}

/**
 * Apply `state` onto a **copy** of `params` and return it.
 *
 * Empty means absent, everywhere — a default view has a bare URL. Params this
 * module doesn't own are carried through untouched, so a facet toggle can't
 * destroy something another feature put there.
 */
export function writeSimilarParams(
  params: URLSearchParams,
  state: SimilarParamState,
): URLSearchParams {
  const next = new URLSearchParams(params.toString());

  setList(next, SIMILAR_PARAMS.brand, state.brands);
  setList(next, SIMILAR_PARAMS.type, state.types);
  setList(next, SIMILAR_PARAMS.range, state.ranges);

  if (state.metallic === "only") next.set(SIMILAR_PARAMS.metal, "1");
  else if (state.metallic === "exclude") next.set(SIMILAR_PARAMS.metal, "0");
  else next.delete(SIMILAR_PARAMS.metal);

  if (state.minMatch !== DEFAULT_MATCH)
    next.set(SIMILAR_PARAMS.match, state.minMatch);
  else next.delete(SIMILAR_PARAMS.match);

  if (state.view === "plot") next.set(SIMILAR_PARAMS.view, "plot");
  else next.delete(SIMILAR_PARAMS.view);

  return next;
}

/**
 * The query string to append to a `/paints/<id>` href so the filters follow the
 * click. `""` when nothing is set, so a default link stays clean.
 *
 * Deliberately built from the state alone rather than the current URL: a link
 * should carry the panel's filters, not every param that happens to be on the
 * page.
 */
export function similarLinkQuery(state: SimilarParamState): string {
  const qs = writeSimilarParams(new URLSearchParams(), state).toString();
  return qs ? `?${qs}` : "";
}

/** True when any facet is narrowing the candidate set (the ΔE cap doesn't). */
export function hasFacetFilter(state: SimilarParamState): boolean {
  return (
    state.brands.size > 0 ||
    state.types.size > 0 ||
    state.ranges.size > 0 ||
    state.metallic !== ""
  );
}

/** True when nothing is filtered and the default view is showing. */
export function isDefaultSimilarParams(state: SimilarParamState): boolean {
  return (
    !hasFacetFilter(state) &&
    state.minMatch === DEFAULT_MATCH &&
    state.view === "list"
  );
}

const keepKnown = (values: Set<string>, known: readonly string[]): Set<string> => {
  const allowed = new Set(known);
  return new Set([...values].filter((v) => allowed.has(v)));
};

/**
 * Drop brand and range values that aren't in the catalogue any more.
 *
 * `readSimilarParams` can't do this — it's pure and mustn't import the catalogue
 * — so the component does it against the facet lists it was handed. It matters
 * because the sidebar only renders a checkbox for a value it knows about: an
 * unknown `?brand=` would otherwise be an invisible active filter, giving zero
 * results with no box to untick and no explanation. Dropping it, and letting the
 * next write heal the URL, keeps the address bar, the state and the checkboxes
 * telling the same story.
 */
export function sanitiseSimilarParams(
  state: SimilarParamState,
  known: { brands: readonly string[]; ranges: readonly string[] },
): SimilarParamState {
  return {
    ...state,
    brands: keepKnown(state.brands, known.brands),
    ranges: keepKnown(state.ranges, known.ranges),
  };
}
