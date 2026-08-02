"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { filterPaints } from "@/lib/paints/filter";
import type { BrowsePaint, PaintType } from "@/lib/paints/types";
import {
  BROWSE_CLEARABLE,
  FILTER_PARAMS,
  travelQuery,
  SORT_KEYS,
  clearParams,
  readBrowseParams,
  sanitiseSharedFacets,
  writeBrowseParams,
  type BrowseParamState,
  type SortKey,
} from "@/lib/paints/filter-params";
import {
  computeAvailability,
  facetOptions,
} from "@/lib/paints/facet-availability";
import {
  describeBrowseFilters,
  type ActiveFilterChip,
} from "@/lib/paints/active-filters";
import { useBrowseIndex } from "@/hooks/use-browse-index";
import { useModalDialog } from "@/hooks/use-modal-dialog";
import { ActiveFilters } from "./active-filters";
import { PaintSearchBox } from "./paint-search-box";
import { PaintCard } from "./paint-card";
import { PaintFacets } from "./paint-facets";

const PAGE = 60;

/** Labels for `SORT_KEYS`, which is the validated vocabulary. */
const SORT_LABELS: Record<SortKey, string> = {
  name: "Name (A–Z)",
  brand: "Brand",
  lightness: "Lightness",
};

/** Derive the full facet lists (every present value) from the loaded dataset. */
interface PaintsBrowserProps {
  /**
   * The facet universe, from the build-time catalogue.
   *
   * Passed in rather than derived from the fetched index so the sidebar renders
   * on the first paint instead of appearing once ~1MB of JSON lands — and so the
   * option sets match the paint page's, which has always taken them as props.
   * `computeAvailability` then narrows them once the index arrives.
   */
  brands: string[];
  ranges: string[];
  types: string[];
  families: string[];
}

