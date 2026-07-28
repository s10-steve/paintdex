/**
 * Query-param serialisation for filter state, for **both** paint pages.
 *
 * Two places filter the catalogue — the browse grid (`paints-browser.tsx`) and
 * the alternatives panel on a paint page (`similar-colours.tsx`) — and both keep
 * their state in the URL so a filtered view is shareable, and so filters survive
 * moving between them. This module owns the whole vocabulary, so the two pages
 * can't disagree about what `?brand=` means or serialise the same selection two
 * different ways.
 *
 * The rule that decides where a param lives:
 *
 * - A param that says **which paints you want** is shared, applied by both pages,
 *   and travels: `brand`, `range`, `type`, `metal`, `disc` (see `SharedFacets`).
 * - A param that says **how to present this page** stays local: `sort` on browse,
 *   `view` on a paint page.
 * - A filter with a control on only one page is **carried but never applied by the
 *   other**: `q` and `family` (browse-only), `match` (panel-only). They ride the
 *   URL untouched so a round trip restores them.
 *
 * Pure: no DOM, no React, no `window`. Callers read params from wherever suits
 * them — browse from `useSearchParams()`, the panel from `window.location` — and
 * write the result back with `history.replaceState`. **This module is the codec,
 * not the transport.**
 *
 * **Multi-value facets are comma-joined**, matching the browse page's long-
 * standing format (`?brand=Citadel,Vallejo`). That's safe only because no brand
 * or range value contains a comma — checked across all 105 ranges, and guarded by
 * a drift test. A future product line with a comma in its name would split
 * silently, so it would need an escaping scheme here (and a migration for old
 * links).
 */
import { COLOUR_FAMILIES, type ColourFamily } from "@/lib/color";
import { PAINT_TYPES, type PaintType } from "./types";

/** Every param the two paint pages own. */
export const FILTER_PARAMS = {
  brand: "brand",
  range: "range",
  type: "type",
  metal: "metal",
  disc: "disc",
  family: "family",
  q: "q",
  sort: "sort",
  match: "match",
  view: "view",
} as const;

/**
 * The params an internal link between the two pages may copy.
 *
 * An allow-list rather than "the whole query string": copying wholesale would
 * propagate `utm_*`, `fbclid`, `preset=` and anything else a stranger's link
 * arrived with through every internal navigation.
 */
export const TRAVEL_PARAMS: readonly string[] = Object.values(FILTER_PARAMS);

/**
 * A read-only view of a query string.
 *
 * `useSearchParams()` hands back a `ReadonlyURLSearchParams`, so readers are typed
 * structurally instead of demanding a mutable `URLSearchParams`.
 */
export type ParamReader = Pick<URLSearchParams, "get">;

/** Restrict by metallic finish. Empty string means "no preference". */
export type MetallicFilter = "" | "only" | "exclude";

export type SimilarView = "list" | "plot";

