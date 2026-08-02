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

  // Autocomplete suggestions: matches computed live from the typed text (not the
  // debounced `q`) so the dropdown stays in step with keystrokes. Mirrors the
  // scheme visualiser's add-paint search. Picking one jumps to that paint's page.
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const suggestions = useMemo(() => {
    const term = searchText.trim();
    if (term.length < 2 || !paints) return [];
    return filterPaints(paints, { search: term }).slice(0, 8);
  }, [searchText, paints]);
  const suggestVisible = suggestOpen && searchText.trim().length >= 2;

  const cancelSearchTimer = () => {
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
  };

  const gotoPaint = (p: BrowsePaint) => {
    setSuggestOpen(false);
    setActiveSuggestion(-1);
    cancelSearchTimer();
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
    applyParams(writeBrowseParams(searchParams, mut(filters)));
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
    searchTimer.current = setTimeout(() => {
      const params = new URLSearchParams(searchParamsRef.current.toString());
      if (value) params.set(FILTER_PARAMS.q, value);
      else params.delete(FILTER_PARAMS.q);
      applyParams(params);
    }, 200);
  };

  // Clear any pending debounce on unmount.
  useEffect(() => () => cancelSearchTimer(), []);

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
    setSearchText("");
    setSuggestOpen(false);
    setActiveSuggestion(-1);
    // Clear the controls in front of you, preserve everything else. Notably this
    // now keeps `sort` — which was always excluded from the active-filter count,
    // yet was being wiped — along with any `match`/`view` carried in from a paint
    // page and any param another feature owns.
    applyParams(clearParams(searchParams, BROWSE_CLEARABLE));
  };

  const results = filterPaints(
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
        // Same three steps `clearAll` takes: the input is uncontrolled by the
        // URL between debounces, so dropping `q` alone would leave the typed
        // text sitting in the box and the pending timer about to put it back.
        cancelSearchTimer();
        setSearchText("");
        setSuggestOpen(false);
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
        <div className="relative flex-1">
          <input
            type="search"
            value={searchText}
            onChange={(e) => {
              onSearchChange(e.target.value);
              setSuggestOpen(true);
              setActiveSuggestion(-1);
            }}
            onFocus={() => setSuggestOpen(true)}
            // Delay the close so a click (mousedown) on a suggestion registers first.
            onBlur={() => setTimeout(() => setSuggestOpen(false), 120)}
            onKeyDown={(e) => {
              if (!suggestVisible || !suggestions.length) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveSuggestion((a) =>
                  Math.min(a + 1, suggestions.length - 1),
                );
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveSuggestion((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && activeSuggestion >= 0) {
                // Enter with a highlighted suggestion jumps to that paint; Enter
                // with none highlighted falls through to the normal (debounced)
                // grid-filtering behaviour.
                e.preventDefault();
                gotoPaint(suggestions[activeSuggestion]);
              } else if (e.key === "Escape") {
                setSuggestOpen(false);
                setActiveSuggestion(-1);
              }
            }}
            placeholder="Search by name, brand, range or code…"
            aria-label="Search paints"
            role="combobox"
            // Matches when the listbox is actually in the DOM, including the
            // "No matching paints" state — it was reporting `false` while a
            // listbox was on screen.
            aria-expanded={Boolean(suggestVisible && (paints?.length || loadError))}
            aria-controls="paint-search-suggestions"
            aria-autocomplete="list"
            aria-activedescendant={
              activeSuggestion >= 0
                ? `paint-suggestion-${activeSuggestion}`
                : undefined
            }
            className="w-full rounded-lg border border-input bg-card px-4 py-2.5 pl-10 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
          />
          <svg
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>

          {suggestVisible && (paints?.length || loadError) ? (
            <ul
              id="paint-search-suggestions"
              role="listbox"
              className="absolute inset-x-0 top-[calc(100%+4px)] z-30 max-h-72 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-xl"
            >
              {suggestions.length === 0 ? (
                // Not an option — it's a status, and a listbox child with no
                // role is invalid.
                <li
                  role="presentation"
                  className="p-3 text-center text-[12.5px] text-muted-foreground"
                >
                  {loadError
                    ? "Paint database unavailable."
                    : "No matching paints."}
                </li>
              ) : (
                suggestions.map((p, i) => (
                  // The `id` and `role="option"` must be on the SAME element:
                  // `aria-activedescendant` on the input above points at this
                  // id, and it only announces if what it finds is an option of
                  // the controlled listbox. They used to be split — role here,
                  // id on an inner <button> — so arrowing through the list said
                  // nothing at all in NVDA and VoiceOver. An option must not
                  // contain a focusable descendant either, which is why this is
                  // no longer a button: the keyboard path is the input's arrow
                  // keys and Enter, which is how a combobox is meant to work.
                  <li
                    key={p.id}
                    id={`paint-suggestion-${i}`}
                    role="option"
                    aria-selected={i === activeSuggestion}
                    // onMouseDown (not onClick) so it fires before the input's blur closes the list.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      gotoPaint(p);
                    }}
                    onMouseEnter={() => setActiveSuggestion(i)}
                    className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left ${
                      i === activeSuggestion ? "bg-muted" : "hover:bg-muted"
                    }`}
                  >
                      <span
                        className="h-[22px] w-[22px] flex-none rounded-md ring-1 ring-inset ring-black/15"
                        style={{ background: p.hex }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium">
                          {p.name}
                        </span>
                        <span className="block truncate text-[11.5px] text-muted-foreground">
                          {p.brand} · {p.range}
                        </span>
                      </span>
                      <span className="ml-auto flex-none font-mono text-[11px] text-muted-foreground">
                        {p.hex}
                      </span>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
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
