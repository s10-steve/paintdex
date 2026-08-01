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
  type MatchValue,
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
 * A chip for one value of a multi-select facet.
 *
 * `type` and `family` are a lowercase internal vocabulary ("oil", "red") that the
 * facet checkboxes title-case for display. Doing it here rather than with a CSS
 * `first-letter:uppercase` keeps the accessible name and the visible text the
 * same string — "Remove filter: oil" beside a chip reading "Oil" is a small lie,
 * and CSS can't reach the `aria-label`. Brand and range names carry their own
 * case and are left alone.
 */
const valueChip = (
  kind: "brands" | "ranges" | "types" | "families",
  value: string,
): ActiveFilterChip =>
  chip(
    kind,
    value,
    kind === "types" || kind === "families"
      ? value.charAt(0).toUpperCase() + value.slice(1)
      : value,
  );

/**
 * Every chip, in the sidebar's group order, so scanning the chips and scanning
 * the controls give the same picture: brand → family → type → finish → range →
 * discontinued, then the page-specific control.
 *
 * One ordered pass with `families` gated, rather than two lists spliced by
 * position — the splice was only correct while brands happened to be emitted
 * first, which is exactly the kind of coupling that survives until someone
 * reorders a group.
 */
function describeFilters(
  s: SharedFacets,
  extras: { families?: Set<string>; search?: string; minMatch?: MatchValue },
): ActiveFilterChip[] {
  const out: ActiveFilterChip[] = [];
  for (const b of s.brands) out.push(valueChip("brands", b));
  for (const f of extras.families ?? []) out.push(valueChip("families", f));
  for (const t of s.types) out.push(valueChip("types", t));
  if (s.metallic) {
    out.push(
      chip(
        "metallic",
        "",
        s.metallic === "only" ? "Metallic only" : "Non-metallic only",
      ),
    );
  }
  for (const r of s.ranges) out.push(valueChip("ranges", r));
  // Only ever a chip when true: `includeDiscontinued: false` is the default, and
  // a chip for a default would put "Excluding discontinued" on an unfiltered
  // page. `hasSharedFacet` counts it the same way, for the same reason.
  if (s.includeDiscontinued) {
    out.push(chip("discontinued", "", "Including discontinued"));
  }
  if (extras.search) out.push(chip("search", "", `Search: ${extras.search}`));
  // Likewise a default: the panel opens at `DEFAULT_MATCH`, and its own
  // "Clear all" gate doesn't count that as an active filter either.
  if (extras.minMatch && extras.minMatch !== DEFAULT_MATCH) {
    out.push(chip("minMatch", "", `Match: ${matchOptionLabel(extras.minMatch)}`));
  }
  return out;
}

/**
 * Browse's chips. It owns the colour-family group and the search box, so both
 * get chips — `activeFilterCount` already counts them.
 */
export function describeBrowseFilters(s: BrowseParamState): ActiveFilterChip[] {
  return describeFilters(s, { families: s.families, search: s.search });
}

/**
 * The alternatives panel's chips. No `families` or `search`: the panel carries
 * both in the URL but applies neither, and has no control to restore them — so a
 * chip would offer to remove a filter that isn't doing anything.
 */
export function describeSimilarFilters(s: SimilarParamState): ActiveFilterChip[] {
  return describeFilters(s, { minMatch: s.minMatch });
}