/** Browse's result ordering. Lives here so `sort` has one validated vocabulary. */
export const SORT_KEYS = ["name", "brand", "lightness"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export const DEFAULT_SORT: SortKey = "name";

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

/**
 * The facets both pages apply, render identically, and carry between them.
 *
 * Note what is deliberately **absent**: `families`. The paint page has no
 * colour-family control (matches all cluster around the reference colour, so it
 * would be a no-op most of the time and would silently empty the list at a family
 * boundary, with no checkbox to explain it). Keeping it out of the shared shape is
 * also what lets an arrival from `/paints?family=red` stay `isDefaultSimilarParams`
 * — so the panel skips its restore and keeps the fetch-free first render.
 */
export interface SharedFacets {
  brands: Set<string>;
  ranges: Set<string>;
  types: Set<string>;
  metallic: MetallicFilter;
  includeDiscontinued: boolean;
}

/** Browse: the shared facets plus its own search, colour family and ordering. */
export type BrowseParamState = SharedFacets & {
  search: string;
  families: Set<string>;
  sort: SortKey;
};

/** A paint page's alternatives panel: the shared facets plus its ΔE cap and view. */
export type SimilarParamState = SharedFacets & {
  minMatch: MatchValue;
  view: SimilarView;
};

export function emptySharedFacets(): SharedFacets {
  return {
    brands: new Set(),
    ranges: new Set(),
    types: new Set(),
    metallic: "",
    includeDiscontinued: false,
  };
}

/** The state a paint page opens in when the URL carries nothing. */
export function emptySimilarParams(): SimilarParamState {
  return { ...emptySharedFacets(), minMatch: DEFAULT_MATCH, view: "list" };
}

/** The state browse opens in when the URL carries nothing. */
export function emptyBrowseParams(): BrowseParamState {
  return {
    ...emptySharedFacets(),
    search: "",
    families: new Set(),
    sort: DEFAULT_SORT,
  };
}

/* ------------------------------------------------------------------ codecs */

/** Split a comma-joined facet param. */
export function parseList(v: string | null): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

/**
 * Closed vocabularies are validated and unknown values dropped.
 *
 * A URL is user-editable and arrives from strangers' links, so `?type=nonsense`
 * must not be able to produce a filter that matches nothing with no way to see
 * why. Brands and ranges are the exception — they can't be validated here without
 * importing the catalogue (which would drag ~4,900 paints into the client bundle);
 * `sanitiseSharedFacets` does that job in the component, against its facet props.
 */
export function parseTypes(v: string | null): PaintType[] {
  return parseList(v).filter((t): t is PaintType =>
    (PAINT_TYPES as readonly string[]).includes(t),
  );
}

export function parseFamilies(v: string | null): ColourFamily[] {
  return parseList(v).filter((f): f is ColourFamily =>
    (COLOUR_FAMILIES as readonly string[]).includes(f),
  );
}

export function parseMetallic(v: string | null): MetallicFilter {
  return v === "1" ? "only" : v === "0" ? "exclude" : "";
}

export function parseDisc(v: string | null): boolean {
  return v === "1";
}

export function parseSort(v: string | null): SortKey {
  return (SORT_KEYS as readonly string[]).includes(v ?? "")
    ? (v as SortKey)
    : DEFAULT_SORT;
}

export function parseMatch(v: string | null): MatchValue {
  return (MATCH_VALUES as readonly string[]).includes(v ?? "")
    ? (v as MatchValue)
    : DEFAULT_MATCH;
}

/* ------------------------------------------------------------------- reads */

export function readSharedFacets(params: ParamReader): SharedFacets {
  return {
    brands: new Set(parseList(params.get(FILTER_PARAMS.brand))),
    ranges: new Set(parseList(params.get(FILTER_PARAMS.range))),
    types: new Set<string>(parseTypes(params.get(FILTER_PARAMS.type))),
    metallic: parseMetallic(params.get(FILTER_PARAMS.metal)),
    includeDiscontinued: parseDisc(params.get(FILTER_PARAMS.disc)),
  };
}

export function readSimilarParams(params: ParamReader): SimilarParamState {
  return {
    ...readSharedFacets(params),
    minMatch: parseMatch(params.get(FILTER_PARAMS.match)),
    view: params.get(FILTER_PARAMS.view) === "plot" ? "plot" : "list",
  };
}

export function readBrowseParams(params: ParamReader): BrowseParamState {
  return {
    ...readSharedFacets(params),
    search: params.get(FILTER_PARAMS.q) ?? "",
    families: new Set<string>(parseFamilies(params.get(FILTER_PARAMS.family))),
    sort: parseSort(params.get(FILTER_PARAMS.sort)),
  };
}

/* ------------------------------------------------------------------ writes */

/** Serialise a facet set, or delete the param when nothing is selected. */
function setList(params: URLSearchParams, key: string, values: Set<string>) {
  // Sorted so the same selection always produces the same URL, whatever order the
  // boxes were ticked in — otherwise "same filters" and "same link" stop being the
  // same statement. Readers go through `parseList` into a Set, so order is not
  // observable and old insertion-order bookmarks keep working.
  if (values.size) params.set(key, [...values].sort().join(","));
  else params.delete(key);
}

const setFlag = (params: URLSearchParams, key: string, on: boolean) =>
  on ? params.set(key, "1") : params.delete(key);

/**
 * Apply the shared facets onto a **copy** of `params` and return it.
 *
 * Empty means absent, everywhere — a default view has a bare URL. Params this
 * function doesn't own are carried through untouched, which is what lets `q`,
 * `family` and `sort` survive a detour through a paint page (and `match`/`view`
 * survive a detour through browse).
 */
export function writeSharedFacets(
  params: URLSearchParams,
  facets: SharedFacets,
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  setList(next, FILTER_PARAMS.brand, facets.brands);
  setList(next, FILTER_PARAMS.range, facets.ranges);
  setList(next, FILTER_PARAMS.type, facets.types);

  if (facets.metallic === "only") next.set(FILTER_PARAMS.metal, "1");
  else if (facets.metallic === "exclude") next.set(FILTER_PARAMS.metal, "0");
  else next.delete(FILTER_PARAMS.metal);

  setFlag(next, FILTER_PARAMS.disc, facets.includeDiscontinued);
  return next;
}

export function writeSimilarParams(
  params: URLSearchParams,
  state: SimilarParamState,
): URLSearchParams {
  const next = writeSharedFacets(params, state);
  if (state.minMatch !== DEFAULT_MATCH)
    next.set(FILTER_PARAMS.match, state.minMatch);
  else next.delete(FILTER_PARAMS.match);

  if (state.view === "plot") next.set(FILTER_PARAMS.view, "plot");
  else next.delete(FILTER_PARAMS.view);

  return next;
}

export function writeBrowseParams(
  params: URLSearchParams,
  state: BrowseParamState,
): URLSearchParams {
  const next = writeSharedFacets(params, state);
  setList(next, FILTER_PARAMS.family, state.families);

  const q = state.search.trim();
  if (q) next.set(FILTER_PARAMS.q, q);
  else next.delete(FILTER_PARAMS.q);

  if (state.sort !== DEFAULT_SORT) next.set(FILTER_PARAMS.sort, state.sort);
  else next.delete(FILTER_PARAMS.sort);

  return next;
}

/* ------------------------------------------------------------------ travel */

/**
 * Copy only `TRAVEL_PARAMS` out of `current`, then apply `overrides` on top.
 *
 * This is what an internal link between the two pages carries. Everything else on
 * the current URL is left behind on purpose — see `TRAVEL_PARAMS`.
 */
export function travelParams(
  current: ParamReader,
  overrides?: URLSearchParams,
): URLSearchParams {
  const next = new URLSearchParams();
  for (const key of TRAVEL_PARAMS) {
    const v = current.get(key);
    if (v) next.set(key, v);
  }
  if (overrides) {
    for (const [key, v] of overrides) {
      if (v) next.set(key, v);
      else next.delete(key);
    }
  }
  return next;
}

/** `""` or `"?brand=Vallejo&view=plot"`, ready to append to an href. */
export function travelQuery(
  current: ParamReader,
  overrides?: URLSearchParams,
): string {
  const qs = travelParams(current, overrides).toString();
  return qs ? `?${qs}` : "";
}

/**
 * The query string to append to a `/paints/<id>` href so the panel's filters
 * follow the click.
 *
 * With `current`, the browse-only params riding the URL (`q`, `family`, `sort`)
 * come along too, so a later trip back to browse restores them. Without it,
 * behaves as it always did — only the panel's own params.
 */
export function similarLinkQuery(
  state: SimilarParamState,
  current?: ParamReader,
): string {
  const base = current ? travelParams(current) : new URLSearchParams();
  const qs = writeSimilarParams(base, state).toString();
  return qs ? `?${qs}` : "";
}

/* ------------------------------------------------------------------ helpers */

/**
 * True when a shared facet is narrowing the candidate set.
 *
 * The ΔE cap doesn't count — it post-filters a ranked list rather than changing
 * which candidates are ranked. Nor does the default `includeDiscontinued: false`:
 * only an explicit `true` counts, because on a paint page this flag decides
 * whether the precomputed match list can be used at all, and treating the default
 * as a filter would cost every page its instant first render.
 */
export function hasSharedFacet(facets: SharedFacets): boolean {
  return (
    facets.brands.size > 0 ||
    facets.ranges.size > 0 ||
    facets.types.size > 0 ||
    facets.metallic !== "" ||
    facets.includeDiscontinued
  );
}

/** Back-compat alias; the panel reads better calling this one. */
export const hasFacetFilter = hasSharedFacet;

/** True when nothing the panel applies is set and the default view is showing. */
export function isDefaultSimilarParams(state: SimilarParamState): boolean {
  return (
    !hasSharedFacet(state) &&
    state.minMatch === DEFAULT_MATCH &&
    state.view === "list"
  );
}

/** Delete `keys` from a copy of `params`; everything else survives. */
export function clearParams(
  params: ParamReader & { toString(): string },
  keys: readonly string[],
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  for (const key of keys) next.delete(key);
  return next;
}

/**
 * What each page's "Clear all" is allowed to remove.
 *
 * The rule: **clear the controls in front of you, preserve everything else.** So
 * browse doesn't wipe `sort` (it never counted it as a filter), and the panel
 * doesn't destroy an inbound `q`/`family` the user has no control for and would
 * have no way to restore.
 */
export const BROWSE_CLEARABLE: readonly string[] = [
  FILTER_PARAMS.brand,
  FILTER_PARAMS.range,
  FILTER_PARAMS.type,
  FILTER_PARAMS.metal,
  FILTER_PARAMS.disc,
  FILTER_PARAMS.family,
  FILTER_PARAMS.q,
];

export const SIMILAR_CLEARABLE: readonly string[] = [
  FILTER_PARAMS.brand,
  FILTER_PARAMS.range,
  FILTER_PARAMS.type,
  FILTER_PARAMS.metal,
  FILTER_PARAMS.disc,
  FILTER_PARAMS.match,
];

const keepKnown = (values: Set<string>, known: readonly string[]): Set<string> => {
  const allowed = new Set(known);
  return new Set([...values].filter((v) => allowed.has(v)));
};

/**
 * Drop brand and range values that aren't in the catalogue any more.
 *
 * The readers can't do this — they're pure and mustn't import the catalogue — so
 * the components do it against the facet lists they were handed. It matters
 * because a sidebar only renders a checkbox for a value it knows about: an unknown
 * `?brand=` would otherwise be an invisible active filter, giving zero results
 * with no box to untick and no explanation. Dropping it, and letting the next
 * write heal the URL, keeps the address bar, the state and the checkboxes telling
 * the same story.
 *
 * Generic over the two state shapes so both pages get it from one implementation.
 */
export function sanitiseSharedFacets<T extends SharedFacets>(
  state: T,
  known: { brands: readonly string[]; ranges: readonly string[] },
): T {
  return {
    ...state,
    brands: keepKnown(state.brands, known.brands),
    ranges: keepKnown(state.ranges, known.ranges),
  };
}

/** Back-compat alias used by the alternatives panel. */
export const sanitiseSimilarParams = sanitiseSharedFacets<SimilarParamState>;
