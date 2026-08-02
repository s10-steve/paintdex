"use client";

import { useMemo } from "react";
import { useBrowseIndex } from "@/hooks/use-browse-index";
import { findSimilar } from "@/lib/paints/filter";
import { withLab } from "@/lib/paints/lab-index";
import {
  computeAvailability,
  matchesFacets,
  type FacetAvailability,
  type FacetSelection,
} from "@/lib/paints/facet-availability";
import type { ScatterCandidate } from "@/lib/paints/scatter";
import type { Lab } from "@/lib/color";
import type { Paint, PaintWithLab } from "@/lib/paints/types";
import type { SimilarParamState, SimilarView } from "@/lib/paints/filter-params";
import type { RenderItem } from "@/components/similar-list";

/** The panel has no colour-family control, so it never narrows by family. */
const NO_FAMILIES: Set<string> = new Set();

/** How many matches the ΔE list shows. */
const LIST_LIMIT = 16;

export type SimilarCandidates = {
  /** True when the catalogue fetch failed; the panel degrades rather than hangs. */
  loadError: boolean;
  /** Facet values that still yield results, or null before the dataset lands. */
  availability: FacetAvailability | null;
  /** The re-ranked ΔE list, or null while the precomputed one is still valid. */
  computed: RenderItem[] | null;
  /** The plot's own candidate set, or null when the plot isn't showing. */
  plotCandidates: ScatterCandidate[] | null;
  /** True while a view genuinely needs data that hasn't arrived. */
  awaitingData: boolean;
};

/**
 * The alternatives panel's three derivations of "which paints count": the facet
 * availability for the sidebar, the re-ranked ΔE list, and the plot's own
 * candidate set.
 *
 * Lifted out of `similar-colours` so that file is the URL transport and the
 * rendering, not also the data pipeline. The pipelines share a universe and a
 * predicate but deliberately differ in what they cap and what they cut, and
 * those differences are the fiddly part — worth having in one place with the
 * reasons attached.
 */
export function useSimilarCandidates({
  target,
  targetLab,
  filters,
  cutoff,
  anyFilter,
}: {
  target: Paint;
  targetLab: Lab;
  filters: SimilarParamState;
  /** ΔE ceiling from the "minimum match" control. */
  cutoff: number;
  /** Whether any facet filter is active, which is what forces a re-rank. */
  anyFilter: boolean;
}): SimilarCandidates {
  const { brands: selBrands, types: selTypes, ranges: selRanges } = filters;
  const { metallic, view, includeDiscontinued } = filters;

  const { paints, loadError } = useBrowseIndex();

  // Recover the Lab triple (kept out of the shipped index) from hex. Memoized at
  // module scope by `withLab`, not just here: this useMemo dies with the component,
  // and re-deriving Lab for 4,961 records on every paint-to-paint navigation costs
  // more than the JSON parse the fetch cache already saves. Stays null on a load
  // failure so the facet-availability pass below hides nothing.
  const dataset = useMemo<PaintWithLab[] | null>(
    () => (paints && !loadError ? withLab(paints) : null),
    [paints, loadError],
  );

  // Candidate universe: everything a match could be. Filtering *and* availability
  // both work from this, which is why the discontinued rule is a gate here rather
  // than being deleted and applied only to the results — otherwise the sidebar
  // would offer a range whose only members the results exclude.
  const universe = useMemo(
    () =>
      dataset
        ? dataset.filter((p) => p.id !== target.id && (includeDiscontinued || !p.discontinued))
        : null,
    [dataset, target.id, includeDiscontinued],
  );

  // Which option values still yield results given the *other* selected facets.
  // Null until the dataset loads, so nothing is hidden before then. Shared with
  // browse so the two sidebars can't prune differently.
  const availability = useMemo(
    () =>
      universe ? computeAvailability(universe, { ...filters, families: NO_FAMILIES }) : null,
    [universe, filters],
  );

  /**
   * The facet predicate both views rank through — the same `matchesFacets`
   * browse and the availability pass use, rather than a third hand-rolled copy.
   *
   * Two deliberate differences from browse, encoded in the selection rather than
   * in the predicate: `families` is empty because the panel carries `family` in
   * the URL but never applies it (matches cluster round the reference colour, so
   * it would be a no-op or an unexplained empty list), and `includeDiscontinued`
   * is true because `universe` has already applied that gate.
   */
  const candidatesFor = useMemo(() => {
    const selection: FacetSelection = {
      brands: selBrands,
      types: selTypes,
      ranges: selRanges,
      families: NO_FAMILIES,
      metallic,
      includeDiscontinued: true,
    };
    return (pool: PaintWithLab[]) => pool.filter((p) => matchesFacets(p, selection));
  }, [selBrands, selTypes, selRanges, metallic]);

  const targetWithLab = useMemo<PaintWithLab>(
    // family isn't needed by findSimilar; a placeholder keeps the type honest.
    () => ({ ...target, lab: targetLab, family: "neutral" }),
    [target, targetLab],
  );

  // Recompute the ranked list from the filtered subset when a filter is active.
  const computed = useMemo<RenderItem[] | null>(() => {
    if (!anyFilter || !universe) return null;
    return findSimilar(candidatesFor(universe), targetWithLab, {
      limit: LIST_LIMIT,
      excludeDiscontinued: !includeDiscontinued,
    }).map(({ paint, distance }) => ({
      id: paint.id,
      hex: paint.hex,
      name: paint.name,
      brand: paint.brand,
      range: paint.range,
      distance,
    }));
  }, [anyFilter, universe, candidatesFor, targetWithLab, includeDiscontinued]);

  /**
   * The plot's own candidate set, deliberately separate from the list's.
   *
   * The precomputed `.cache/similar-index.json` holds only the 16 nearest, which
   * span roughly ±5° of hue against ±11° for the top 60 — a vertical smear, not a
   * scatter. So the plot always re-ranks over the fetched index. It is not shared
   * with the list because the list's instant, fetch-free first render from `all`
   * is a real feature, and because the cached distances are rounded to 3dp, so a
   * client recompute can reorder ties and visibly reshuffle the default view.
   */
  const plotCandidates = useMemo<ScatterCandidate[] | null>(() => {
    if (view !== "plot" || !universe) return null;
    // No `limit` here: capping before `layoutScatter` made `omittedCount` count
    // only what this call dropped, so the caption reported "60 of 120" when Agrax
    // Earthshade really has ~350 inside the cutoff. `findSimilar` sorts the whole
    // candidate list regardless of `limit`, so passing everything costs no extra
    // sort, and `layoutScatter` applies both caps and reports them honestly.
    return findSimilar(candidatesFor(universe), targetWithLab, {
      limit: Infinity,
      excludeDiscontinued: !includeDiscontinued,
    })
      .filter(({ distance }) => distance < cutoff)
      .map(({ paint, distance }) => ({
        id: paint.id,
        name: paint.name,
        brand: paint.brand,
        range: paint.range,
        hex: paint.hex,
        lab: paint.lab,
        distance,
      }));
  }, [view, universe, candidatesFor, targetWithLab, cutoff, includeDiscontinued]);

  // The list only waits on the dataset when a filter forces a re-rank; the plot
  // always needs it.
  const awaitingData = !loadError && !universe && (view === "plot" || anyFilter);

  return { loadError, availability, computed, plotCandidates, awaitingData };
}

export { NO_FAMILIES, type SimilarView };
