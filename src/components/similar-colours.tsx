"use client";

import { useEffect, useMemo, useState } from "react";
import { hexToLab, labToLch } from "@/lib/color";
import { findSimilar } from "@/lib/paints/filter";
import {
  pickScatterAxis,
  type ScatterAxis,
  type ScatterCandidate,
} from "@/lib/paints/scatter";
import {
  DEFAULT_MATCH,
  SIMILAR_CLEARABLE,
  clearParams,
  emptySimilarParams,
  hasFacetFilter,
  isDefaultSimilarParams,
  matchCutoff,
  readSimilarParams,
  sanitiseSimilarParams,
  similarLinkQuery,
  writeSimilarParams,
  type MatchValue,
  type MetallicFilter,
  type SimilarParamState,
  type SimilarView,
} from "@/lib/paints/filter-params";
import { withLab } from "@/lib/paints/lab-index";
import {
  computeAvailability,
  facetOptions,
} from "@/lib/paints/facet-availability";
import { useBrowseIndex } from "@/hooks/use-browse-index";
import type { Paint, PaintType, PaintWithLab } from "@/lib/paints/types";
import { PaintFacets } from "./paint-facets";
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

const toRenderItems = (items: SimilarItem[]): RenderItem[] =>
  items.map(({ paint, distance }) => ({
    id: paint.id,
    hex: paint.hex,
    name: paint.name,
    brand: paint.brand,
    range: paint.range,
    distance,
  }));

/** The panel has no colour-family control, so it never narrows by family. */
const NO_FAMILIES: Set<string> = new Set();

const matchMetallic = (p: { metallic?: boolean }, m: MetallicFilter) =>
  m === "" ? true : m === "only" ? !!p.metallic : !p.metallic;

/** Labels for the ΔE cutoffs in `MATCH_VALUES` order. */
const MATCH_OPTIONS = [
  { value: "1", label: "Identical only" },
  { value: "2", label: "Near-perfect or better" },
  { value: "5", label: "Very close or better" },
  { value: "10", label: "Close or better" },
  { value: "20", label: "Similar or better" },
  { value: "all", label: "Show all" },
] as const;

