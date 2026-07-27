"use client";

import { useEffect, useState } from "react";
import { fetchBrowseIndex, peekBrowseIndex } from "@/lib/paints/browse-index";
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
  // Seeded from the module cache so a second mount — a paint-to-paint navigation,
  // say — starts with the catalogue already in hand rather than replaying a
  // loading state for data that never left memory.
  //
  // Hydration-safe: nothing fetches at build time, so a server prerender always
  // sees null, and so does the first client render of the initial document (the
  // whole tree hydrates in one pass before any effect runs, so no sibling can have
  // filled the cache mid-hydration). It is only ever non-null on a soft
  // navigation, where there is no hydration to mismatch.
  const [paints, setPaints] = useState<BrowsePaint[] | null>(peekBrowseIndex);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    // Read the cache rather than `paints`, so this stays a mount-only effect.
    if (peekBrowseIndex()) return;
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
