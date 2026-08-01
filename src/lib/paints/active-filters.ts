/**
 * The applied filters, as a flat list of removable chips.
 *
 * Filters persist across `/paints` and `/paints/[id]` and travel between them,
 * so a visitor can land on a page with four facets already ticked. The sidebar
 * shows those ticks, but the groups are collapsible and scrollable and a phone
 * keeps the whole thing behind a closed drawer — the state was reachable and
 * invisible at the same time. These chips are the summary, rendered next to
 * "Clear all" where the count already lives.
 *
 * Pure and node-testable, and shared by both pages for the same reason
 * `paint-facets.tsx` is: the two sidebars had already drifted on headings and
 * wording once, and a summary that disagrees with the controls beneath it is
 * worse than no summary.
 *
 * `sort` and `view` never appear. They say *how to present this page*, not
 * *which paints you want* — the same rule that keeps them out of
 * `BROWSE_CLEARABLE` / `SIMILAR_CLEARABLE`, so "Clear all" and the chip list
 * agree on what a filter is.
 */
import {
  DEFAULT_MATCH,
  matchOptionLabel,
  type BrowseParamState,
  type SharedFacets,
  type SimilarParamState,
} from "./filter-params";

/**
 * The facet a chip belongs to. Doubles as the discriminator a page switches on
 * to undo it, so these names match the `onToggle` keys `PaintFacets` uses.
 */
export type ChipKind =
  | "brands"
  | "ranges"
  | "types"
  | "families"
  | "metallic"
  | "discontinued"
  | "search"
  | "minMatch";

export interface ActiveFilterChip {
  kind: ChipKind;
  /**
   * The facet value for the multi-select kinds (`brands`/`ranges`/`types`/
   * `families`), so a page can hand it straight back to its toggle. Empty for
   * the single-valued kinds, which have nothing to identify.
   */
  value: string;
  /** Stable React key and test handle, e.g. `types:oil`. */
  key: string;
  /** What the chip reads. */
  label: string;
}

const chip = (kind: ChipKind, value: string, label: string): ActiveFilterChip => ({
  kind,
  value,
  key: value ? `${kind}:${value}` : kind,
  label,
});

/**
 * Ordered to match the sidebar's groups, so scanning the chips and scanning the
 * controls give the same picture. Brand → type → finish → range → discontinued;
 * the caller splices in its own page-specific chips around this.
 */
function sharedChips(s: SharedFacets): ActiveFilterChip[] {
  const out: ActiveFilterChip[] = [];
  for (const b of s.brands) out.push(chip("brands", b, b));
  for (const t of s.types) out.push(chip("types", t, t));
  if (s.metallic) {
    out.push(
      chip(
        "metallic",
        "",
        s.metallic === "only" ? "Metallic only" : "Non-metallic only",
      ),
    );
  }
  for (const r of s.ranges) out.push(chip("ranges", r, r));
  // Only ever a chip when true: `includeDiscontinued: false` is the default, and
  // a chip for a default would put "Excluding discontinued" on an unfiltered
  // page. `hasSharedFacet` counts it the same way, for the same reason.
  if (s.includeDiscontinued) {
    out.push(chip("discontinued", "", "Including discontinued"));
  }
  return out;
}

/**
 * Browse's chips. Colour family sits after brand, matching the sidebar; the
 * search box is a filter with its own control above the grid, and gets a chip
 * because `activeFilterCount` already counts it.
 */
export function describeBrowseFilters(s: BrowseParamState): ActiveFilterChip[] {
  const shared = sharedChips(s);
  const families = [...s.families].map((f) => chip("families", f, f));
  // Splice families in after the brand chips to mirror the sidebar's order.
  const brandCount = s.brands.size;
  const out = [
    ...shared.slice(0, brandCount),
    ...families,
    ...shared.slice(brandCount),
  ];
  if (s.search) out.push(chip("search", "", `Search: ${s.search}`));
  return out;
}

/**
 * The alternatives panel's chips. `minMatch` only counts when it isn't the
 * default, matching how the panel's own "Clear all" gate treats it.
 */
export function describeSimilarFilters(s: SimilarParamState): ActiveFilterChip[] {
  const out = sharedChips(s);
  if (s.minMatch !== DEFAULT_MATCH) {
    out.push(chip("minMatch", "", `Match: ${matchOptionLabel(s.minMatch)}`));
  }
  return out;
}