export function SimilarColours({
  target,
  all,
  brands,
  types,
  ranges,
}: SimilarColoursProps) {
  /**
   * Filter state, held as one object because it is also the URL's contents: the
   * facets, the ΔE cutoff and the view all serialise together, and splitting them
   * across separate `useState`s let the URL and the panel drift apart.
   *
   * Always starts at the defaults so the statically-generated HTML and the first
   * client render agree; the mount effect below adopts whatever the URL carries.
   */
  const [filters, setFilters] = useState<SimilarParamState>(emptySimilarParams);
  const [mobileOpen, setMobileOpen] = useState(false);
  /** Null = follow the reference paint's chroma; set = the user chose. */
  const [axisChoice, setAxisChoice] = useState<ScatterAxis | null>(null);
  /**
   * The params this page arrived with, captured once at mount.
   *
   * Needed so outgoing links carry the browse-only params the panel holds but
   * never applies (`q`, `family`, `sort`) — otherwise a trip back to browse after
   * clicking through would have lost them. Null until mount, which is what keeps
   * the prerendered hrefs clean; the panel never writes these params, so a single
   * capture stays accurate.
   */
  const [liveParams, setLiveParams] = useState<URLSearchParams | null>(null);

  const { brands: selBrands, types: selTypes, ranges: selRanges } = filters;
  const { metallic, minMatch, view, includeDiscontinued } = filters;

  const targetLab = useMemo(() => hexToLab(target.hex), [target.hex]);
  const targetChroma = useMemo(() => labToLch(targetLab).c, [targetLab]);
  const axis = axisChoice ?? pickScatterAxis(targetChroma);

  // Adopt the filters the URL carries. Read from `window.location` rather than
  // `useSearchParams`, which would force a Suspense boundary onto this
  // statically-generated page.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    // The initial state has to match the prerendered HTML, so the URL can only be
    // honoured after hydration — same reason the scheme hooks gate on `mounted`.
    // This runs again on every paint-to-paint navigation, which is what makes a
    // filter survive clicking through: the links carry it and this picks it up.
    //
    // Rejected: a <Suspense> boundary plus `useSearchParams`, which would give a
    // filtered *first* render. It would also push the whole alternatives section
    // out of the prerendered HTML on all 4,961 pages — costing every visitor the
    // documented instant, fetch-free first render, and the crawlable ΔE list with
    // it — to spare one frame for the few arriving with params.
    const url = new URL(window.location.href);
    setLiveParams(url.searchParams);
    const raw = readSimilarParams(url.searchParams);
    const fromUrl = sanitiseSimilarParams(raw, { brands, ranges });
    // Skip the write entirely for a param-free page, which is nearly all of them:
    // that path then renders exactly as it did before filters were shareable.
    if (!isDefaultSimilarParams(fromUrl)) setFilters(fromUrl);

    // Heal the URL when sanitising dropped something — a brand that has left the
    // catalogue, say. Without this the address bar keeps advertising a filter that
    // isn't applied and that the outgoing links don't carry, so re-sharing the
    // page would pass on a dead param.
    const healed = writeSimilarParams(url.searchParams, fromUrl).toString();
    if (healed !== url.searchParams.toString()) {
      window.history.replaceState(
        null,
        "",
        healed ? `${url.pathname}?${healed}` : url.pathname,
      );
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // Mount-only. `brands`/`ranges` come from the static build and never change
    // for a given paint page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The single place filter state reaches the URL. Every control goes through it,
   * so the address bar can never disagree with the sidebar.
   *
   * `replaceState`, never `router.replace` — the latter is a no-op on a page that
   * was hard-loaded with query params. And replace rather than push so ticking
   * four facets doesn't cost four Back presses; moving between paints still
   * pushes history, because that's a real <Link>.
   */
  /** Set the state and mirror it into the URL. The one path from control to URL. */
  const writeUrl = (next: SimilarParamState) => {
    setFilters(next);
    const url = new URL(window.location.href);
    const qs = writeSimilarParams(url.searchParams, next).toString();
    window.history.replaceState(
      null,
      "",
      qs ? `${url.pathname}?${qs}` : url.pathname,
    );
  };

  const commit = (mut: (prev: SimilarParamState) => SimilarParamState) => {
    // Computed outside the updater on purpose. `replaceState` is a side effect, and
    // updaters must stay pure — StrictMode double-invokes them and a concurrent
    // re-base can re-run them. `paints-browser`'s commit has the same shape.
    writeUrl(mut(filters));
  };

  /** Query string appended to every match's href so the filters follow the click. */
  const linkQuery = similarLinkQuery(filters, liveParams ?? undefined);

  // Facet filters drive the re-rank; the match cutoff is a cheap post-filter on
  // distance, so it's tracked separately and never triggers a fetch/re-rank.
  const facetCount =
    selBrands.size +
    selTypes.size +
    selRanges.size +
    (metallic ? 1 : 0) +
    (includeDiscontinued ? 1 : 0);
  const anyFilter = hasFacetFilter(filters);
  const matchActive = minMatch !== DEFAULT_MATCH;
  const activeCount = facetCount + (matchActive ? 1 : 0);
  const cutoff = matchCutoff(minMatch);

  // The precomputed `all` list renders the unfiltered view instantly. The full
  // catalogue (with Lab) is fetched once so we can re-rank on filter AND grey out
  // facet options that would yield nothing. Initial render never waits on it.
  const { paints, loadError } = useBrowseIndex();
  // Recover the Lab triple (kept out of the shipped index) from hex. Memoized at
  // module scope by `withLab`, not just here: this useMemo dies with the component,
  // and re-deriving Lab for 4,961 records on every paint-to-paint navigation costs
  // more than the JSON parse the fetch cache already saves. Stays null on a load
  // failure so the facet-availability pass below hides nothing.
  const dataset = useMemo<PaintWithLab[] | null>(
    () => (paints && !loadError ? withLab(paints) : null),
    [paints, loadError],
  );

  // Candidate universe: everything a match could be. Filtering *and* availability
  // both work from this, which is why the discontinued rule is a gate here rather
  // than being deleted and applied only to the results — otherwise the sidebar
  // would offer a range whose only members the results exclude.
  const universe = useMemo(
    () =>
      dataset
        ? dataset.filter(
            (p) =>
              p.id !== target.id &&
              (includeDiscontinued || !p.discontinued),
          )
        : null,
    [dataset, target.id, includeDiscontinued],
  );

  // Which option values still yield results given the *other* selected facets.
  // Null until the dataset loads, so nothing is hidden before then. Shared with
  // browse so the two sidebars can't prune differently.
  const availability = useMemo(
    () =>
      universe
        ? computeAvailability(universe, { ...filters, families: NO_FAMILIES })
        : null,
    [universe, filters],
  );

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
    return findSimilar(candidatesFor(universe), targetWithLab, {
      limit: 16,
      excludeDiscontinued: !includeDiscontinued,
    }).map(
      ({ paint, distance }) => ({
        id: paint.id,
        hex: paint.hex,
        name: paint.name,
        brand: paint.brand,
        range: paint.range,
        distance,
      }),
    );
  }, [anyFilter, universe, candidatesFor, targetWithLab, includeDiscontinued]);

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
    // No `limit` here: capping before `layoutScatter` made `omittedCount` count
    // only what this call dropped, so the caption reported "60 of 120" when Agrax
    // Earthshade really has ~350 inside the cutoff. `findSimilar` sorts the whole
    // candidate list regardless of `limit`, so passing everything costs no extra
    // sort, and `layoutScatter` applies both caps and reports them honestly.
    return findSimilar(candidatesFor(universe), targetWithLab, {
      limit: Infinity,
      excludeDiscontinued: !includeDiscontinued,
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
  }, [
    view,
    universe,
    candidatesFor,
    targetWithLab,
    cutoff,
    includeDiscontinued,
  ]);

  const items: RenderItem[] = (
    anyFilter ? (computed ?? []) : toRenderItems(all)
  ).filter((i) => i.distance < cutoff);
  // The list only waits on the dataset when a filter forces a re-rank; the plot
  // always needs it.
  const awaitingData =
    !loadError && !universe && (view === "plot" || anyFilter);

  const toggle =
    (key: "brands" | "types" | "ranges") =>
    (value: string) =>
      commit((prev) => {
        const next = new Set(prev[key]);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return { ...prev, [key]: next };
      });

  // Clears the URL too — the point of the escape hatch is that the filter stops
  // following you, which it wouldn't if the params outlived the sidebar state.
  /**
   * Clear the controls in front of you, preserve everything else.
   *
   * Goes through the same `SIMILAR_CLEARABLE` key list browse uses, rather than
   * writing an empty state: one documented rule, one mechanism. `view` survives
   * because it isn't in the list — exactly how `sort` survives on browse — and so
   * does an inbound `q`/`family` the panel gives the user no way to restore.
   */
  const clearAll = () => {
    const url = new URL(window.location.href);
    const cleared = clearParams(url.searchParams, SIMILAR_CLEARABLE);
    setFilters(readSimilarParams(cleared));
    const qs = cleared.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `${url.pathname}?${qs}` : url.pathname,
    );
  };

  /**
   * Both copies of the sidebar are in the DOM at once — the desktop one is
   * `hidden md:block`, not unmounted — so anything with an `id` needs a distinct
   * one per copy. `useId` can't do it: this is one JSX value rendered twice, so a
   * single component instance and therefore a single generated id. Hence the
   * explicit suffix. (`PaintFacets` is a real component, so its own `useId` does
   * give the two copies distinct radio-group names.)
   */
  const sidebar = (copy: string) => (
    <div className="text-sm">
      <div className="flex items-center justify-between pb-2">
        <span className="font-semibold">Filters</span>
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
        <label htmlFor={`similar-match-${copy}`} className="text-sm font-semibold">
          Minimum match
        </label>
        <select
          id={`similar-match-${copy}`}
          value={minMatch}
          onChange={(e) =>
            commit((prev) => ({
              ...prev,
              minMatch: e.target.value as MatchValue,
            }))
          }
          className="mt-2 w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {MATCH_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <PaintFacets
        options={{
          brands: facetOptions(brands, availability?.brands ?? null, selBrands),
          ranges: facetOptions(ranges, availability?.ranges ?? null, selRanges),
          types: facetOptions(types, availability?.types ?? null, selTypes),
          families: [],
        }}
        selected={{ ...filters, families: NO_FAMILIES }}
        onToggle={(key, value) => {
          // The panel has no family group, so that key can never arrive.
          if (key !== "families") toggle(key)(value);
        }}
        onMetallic={(value) => commit((prev) => ({ ...prev, metallic: value }))}
        onDiscontinued={(value) =>
          commit((prev) => ({ ...prev, includeDiscontinued: value }))
        }
        show={{ family: false }}
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
                onClick={() =>
                  commit((prev) => ({ ...prev, view: o.value as SimilarView }))
                }
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
        <aside className="hidden w-56 shrink-0 md:block">{sidebar("desktop")}</aside>
        {mobileOpen ? (
          <aside className="mb-4 w-full md:hidden">{sidebar("mobile")}</aside>
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
              linkQuery={linkQuery}
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
            <SimilarList items={items} linkQuery={linkQuery} />
          )}
        </div>
      </div>
    </section>
  );
}
