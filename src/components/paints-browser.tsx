"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { filterPaints } from "@/lib/paints/filter";
import type { BrowsePaint, PaintType } from "@/lib/paints/types";
import {
  BROWSE_CLEARABLE,
  FILTER_PARAMS,
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
import { useBrowseIndex } from "@/hooks/use-browse-index";
import { PaintCard } from "./paint-card";
import { FacetGroup } from "./facet-group";

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

  const gotoPaint = (p: BrowsePaint) => {
    setSuggestOpen(false);
    setActiveSuggestion(-1);
    router.push(`/paints/${p.id}`);
  };

  // Keep the latest params in a ref so the debounced commit builds from current
  // state rather than the params captured when the timer was scheduled —
  // otherwise a facet toggled mid-debounce would be dropped.
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  const cancelSearchTimer = () => {
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
  };

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

  const brandOptions = facetOptions(brands, available?.brands ?? null, filters.brands);
  const familyOptions = facetOptions(families, available?.families ?? null, filters.families);
  const typeOptions = facetOptions(types, available?.types ?? null, filters.types);
  const rangeOptions = facetOptions(ranges, available?.ranges ?? null, filters.ranges);

  const activeFilterCount =
    filters.brands.size +
    filters.ranges.size +
    filters.types.size +
    filters.families.size +
    (includeDiscontinued ? 1 : 0) +
    (metallic ? 1 : 0) +
    (q ? 1 : 0);

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
      <FacetGroup
        title="Brand"
        options={brandOptions}
        selected={filters.brands}
        onToggle={toggleFacet("brands")}
      />
      <FacetGroup
        title="Colour family"
        options={familyOptions}
        selected={filters.families}
        onToggle={toggleFacet("families")}
      />
      <FacetGroup
        title="Type"
        options={typeOptions}
        selected={filters.types}
        onToggle={toggleFacet("types")}
      />
      <div className="border-b border-border py-3">
        <span className="text-sm font-semibold">Finish</span>
        <div className="mt-2 flex flex-col gap-1">
          {(
            [
              { value: "", label: "All" },
              { value: "only", label: "Metallic only" },
              { value: "exclude", label: "Non-metallic" },
            ] as const
          ).map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted"
            >
              <input
                type="radio"
                name="metallic-filter"
                className="accent-[var(--primary)]"
                checked={metallic === o.value}
                onChange={() => commit((prev) => ({ ...prev, metallic: o.value }))}
              />
              {o.label}
            </label>
          ))}
        </div>
      </div>
      <FacetGroup
        title="Range"
        options={rangeOptions}
        selected={filters.ranges}
        onToggle={toggleFacet("ranges")}
        defaultOpen={false}
      />
      <label className="flex cursor-pointer items-center gap-2 py-3 text-sm">
        <input
          type="checkbox"
          className="accent-[var(--primary)]"
          checked={includeDiscontinued}
          onChange={() =>
            commit((prev) => ({
              ...prev,
              includeDiscontinued: !prev.includeDiscontinued,
            }))
          }
        />
        Include discontinued
      </label>
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
            aria-expanded={suggestVisible && suggestions.length > 0}
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
                <li className="p-3 text-center text-[12.5px] text-muted-foreground">
                  {loadError
                    ? "Paint database unavailable."
                    : "No matching paints."}
                </li>
              ) : (
                suggestions.map((p, i) => (
                  <li key={p.id} role="option" aria-selected={i === activeSuggestion}>
                    <button
                      type="button"
                      id={`paint-suggestion-${i}`}
                      // onMouseDown (not onClick) so it fires before the input's blur closes the list.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        gotoPaint(p);
                      }}
                      onMouseEnter={() => setActiveSuggestion(i)}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left ${
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
                    </button>
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
                  <PaintCard key={p.id} paint={p} />
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
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileFiltersOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-0 h-full w-80 max-w-[85%] overflow-y-auto border-l border-border bg-background p-4 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">Filters</span>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="rounded-md border border-border px-3 py-1 text-sm"
              >
                Done
              </button>
            </div>
            {sidebar}
          </div>
        </div>
      ) : null}
    </div>
  );
}
