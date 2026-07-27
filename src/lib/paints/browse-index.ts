import type { BrowsePaint } from "./types";

/**
 * The browse dataset is served as a cacheable static asset (precomputed by
 * `scripts/build-browse-index.ts`) and fetched at runtime, so it never enters
 * the client JS bundle. Pages that render a consumer preload it with
 * `<link rel="preload">`; components read it through the `useBrowseIndex()`
 * hook (`src/hooks/use-browse-index.ts`) rather than fetching it themselves.
 */
export const BROWSE_INDEX_URL = "/browse-index.json";

/**
 * In-flight/settled fetch, shared across every mount for the life of the page.
 *
 * Without this, each mount re-fetched and re-parsed ~4,900 records. The HTTP
 * cache made the network cheap but the JSON parse is not free, and it landed on
 * exactly the wrong interaction: the alternatives panel can't show a filtered
 * result until the index arrives, so clicking paint → paint → paint with a filter
 * applied paid the cost on every hop.
 */
let cached: BrowsePaint[] | null = null;
let inFlight: Promise<BrowsePaint[]> | null = null;

/**
 * The catalogue if it has already been loaded, else null — **synchronously**.
 *
 * The synchronous read is the point, not an optimisation. Awaiting an
 * already-resolved promise still costs a microtask, and a microtask is a render,
 * so a promise-only cache leaves the alternatives panel flashing its loading
 * skeleton on every paint-to-paint navigation even though the data is in memory.
 * Seeding `useBrowseIndex`'s state from this instead means a filtered panel is
 * filtered on its first render after a soft navigation.
 *
 * Safe to cache for the life of the page: the index is a build-time-immutable
 * static asset, so it cannot go stale within a session. Nothing calls this on the
 * server, so the module-level state is never per-request state.
 */
export function peekBrowseIndex(): BrowsePaint[] | null {
  return cached;
}

/**
 * Fetch and parse the browse index, once per page load. Rejects on a non-2xx
 * response.
 *
 * Only successes are retained: a failed load must stay retryable, or one blip
 * offline would leave every consumer permanently broken until a reload.
 */
export function fetchBrowseIndex(): Promise<BrowsePaint[]> {
  if (cached) return Promise.resolve(cached);
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const res = await fetch(BROWSE_INDEX_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as BrowsePaint[];
  })()
    .then((data) => {
      cached = data;
      inFlight = null;
      return data;
    })
    .catch((err) => {
      inFlight = null;
      throw err;
    });

  return inFlight;
}

/** Drop the memo. For tests, so module state can't leak between cases. */
export function resetBrowseIndexCache(): void {
  cached = null;
  inFlight = null;
}
