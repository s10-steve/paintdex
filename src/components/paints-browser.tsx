"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { filterPaints, type SortKey } from "@/lib/paints/filter";
import {
  PAINT_TYPES,
  type BrowsePaint,
  type PaintType,
} from "@/lib/paints/types";
import { COLOUR_FAMILIES } from "@/lib/color";
import { PaintCard } from "./paint-card";
import { FacetGroup } from "./facet-group";

const PAGE = 60;

const SORTS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Name (A–Z)" },
  { value: "brand", label: "Brand" },
  { value: "lightness", label: "Lightness" },
];

function parseList(v: string | null): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

// The dataset is served as a cacheable static asset (precomputed by
// `scripts/build-browse-index.ts`) and fetched at runtime, so it never enters
// the client JS bundle. See the loader effect below.
export const BROWSE_INDEX_URL = "/browse-index.json";

/** Derive the filter facet lists from the loaded dataset. */
function computeFacets(paints: BrowsePaint[]) {
  const brands = new Set<string>();
  const ranges = new Map<string, Set<string>>(); // range -> brands
  const types = new Set<string>();
  const families = new Set<string>();
  for (const p of paints) {
    brands.add(p.brand);
    types.add(p.type);
    families.add(p.family);
    if (!ranges.has(p.range)) ranges.set(p.range, new Set());
    ranges.get(p.range)!.add(p.brand);
  }
  return {
    brands: [...brands].sort(),
    ranges,
    types: PAINT_TYPES.filter((t) => types.has(t)),
    families: COLOUR_FAMILIES.filter((f) => families.has(f)),
  };
}

export function PaintsBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Load the dataset from the static asset once on mount (null = still loading).
  const [paints, setPaints] = useState<BrowsePaint[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(BROWSE_INDEX_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<BrowsePaint[]>;
      })
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

  const loading = paints === null;
  const facets = useMemo(() => computeFacets(paints ?? []), [paints]);

  // Filters derived from the URL (shareable + back/forward friendly).
  const q = searchParams.get("q") ?? "";
  const selBrands = parseList(searchParams.get("brand"));
  const selRanges = parseList(searchParams.get("range"));
  // Validate against the known set — the param is user-editable in the URL.
  const selTypes = parseList(searchParams.get("type")).filter(
    (t): t is PaintType => (PAINT_TYPES as readonly string[]).includes(t),
  );
  const selFamilies = parseList(searchParams.get("family"));
  const includeDiscontinued = searchParams.get("disc") === "1";
  const sortParam = searchParams.get("sort");
  const sort: SortKey = SORTS.some((s) => s.value === sortParam)
    ? (sortParam as SortKey)
    : "name";

  // Local search text so typing stays snappy; committed to the URL (debounced).
  const [searchText, setSearchText] = useState(q);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const commit = (mut: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mut(params);
    applyParams(params);
  };

  const onSearchChange = (value: string) => {
    setSearchText(value);
    cancelSearchTimer();
    searchTimer.current = setTimeout(() => {
      const params = new URLSearchParams(searchParamsRef.current.toString());
      if (value) params.set("q", value);
      else params.delete("q");
      applyParams(params);
    }, 200);
  };

  // Clear any pending debounce on unmount.
  useEffect(() => () => cancelSearchTimer(), []);

  const toggleIn = (key: string, value: string) => {
    commit((p) => {
      const current = parseList(p.get(key));
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (next.length) p.set(key, next.join(","));
      else p.delete(key);
    });
  };

  const clearAll = () => {
    cancelSearchTimer();
    setSearchText("");
    router.replace(pathname, { scroll: false });
  };

  const results = filterPaints(
    paints ?? [],
    {
      search: q,
      brands: selBrands,
      ranges: selRanges,
      types: selTypes,
      families: selFamilies,
      includeDiscontinued,
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

  // Ranges scoped to selected brands (or all when none selected).
  const rangeEntries = [...facets.ranges.entries()];
  const rangeOptions = (
    selBrands.length
      ? rangeEntries.filter(([, brands]) =>
          selBrands.some((b) => brands.has(b)),
        )
      : rangeEntries
  )
    .map(([range]) => ({ value: range, label: range }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const activeFilterCount =
    selBrands.length +
    selRanges.length +
    selTypes.length +
    selFamilies.length +
    (includeDiscontinued ? 1 : 0) +
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
        options={facets.brands.map((b) => ({ value: b, label: b }))}
        selected={new Set(selBrands)}
        onToggle={(v) => toggleIn("brand", v)}
      />
      <FacetGroup
        title="Colour family"
        options={facets.families.map((f) => ({ value: f, label: f }))}
        selected={new Set(selFamilies)}
        onToggle={(v) => toggleIn("family", v)}
      />
      <FacetGroup
        title="Type"
        options={facets.types.map((t) => ({ value: t, label: t }))}
        selected={new Set(selTypes)}
        onToggle={(v) => toggleIn("type", v)}
      />
      <FacetGroup
        title="Range"
        options={rangeOptions}
        selected={new Set(selRanges)}
        onToggle={(v) => toggleIn("range", v)}
        defaultOpen={false}
      />
      <label className="flex cursor-pointer items-center gap-2 py-3 text-sm">
        <input
          type="checkbox"
          className="accent-[var(--primary)]"
          checked={includeDiscontinued}
          onChange={() =>
            commit((p) => {
              if (includeDiscontinued) p.delete("disc");
              else p.set("disc", "1");
            })
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
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name, brand, range or code…"
            aria-label="Search paints"
            className="w-full rounded-lg border border-input bg-card px-4 py-2.5 pl-10 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <svg
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="sort" className="sr-only">
            Sort
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(e) =>
              commit((p) => {
                if (e.target.value === "name") p.delete("sort");
                else p.set("sort", e.target.value);
              })
            }
            className="rounded-lg border border-input bg-card px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
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
