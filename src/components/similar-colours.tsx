"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { hexToLab } from "@/lib/color";
import { findSimilar } from "@/lib/paints/filter";
import { useBrowseIndex } from "@/hooks/use-browse-index";
import type { Paint, PaintType, PaintWithLab } from "@/lib/paints/types";
import { FacetGroup, type FacetOption } from "./facet-group";
import { MatchBadge } from "./match-badge";

export interface SimilarItem {
  paint: Paint;
  distance: number;
}

interface SimilarColoursProps {
  /** The paint these matches are for (used to re-rank when filtering). */
  target: Paint;
  /** Closest matches across all brands (precomputed, unfiltered default view). */
  all: SimilarItem[];
  /** Brands available to filter by (whole catalogue). */
  brands: string[];
  /** Paint types present in the catalogue. */
  types: PaintType[];
  /** Product ranges present in the catalogue. */
  ranges: string[];
}

type Metallic = "" | "only" | "exclude";

/** Minimal shape the list renders from (shared by precomputed + recomputed). */
type RenderItem = {
  id: string;
  hex: string;
  name: string;
  brand: string;
  range: string;
  distance: number;
};

const toRenderItems = (items: SimilarItem[]): RenderItem[] =>
  items.map(({ paint, distance }) => ({
    id: paint.id,
    hex: paint.hex,
    name: paint.name,
    brand: paint.brand,
    range: paint.range,
    distance,
  }));

const matchMetallic = (p: { metallic?: boolean }, m: Metallic) =>
  m === "" ? true : m === "only" ? !!p.metallic : !p.metallic;

// Minimum-match cutoffs, keyed to matchLabel()'s ΔE bands. Value is the upper
// (exclusive) ΔE bound; "all" removes the cap. Defaults to "Close or better",
// since looser matches aren't much use.
const MATCH_OPTIONS = [
  { value: "1", label: "Identical only" },
  { value: "2", label: "Near-perfect or better" },
  { value: "5", label: "Very close or better" },
  { value: "10", label: "Close or better" },
  { value: "20", label: "Similar or better" },
  { value: "all", label: "Show all" },
] as const;
const DEFAULT_MATCH = "10";

