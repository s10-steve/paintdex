/**
 * Which facet options are still worth offering, given the other active filters.
 *
 * Both paint pages need this — the browse grid and a paint page's alternatives
 * panel — and they used to compute it separately, which is how `disc` and `family`
 * ended up meaning different things on the two sidebars. One pure, node-testable
 * module instead (see `test/facet-availability.test.ts`).
 *
 * Two deliberate omissions, both long-standing behaviour worth keeping:
 *
 * - **Search text is not applied.** Typing must never make checkboxes vanish
 *   underneath the cursor.
 * - **A paint page's ΔE cutoff is not applied.** So an option can be offered and
 *   still yield "No alternatives match these filters". Folding the cutoff in would
 *   make the facet lists a function of a control three rows above them, which is
 *   worse than the asymmetry.
 */
import type { MetallicFilter, SharedFacets } from "./filter-params";

/** One checkbox in a facet group. */
export interface FacetOption {
  value: string;
  label: string;
}

/** The minimum a record needs for the availability pass. */
export interface Facetable {
  brand: string;
  range: string;
  type: string;
  family: string;
  metallic?: boolean;
  discontinued?: boolean;
}

export interface FacetAvailability {
  brands: Set<string>;
  ranges: Set<string>;
  types: Set<string>;
  families: Set<string>;
}

/** The selection the pass narrows by. `families` is browse-only; empty elsewhere. */
export type FacetSelection = SharedFacets & { families: Set<string> };

export const matchesMetallic = (p: { metallic?: boolean }, m: MetallicFilter) =>
  m === "" ? true : m === "only" ? !!p.metallic : !p.metallic;

/** Which facet a caller wants left out of the test. */
export type FacetAxis = "brand" | "range" | "type" | "family";

/**
 * Does this record survive the facet selection?
 *
 * **The** facet predicate. There were three independent implementations of this
 * rule — here, in `filterPaints`, and hand-rolled inside the alternatives panel
 * — plus a verbatim second copy of `matchesMetallic`. `facet-availability`'s own
 * header records that computing availability separately is how `disc` and
 * `family` came to mean different things on the two pages; that centralisation
 * covered which options are *offered*, not which records are *kept*, so the
 * likeliest place to drift was still open.
 *
 * `skip` leaves one facet out, which is what lets the availability pass ask
 * "what else would still be available?" without a facet hiding its own siblings.
 */
export function matchesFacets(
  p: Facetable,
  sel: FacetSelection,
  skip?: FacetAxis,
): boolean {
  return (
    (sel.includeDiscontinued || !p.discontinued) &&
    matchesMetallic(p, sel.metallic) &&
    (skip === "brand" || !sel.brands.size || sel.brands.has(p.brand)) &&
    (skip === "range" || !sel.ranges.size || sel.ranges.has(p.range)) &&
    (skip === "type" || !sel.types.size || sel.types.has(p.type)) &&
    (skip === "family" || !sel.families.size || sel.families.has(p.family))
  );
}

/**
 * For each facet, the values that still yield at least one result given the
 * *other* active filters. A facet's own selection is skipped for its own list, so
 * ticking one brand doesn't hide its siblings.
 */
export function computeAvailability(
  pool: readonly Facetable[],
  sel: FacetSelection,
): FacetAvailability {
  const match = (p: Facetable, skip: FacetAxis) => matchesFacets(p, sel, skip);

  const brands = new Set<string>();
  const ranges = new Set<string>();
  const types = new Set<string>();
  const families = new Set<string>();
  for (const p of pool) {
    if (match(p, "brand")) brands.add(p.brand);
    if (match(p, "range")) ranges.add(p.range);
    if (match(p, "type")) types.add(p.type);
    if (match(p, "family")) families.add(p.family);
  }
  return { brands, ranges, types, families };
}

/**
 * The options to render for one facet: those still available, plus anything
 * already selected so it can always be unticked.
 *
 * `available === null` means the catalogue hasn't loaded yet and **prunes
 * nothing** — otherwise a sidebar would start empty and fill in, and a selected
 * value could briefly have no checkbox.
 *
 * Order follows `values`, so the canonical `PAINT_TYPES` / `COLOUR_FAMILIES`
 * ordering survives rather than being replaced by whatever order the pool is in.
 */
export function facetOptions(
  values: readonly string[],
  available: Set<string> | null,
  selected: Set<string>,
  kind: FacetKind,
): FacetOption[] {
  return values
    .filter((v) => !available || available.has(v) || selected.has(v))
    .map((v) => ({ value: v, label: facetLabel(kind, v) }));
}

/** The four multi-select facets, named as they are in the URL state. */
export type FacetKind = "brands" | "ranges" | "types" | "families";

/**
 * Display form of a facet value.
 *
 * `type` and `family` are a lowercase internal vocabulary ("oil", "red");
 * brands and ranges carry their own casing and must be left alone.
 *
 * Done here rather than with a CSS `capitalize` on the control, because the
 * accessible name comes from the label's text content and CSS can't reach it —
 * so the checkbox read "oil" to a screen reader while showing "Oil". The chips
 * already case in JS for exactly this reason; this is the same rule, shared, so
 * the two can't drift.
 */
export const facetLabel = (kind: FacetKind, value: string): string =>
  kind === "types" || kind === "families"
    ? value.charAt(0).toUpperCase() + value.slice(1)
    : value;
