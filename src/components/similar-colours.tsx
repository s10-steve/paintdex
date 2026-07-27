"use client";

import { useEffect, useMemo, useState } from "react";
import { hexToLab, labToLch } from "@/lib/color";
import { findSimilar } from "@/lib/paints/filter";
import {
  MAX_POINTS,
  pickScatterAxis,
  type ScatterAxis,
  type ScatterCandidate,
} from "@/lib/paints/scatter";
import { useBrowseIndex } from "@/hooks/use-browse-index";
import type { Paint, PaintType, PaintWithLab } from "@/lib/paints/types";
import { FacetGroup, type FacetOption } from "./facet-group";
import { SimilarList, SimilarListSkeleton, type RenderItem } from "./similar-list";
import { SimilarPlot } from "./similar-plot";

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
type View = "list" | "plot";

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

/** Query param carrying the view, so a plot link survives being shared. */
const VIEW_PARAM = "view";

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
  // Always starts on the list so the statically-generated HTML and the first
  // client render agree; a mount effect promotes it if ?view=plot is present.
  const [view, setView] = useState<View>("list");
  /** Null = follow the reference paint's chroma; set = the user chose. */
  const [axisChoice, setAxisChoice] = useState<ScatterAxis | null>(null);

  const targetLab = useMemo(() => hexToLab(target.hex), [target.hex]);
  const targetChroma = useMemo(() => labToLch(targetLab).c, [targetLab]);
  const axis = axisChoice ?? pickScatterAxis(targetChroma);

  // Read ?view= from the URL on mount rather than with useSearchParams, which
  // would force a Suspense boundary onto this statically-generated page.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    // The initial state has to match the prerendered HTML, so the URL can only be
    // honoured after hydration — same reason the scheme hooks gate on `mounted`.
    const wanted = new URL(window.location.href).searchParams.get(VIEW_PARAM);
    if (wanted === "plot") setView("plot");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const changeView = (next: View) => {
    setView(next);
    const url = new URL(window.location.href);
    // Empty = absent, matching how the browse page treats its params.
    if (next === "list") url.searchParams.delete(VIEW_PARAM);
    else url.searchParams.set(VIEW_PARAM, next);
    // replaceState, never router.replace — the latter is a no-op on a page that
    // was hard-loaded with query params. replace rather than push so Back still
    // means "back a page".
    window.history.replaceState(null, "", url);
  };

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

  // The one facet predicate both views rank through, so they can't drift apart.
  const candidatesFor = useMemo(
    () => (pool: PaintWithLab[]) =>
      pool.filter(
        (p) =>
          (!selBrands.size || selBrands.has(p.brand)) &&
          (!selTypes.size || selTypes.has(p.type)) &&
          (!selRanges.size || selRanges.has(p.range)) &&
          matchMetallic(p, metallic),
      ),
    [selBrands, selTypes, selRanges, metallic],
  );

  const targetWithLab = useMemo<PaintWithLab>(
    // family isn't needed by findSimilar; a placeholder keeps the type honest.
    () => ({ ...target, lab: targetLab, family: "neutral" }),
    [target, targetLab],
  );

  // Recompute the ranked list from the filtered subset when a filter is active.
  const computed = useMemo<RenderItem[] | null>(() => {
    if (!anyFilter || !universe) return null;
    return findSimilar(candidatesFor(universe), targetWithLab, { limit: 16 }).map(
      ({ paint, distance }) => ({
        id: paint.id,
        hex: paint.hex,
        name: paint.name,
        brand: paint.brand,
        range: paint.range,
        distance,
      }),
    );
  }, [anyFilter, universe, candidatesFor, targetWithLab]);

  /**
   * The plot's own candidate set, deliberately separate from the list's.
   *
   * The precomputed `.cache/similar-index.json` holds only the 16 nearest, which
   * span roughly ±5° of hue against ±11° for the top 60 — a vertical smear, not a
   * scatter. So the plot always re-ranks over the fetched index. It is not shared
   * with the list because the list's instant, fetch-free first render from `all`
   * is a real feature, and because the cached distances are rounded to 3dp, so a
   * client recompute can reorder ties and visibly reshuffle the default view.
   */
  const plotCandidates = useMemo<ScatterCandidate[] | null>(() => {
    if (view !== "plot" || !universe) return null;
    return findSimilar(candidatesFor(universe), targetWithLab, {
      limit: MAX_POINTS,
    })
      .filter(({ distance }) => distance < cutoff)
      .map(({ paint, distance }) => ({
        id: paint.id,
        name: paint.name,
        brand: paint.brand,
        range: paint.range,
        hex: paint.hex,
        lab: paint.lab,
        distance,
      }));
  }, [view, universe, candidatesFor, targetWithLab, cutoff]);

  const items: RenderItem[] = (
    anyFilter ? (computed ?? []) : toRenderItems(all)
  ).filter((i) => i.distance < cutoff);
  // The list only waits on the dataset when a filter forces a re-rank; the plot
  // always needs it.
  const awaitingData =
    !loadError && !universe && (view === "plot" || anyFilter);

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
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="View"
            className="inline-flex rounded-lg border border-input bg-card p-0.5"
          >
            {(
              [
                { value: "list", label: "List" },
                { value: "plot", label: "Plot" },
              ] as const
            ).map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={view === o.value}
                onClick={() => changeView(o.value)}
                className={`rounded-md px-2.5 py-1 text-sm ${
                  view === o.value
                    ? "bg-muted font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm md:hidden"
            aria-expanded={mobileOpen}
          >
            Filters{activeCount > 0 ? ` (${activeCount})` : ""}
          </button>
        </div>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        {view === "list"
          ? "Ranked by perceptual colour distance (CIEDE2000). Lower ΔE = closer match."
          : `Every alternative placed by how it differs from ${target.name} — across for ${
              axis === "hue" ? "hue" : "saturation"
            }, up for lightness.`}
      </p>

      <div className="flex gap-6">
        <aside className="hidden w-56 shrink-0 md:block">{sidebar}</aside>
        {mobileOpen ? (
          <aside className="mb-4 w-full md:hidden">{sidebar}</aside>
        ) : null}

        <div className="min-w-0 flex-1">
          {loadError && (anyFilter || view === "plot") ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Couldn’t load the paint database to{" "}
              {view === "plot" ? "build the plot" : "filter"}. Try refreshing the
              page.
            </div>
          ) : awaitingData ? (
            <SimilarListSkeleton />
          ) : view === "plot" ? (
            <SimilarPlot
              targetName={target.name}
              targetHex={target.hex}
              targetLab={targetLab}
              candidates={plotCandidates ?? []}
              axis={axis}
              axisOverridden={axisChoice !== null}
              onAxisChange={setAxisChoice}
              targetIsNeutral={pickScatterAxis(targetChroma) === "chroma"}
            />
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No alternatives match these filters. Try widening them.
            </div>
          ) : (
            <SimilarList items={items} />
          )}
        </div>
      </div>
    </section>
  );
}
