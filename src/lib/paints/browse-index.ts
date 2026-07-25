import type { BrowsePaint } from "./types";

/**
 * The browse dataset is served as a cacheable static asset (precomputed by
 * `scripts/build-browse-index.ts`) and fetched at runtime, so it never enters
 * the client JS bundle. Pages that render a consumer preload it with
 * `<link rel="preload">`; components read it through the `useBrowseIndex()`
 * hook (`src/hooks/use-browse-index.ts`) rather than fetching it themselves.
 */
export const BROWSE_INDEX_URL = "/browse-index.json";

/** Fetch and parse the browse index. Rejects on a non-2xx response. */
export async function fetchBrowseIndex(): Promise<BrowsePaint[]> {
  const res = await fetch(BROWSE_INDEX_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as BrowsePaint[];
}