export function SimilarColours({
  target,
  all,
  brands,
  types,
  ranges,
}: SimilarColoursProps) {
  // Filter state (multi-select, mirroring the browse sidebar). Empty = no filter.
  const [selBrands, setSelBrands] = useState<Set<string>>(new Set());
  const [selTypes, setSelTypes] = useState<Set<string>>(new Set());
  const [selRanges, setSelRanges] = useState<Set<string>>(new Set());
  const [metallic, setMetallic] = useState<Metallic>("");
  const [minMatch, setMinMatch] = useState<string>(DEFAULT_MATCH);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Facet filters drive the re-rank; the match cutoff is a cheap post-filter on
  // distance, so it's tracked separately and never triggers a fetch/re-rank.
  const facetCount =
    selBrands.size + selTypes.size + selRanges.size + (metallic ? 1 : 0);
  const anyFilter = facetCount > 0;
  const matchActive = minMatch !== DEFAULT_MATCH;
  const activeCount = facetCount + (matchActive ? 1 : 0);
  const cutoff = minMatch === "all" ? Infinity : Number(minMatch);

  // The precomputed `all` list renders the unfiltered view instantly. The full
  // catalogue (with Lab) is fetched once so we can re-rank on filter AND grey out
  // facet options that would yield nothing. Initial render never waits on it.
  const { paints, loadError } = useBrowseIndex();
  // Recover the Lab triple (kept out of the shipped index) from hex. Stays null
  // on a load failure so the facet-availability pass below hides nothing.
  const dataset = useMemo<PaintWithLab[] | null>(
    () =>
      paints && !loadError
        ? paints.map((p) => ({ ...p, lab: hexToLab(p.hex) }))
        : null,
    [paints, loadError],
  );

  // Candidate universe: everything a match could be — non-discontinued and not
  // the paint itself. Filtering + availability both work from this.
  const universe = useMemo(
    () =>
      dataset
        ? dataset.filter((p) => p.id !== target.id && !p.discontinued)
        : null,
    [dataset, target.id],
  );

  const sel = useMemo(
    () => ({ brands: selBrands, types: selTypes, ranges: selRanges, metallic }),
    [selBrands, selTypes, selRanges, metallic],
  );

  // Which option values still yield results given the *other* selected facets
  // (the metallic finish always constrains). Null until the dataset loads, so
  // nothing is hidden before then.
  const availability = useMemo(() => {
    if (!universe) return null;
    const match = (p: PaintWithLab, skip: "brand" | "type" | "range") =>
      (skip === "brand" || !sel.brands.size || sel.brands.has(p.brand)) &&
      (skip === "type" || !sel.types.size || sel.types.has(p.type)) &&
      (skip === "range" || !sel.ranges.size || sel.ranges.has(p.range)) &&
      matchMetallic(p, sel.metallic);

    const brandSet = new Set<string>();
    const typeSet = new Set<string>();
    const rangeSet = new Set<string>();
    for (const p of universe) {
      if (match(p, "brand")) brandSet.add(p.brand);
      if (match(p, "type")) typeSet.add(p.type);
      if (match(p, "range")) rangeSet.add(p.range);
    }
    return { brandSet, typeSet, rangeSet };
  }, [universe, sel]);

  // Recompute the ranked list from the filtered subset when a filter is active.
  const computed = useMemo<RenderItem[] | null>(() => {
    if (!anyFilter || !universe) return null;
    const candidates = universe.filter(
      (p) =>
        (!selBrands.size || selBrands.has(p.brand)) &&
        (!selTypes.size || selTypes.has(p.type)) &&
        (!selRanges.size || selRanges.has(p.range)) &&
        matchMetallic(p, metallic),
    );
    const targetWithLab: PaintWithLab = {
      ...target,
      lab: hexToLab(target.hex),
      // family isn't needed by findSimilar; a placeholder keeps the type honest.
      family: "neutral",
    };
    return findSimilar(candidates, targetWithLab, { limit: 16 }).map(
      ({ paint, distance }) => ({
        id: paint.id,
        hex: paint.hex,
        name: paint.name,
        brand: paint.brand,
        range: paint.range,
        distance,
      }),
    );
  }, [anyFilter, universe, selBrands, selTypes, selRanges, metallic, target]);

  const items: RenderItem[] = (
    anyFilter ? (computed ?? []) : toRenderItems(all)
  ).filter((i) => i.distance < cutoff);
  // A filter is set but the dataset (and so the re-rank) isn't ready yet.
  const awaitingData = anyFilter && !universe && !loadError;

  const toggle =
    (setter: React.Dispatch<React.SetStateAction<Set<string>>>) =>
    (value: string) =>
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      });

  const clearAll = () => {
    setSelBrands(new Set());
    setSelTypes(new Set());
    setSelRanges(new Set());
    setMetallic("");
    setMinMatch(DEFAULT_MATCH);
  };

  // Show only values that still yield results given the other selections, plus
  // anything already selected so it can always be unticked.
  const visible = (
    values: string[],
    availSet: Set<string> | undefined,
    selected: Set<string>,
  ): FacetOption[] =>
    values
      .filter((v) => !availSet || availSet.has(v) || selected.has(v))
      .map((v) => ({ value: v, label: v }));

  const sidebar = (
    <div className="text-sm">
      <div className="flex items-center justify-between pb-2">
        <span className="font-semibold">Filter matches</span>
        {anyFilter || matchActive ? (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-primary hover:underline"
          >
            Clear all
          </button>
        ) : null}
      </div>
      <div className="border-b border-border py-3">
        <label htmlFor="similar-match" className="text-sm font-semibold">
          Minimum match
        </label>
        <select
          id="similar-match"
          value={minMatch}
          onChange={(e) => setMinMatch(e.target.value)}
          className="mt-2 w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {MATCH_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <FacetGroup
        title="Brand"
        options={visible(brands, availability?.brandSet, selBrands)}
        selected={selBrands}
        onToggle={toggle(setSelBrands)}
      />
      <FacetGroup
        title="Type"
        options={visible(types, availability?.typeSet, selTypes)}
        selected={selTypes}
        onToggle={toggle(setSelTypes)}
      />
      <div className="border-b border-border py-3">
        <span className="text-sm font-semibold">Finish</span>
        <div className="mt-2 flex flex-col gap-1">
          {(
            [
              { value: "", label: "All" },
              { value: "only", label: "Metallic" },
              { value: "exclude", label: "Non-metallic" },
            ] as const
          ).map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted"
            >
              <input
                type="radio"
                name="similar-finish"
                className="accent-[var(--primary)]"
                checked={metallic === o.value}
                onChange={() => setMetallic(o.value as Metallic)}
              />
              {o.label}
            </label>
          ))}
        </div>
      </div>
      <FacetGroup
        title="Range"
        options={visible(ranges, availability?.rangeSet, selRanges)}
        selected={selRanges}
        onToggle={toggle(setSelRanges)}
        defaultOpen={false}
      />
    </div>
  );

  return (
    <section aria-labelledby="similar-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="similar-heading" className="text-lg font-semibold">
          {target.name} alternatives
        </h2>
        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm md:hidden"
          aria-expanded={mobileOpen}
        >
          Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        Ranked by perceptual colour distance (CIEDE2000). Lower ΔE = closer match.
      </p>

      <div className="flex gap-6">
        <aside className="hidden w-56 shrink-0 md:block">{sidebar}</aside>
        {mobileOpen ? (
          <aside className="mb-4 w-full md:hidden">{sidebar}</aside>
        ) : null}

        <div className="min-w-0 flex-1">
          {loadError && anyFilter ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Couldn’t load the paint database to filter. Try refreshing the page.
            </div>
          ) : awaitingData ? (
            <ul
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              aria-hidden="true"
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <li
                  key={i}
                  className="h-[60px] animate-pulse rounded-lg border border-border bg-muted"
                />
              ))}
            </ul>
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No alternatives match these filters. Try widening them.
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/paints/${item.id}`}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className="h-10 w-10 shrink-0 rounded-md border border-border"
                      style={{ backgroundColor: item.hex }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {item.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.brand} · {item.range}
                      </span>
                    </span>
                    <MatchBadge distance={item.distance} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
