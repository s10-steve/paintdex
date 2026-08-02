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
    // Default credentials (`same-origin`), deliberately. This is a same-origin
    // static asset, and the preloads that point at it carry no `crossorigin`
    // for the same reason — the two have to agree or the browser keeps two
    // cache entries and downloads ~1MB twice.
    //
    // Agreeing the *other* way, on `credentials: "omit"` plus a
    // `crossOrigin="anonymous"` preload, also matches — but it breaks every
    // protected deployment. Vercel's Deployment Protection gates preview URLs on
    // a cookie, so an uncredentialled request for this file gets a 401 and the
    // page shows "Couldn't load the paint database". Production is unprotected
    // and was fine, which is what made it easy to miss.
    const res = await fetch(BROWSE_INDEX_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // A 200 whose body isn't the index at all — a CDN error page that happens
    // to be JSON, an SPA fallback, a truncated deploy. Cast alone, this resolved
    // "successfully" and then threw out of `filterPaints(...)` during render,
    // with no error boundary on either page: a white screen instead of the
    // "Couldn't load the paint database" state that already exists.
    if (!Array.isArray(data)) throw new Error("Malformed browse index");
    return data as BrowsePaint[];
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
