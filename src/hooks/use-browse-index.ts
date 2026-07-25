"use client";

import { useEffect, useState } from "react";
import { fetchBrowseIndex } from "@/lib/paints/browse-index";
import type { BrowsePaint } from "@/lib/paints/types";

export type BrowseIndexState = {
  /** The catalogue, or `null` while the fetch is still in flight. */
  paints: BrowsePaint[] | null;
  /** True once the fetch has failed; `paints` is then an empty array. */
  loadError: boolean;
  /** True until the fetch settles, either way. */
  loading: boolean;
};

/**
 * Load the browse dataset (`public/browse-index.json`) once on mount.
 *
 * Every client view that needs the whole catalogue — the browse grid, the
 * homepage search, the visualiser's paint picker, the similar-colours re-rank —
 * shares this hook so there is one fetch/error shape rather than four copies.
 *
 * On failure `paints` becomes `[]` (not `null`) so consumers that render from
 * `loading` leave their loading state and can show `loadError` instead. A
 * consumer that wants to distinguish "failed" from "empty catalogue" should
 * gate on `loadError`.
 */
export function useBrowseIndex(): BrowseIndexState {
  const [paints, setPaints] = useState<BrowsePaint[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchBrowseIndex()
      .then((data) => {
        if (!cancelled) setPaints(data);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
          setPaints([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { paints, loadError, loading: paints === null };
}