export function PaintsBrowser({
  brands,
  ranges,
  types,
  families,
}: PaintsBrowserProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  // The dataset is fetched from the static asset once on mount.
  const { paints, loadError, loading } = useBrowseIndex();

  // Filter state is **derived** from the URL every render, never copied into
  // state. That is what keeps Back/Forward working: this component never
  // remounts, so a mount-effect read (the pattern the alternatives panel uses,
  // where a paint-to-paint navigation does remount it) would leave popstate
  // changing the URL with nothing re-reading it.
  const filters = useMemo(() => {
    const fromUrl = readBrowseParams(searchParams);
    // Drop a brand or range that has left the catalogue. Without this it is an
    // invisible active filter: no checkbox renders for it, so the grid is empty
    // with nothing to untick.
    return sanitiseSharedFacets(fromUrl, { brands, ranges });
  }, [searchParams, brands, ranges]);

  const { metallic, includeDiscontinued, sort } = filters;
  const q = filters.search;

  // Local search text so typing stays snappy; committed to the URL (debounced).
  const [searchText, setSearchText] = useState(q);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Mirrors "a search debounce is in flight" into state, for the resync below. */
  const [searchPending, setSearchPending] = useState(false);

  const cancelSearchTimer = () => {
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
  };

  const gotoPaint = (p: BrowsePaint) => {
    cancelSearchTimer();
    setSearchPending(false);
    // Carry the *live* search text rather than the debounced `q`: the query that
    // found this paint is the one worth having when you come back.
    router.push(
      `/paints/${p.id}${travelQuery(
        searchParams,
        new URLSearchParams({ [FILTER_PARAMS.q]: searchText.trim() }),
      )}`,
    );
  };

  // Keep the latest params in a ref so the debounced commit builds from current
  // state rather than the params captured when the timer was scheduled —
  // otherwise a facet toggled mid-debounce would be dropped.
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  const applyParams = (params: URLSearchParams) => {
    const qs = params.toString();
    // Update the URL through the History API rather than router.replace. On
    // this statically-generated page, router.replace is a no-op when the page
    // was hard-loaded with query params (e.g. arriving from the homepage search
    // form at /paints?q=…), which left filters and search stuck. pushState/
    // replaceState integrate with the App Router and reliably sync
    // useSearchParams, so the results update as expected.
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  };

  /**
   * The one place filter state reaches the URL.
   *
   * Writing the whole state back through `writeBrowseParams` keeps `q` exactly as
   * it already was (it comes from `filters.search`, the committed value), so this
   * never disturbs an in-flight search debounce — while guaranteeing every facet
   * is serialised the same way the paint page serialises it.
   */
  const commit = (mut: (prev: BrowseParamState) => BrowseParamState) => {
    // The ref, not `searchParams` — which lags a `replaceState` by a render.
    // With the prop, a facet toggled in the gap between a search debounce
    // firing and React re-rendering rebuilt `q` from the pre-debounce
    // `filters.search` and wiped the search that had just been committed. That
    // is the mirror image of the bug this ref was added to fix.
    applyParams(writeBrowseParams(searchParamsRef.current, mut(filters)));
  };

  /** Toggle one value in a multi-select facet. */
  const toggleFacet =
    (key: "brands" | "ranges" | "types" | "families") => (value: string) =>
      commit((prev) => {
        const next = new Set(prev[key]);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return { ...prev, [key]: next };
      });

  const onSearchChange = (value: string) => {
    setSearchText(value);
    cancelSearchTimer();
    setSearchPending(true);
    searchTimer.current = setTimeout(() => {
      searchTimer.current = null;
      // Cleared before the write, so the render that picks up the new `q` sees
      // no pending search and lets the resync below adopt it.
      setSearchPending(false);
      const params = new URLSearchParams(searchParamsRef.current.toString());
      if (value) params.set(FILTER_PARAMS.q, value);
      else params.delete(FILTER_PARAMS.q);
      applyParams(params);
    }, 200);
  };

  // Clear any pending debounce on unmount.
  useEffect(() => () => cancelSearchTimer(), []);

  /**
   * Keep the box in step with the URL.
   *
   * `useState(q)` seeds it once and nothing put a later `q` back, so the search
   * box was the one control on this page not derived from the URL — the rule
   * the file's header comment says keeps Back/Forward working. Two ways it
   * drifted: the heal effect can rewrite `q` (`writeBrowseParams` trims it), and
   * Back after `gotoPaint` can land on a different one. Either left the input
   * showing text the grid wasn't filtering by.
   *
   * Skipped while a debounce is pending, or this would fight the typing that
   * hasn't reached the URL yet. That flag is state rather than the timer ref
   * because a ref can't be read during render. Set-during-render, as with
   * `visible` below.
   */
  const [syncedQ, setSyncedQ] = useState(q);
  if (q !== syncedQ) {
    setSyncedQ(q);
    if (!searchPending) setSearchText(q);
  }

  // Heal a non-canonical URL: a brand or range that has left the catalogue, an
  // insertion-order facet list, a `disc=0` that means nothing. Without this the
  // address bar advertises filters that aren't applied, and a re-shared link
  // passes the dead param on. Converges in one pass — writing the state back is
  // idempotent once the URL is canonical, so this cannot loop.
  useEffect(() => {
    const healed = writeBrowseParams(searchParams, filters);
    if (healed.toString() !== searchParams.toString()) applyParams(healed);
    // `applyParams` closes over `pathname` only, which is stable for this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, filters]);

  const clearAll = () => {
    cancelSearchTimer();
    setSearchPending(false);
    setSearchText("");
    // Clear the controls in front of you, preserve everything else. Notably this
    // now keeps `sort` — which was always excluded from the active-filter count,
    // yet was being wiped — along with any `match`/`view` carried in from a paint
    // page and any param another feature owns.
    applyParams(clearParams(searchParams, BROWSE_CLEARABLE));
  };

  // Memoised on the two things it actually depends on. Unmemoised, a full pass
  // over ~4,900 records plus a `localeCompare` sort re-ran on *every* render —
  // including every keystroke in the search box (twice, since `suggestions`
  // filters too), every suggestion highlight, every "Show more", and every
  // drawer toggle. `filters` is already memoised on the params, so this only
  // recomputes when the query or the dataset genuinely changes.
  const results = useMemo(
    () =>
      filterPaints(
        paints ?? [],
        {
          search: q,
          brands: [...filters.brands],
          ranges: [...filters.ranges],
          types: [...filters.types] as PaintType[],
          families: [...filters.families],
          includeDiscontinued,
          // PaintFilters wants the finish absent rather than empty.
          metallic: metallic || undefined,
        },
        sort,
      ),
    [paints, q, filters, includeDiscontinued, metallic, sort],
  );

  // Incremental rendering; reset to the first page whenever the query changes.
  // (Set-during-render is React's recommended alternative to a reset effect.)
  const filterKey = searchParams.toString();
  const [visible, setVisible] = useState(PAGE);
  const [prevKey, setPrevKey] = useState(filterKey);
  if (filterKey !== prevKey) {
    setPrevKey(filterKey);
    setVisible(PAGE);
  }

  // Which options still yield results given the *other* active filters, so e.g.
  // picking Vallejo drops Citadel-only types and ranges. Null until the dataset
  // lands, which prunes nothing — the sidebar renders in full from the props
  // immediately and only narrows once it can.
  const available = useMemo(
    () => (paints ? computeAvailability(paints, filters) : null),
    [paints, filters],
  );

  const brandOptions = facetOptions(brands, available?.brands ?? null, filters.brands, "brands");
  const familyOptions = facetOptions(families, available?.families ?? null, filters.families, "families");
  const typeOptions = facetOptions(types, available?.types ?? null, filters.types, "types");
  const rangeOptions = facetOptions(ranges, available?.ranges ?? null, filters.ranges, "ranges");

  /**
   * Undo one chip. Every branch goes through a writer that already exists, so
   * the summary is a second *view* of the filter state, never a second way to
   * write it.
   */
  const chips = describeBrowseFilters(filters);
  const removeChip = (c: ActiveFilterChip) => {
    switch (c.kind) {
      case "brands":
      case "ranges":
      case "types":
      case "families":
        toggleFacet(c.kind)(c.value);
        break;
      case "metallic":
        commit((prev) => ({ ...prev, metallic: "" }));
        break;
      case "discontinued":
        commit((prev) => ({ ...prev, includeDiscontinued: false }));
        break;
      case "search":
        // Same steps `clearAll` takes: the input is uncontrolled by the URL
        // between debounces, so dropping `q` alone would leave the typed text
        // sitting in the box and the pending timer about to put it back.
        cancelSearchTimer();
        setSearchPending(false);
        setSearchText("");
        commit((prev) => ({ ...prev, search: "" }));
        break;
      // The panel's ΔE cutoff has no control on this page, so it can't be a chip
      // here. `describeBrowseFilters` never emits one.
      case "minMatch":
        break;
    }
  };

  const activeFilterCount =
    filters.brands.size +
    filters.ranges.size +
    filters.types.size +
    filters.families.size +
    (includeDiscontinued ? 1 : 0) +
    (metallic ? 1 : 0) +
    (q ? 1 : 0);

  /**
   * The query every card link carries, so browse's filters follow the click. Built
   * from the allow-list rather than the whole query string, so tracking params and
   * other features' params don't propagate through internal navigation.
   */
  const outgoingQuery = travelQuery(searchParams);

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const sidebar = (
    <div className="text-sm">
      <div className="flex items-center justify-between pb-2">
        <span className="font-semibold">Filters</span>
        {activeFilterCount > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-primary hover:underline"
          >
            Clear all
          </button>
        ) : null}
      </div>
      {/* Above the groups, so what's applied is visible without scrolling past
          a few hundred brand and range checkboxes to find the ticks. */}
      <ActiveFilters chips={chips} onRemove={removeChip} className="pb-3" />
      <PaintFacets
        options={{
          brands: brandOptions,
          ranges: rangeOptions,
          types: typeOptions,
          families: familyOptions,
        }}
        selected={filters}
        onToggle={(key, value) => toggleFacet(key)(value)}
        onMetallic={(value) => commit((prev) => ({ ...prev, metallic: value }))}
        onDiscontinued={(value) =>
          commit((prev) => ({ ...prev, includeDiscontinued: value }))
        }
      />
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Search + sort bar */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <PaintSearchBox
          value={searchText}
          onChange={onSearchChange}
          onPick={gotoPaint}
          paints={paints}
          loadError={loadError}
        />
        <div className="flex items-center gap-2">
          <label htmlFor="sort" className="sr-only">
            Sort
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(e) =>
              commit((prev) => ({ ...prev, sort: e.target.value as SortKey }))
            }
            className="rounded-lg border border-input bg-card px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((o) => !o)}
            className="rounded-lg border border-input bg-card px-3 py-2.5 text-sm md:hidden"
            aria-expanded={mobileFiltersOpen}
          >
            Filters
            {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 md:block">{sidebar}</aside>

        <div className="min-w-0 flex-1">
          {/* Mobile only: the sidebar is behind a closed drawer there, so the
              chips inside it can't do their job. The desktop copy lives in the
              sidebar, next to the controls they undo.

              Suppressed while the drawer is open, which renders its own copy of
              the sidebar — the drawer is a plain overlay with no `aria-modal`, so
              both copies stay in the accessibility tree and Tab order, giving two
              identical "Remove filter: X" buttons for every chip. */}
          {mobileFiltersOpen ? null : (
            <ActiveFilters
              chips={chips}
              onRemove={removeChip}
              className="mb-3 md:hidden"
            />
          )}
          <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
            {loading
              ? "Loading paints…"
              : `${results.length.toLocaleString()} paint${
                  results.length === 1 ? "" : "s"
                }`}
          </p>

          {loading ? (
            <div
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
              aria-hidden="true"
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="h-32 animate-pulse rounded-lg border border-border bg-muted"
                />
              ))}
            </div>
          ) : loadError ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
              <p className="font-medium text-foreground">
                Couldn’t load the paint database
              </p>
              <p className="mt-1 text-sm">
                Check your connection and try refreshing the page.
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
              <p className="font-medium text-foreground">No paints found</p>
              <p className="mt-1 text-sm">
                Try clearing some filters or a different search term.
              </p>
              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={clearAll}
                  className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
                >
                  Clear all filters
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {results.slice(0, visible).map((p) => (
                  <PaintCard key={p.id} paint={p} query={outgoingQuery} />
                ))}
              </div>
              {visible < results.length ? (
                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => setVisible((v) => v + PAGE)}
                    className="rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium hover:bg-muted"
                  >
                    Show more ({(results.length - visible).toLocaleString()} left)
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Mobile filter drawer */}
      {mobileFiltersOpen ? (
        <MobileFilterDrawer onClose={() => setMobileFiltersOpen(false)}>
          {sidebar}
        </MobileFilterDrawer>
      ) : null}
    </div>
  );
}

/**
 * The filter sidebar as an overlay, for narrow screens.
 *
 * A real dialog: it is `fixed inset-0` over the page with a scrim, and used to
 * have none of the behaviour that implies — no `role`, no `aria-modal`, no
 * focus trap, no Escape, no focus restore. A keyboard user tabbed straight out
 * of the drawer into the grid behind the scrim, which is both invisible and
 * unreachable-looking.
 *
 * (The alternatives panel's mobile filters are deliberately *not* this: they
 * expand inline in the flow rather than overlaying the page, so a disclosure
 * with `aria-expanded` is the right pattern there and it already uses it.)
 */
function MobileFilterDrawer({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useModalDialog({ onClose, initialFocus: closeRef });

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        className="absolute right-0 top-0 h-full w-80 max-w-[85%] overflow-y-auto border-l border-border bg-background p-4 shadow-xl"
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="font-semibold">Filters</span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1 text-sm"
          >
            Done
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
