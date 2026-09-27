"use client";

import { useEffect, useMemo, useState } from "react";
import { hexToLab, labToLch } from "@/lib/color";
import {
  pickScatterAxis,
  type ScatterAxis,
  type ScatterCandidate,
} from "@/lib/paints/scatter";
import {
  DEFAULT_MATCH,
  MATCH_OPTIONS,
  SIMILAR_CLEARABLE,
  clearParams,
  collectionFilterLabel,
  effectiveFacets,
  emptySimilarParams,
  hasFacetFilter,
  isDefaultSimilarParams,
  matchCutoff,
  readSimilarParams,
  sanitiseSimilarParams,
  similarLinkQuery,
  writeSimilarParams,
  type MatchValue,
  type SimilarParamState,
  type SimilarView,
} from "@/lib/paints/filter-params";
import { facetOptions } from "@/lib/paints/facet-availability";
import { collectionIds } from "@/lib/paints/collection-filter";
import { useCollection } from "@/components/collection/collection-provider";
import {
  describeSimilarFilters,
  type ActiveFilterChip,
} from "@/lib/paints/active-filters";
import { useSimilarCandidates, NO_FAMILIES } from "@/hooks/use-similar-candidates";
import { PAINT_BINDERS, PAINT_FORMATS, type Paint, type PaintType } from "@/lib/paints/types";
import { ActiveFilters } from "./active-filters";
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

/**
 * Stable empty array for the plot's `candidates` prop. A fresh `[]` literal is a
 * new identity every render, which would invalidate `SimilarPlot`'s O(n²) layout
 * memo — unreachable today because `awaitingData` gates this branch, but one
 * condition away from being a real stall.
 */
const NO_CANDIDATES: ScatterCandidate[] = [];

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

  /**
   * What's actually applied, as opposed to what the URL says: `?mine=` only
   * takes part once there's a collection to take part — see `effectiveFacets`.
   * Everything that *reads* the filters (chips, counts, the pipeline) uses this;
   * everything that *writes* them uses `filters`, so nothing is lost from the URL.
   */
  const collection = useCollection();
  const collectionOn = collection.phase !== "off";
  const applied = useMemo(() => effectiveFacets(filters, collectionOn), [filters, collectionOn]);
  const inCollection =
    applied.mine && collection.phase === "ready"
      ? collectionIds(collection.entries, applied.mine)
      : null;
  const collectionPending = !!applied.mine && collection.phase === "loading";
  const collectionFailed = !!applied.mine && collection.phase === "failed";

  const { brands: selBrands, types: selTypes, ranges: selRanges } = applied;
  const { minMatch, view } = applied;

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
  // distance, so it never triggers a fetch/re-rank.
  const anyFilter = hasFacetFilter(applied);
  const cutoff = matchCutoff(minMatch);

  // The three derivations of "which paints count" — sidebar availability, the
  // re-ranked ΔE list, and the plot's own candidate set — live in their own hook.
  const { loadError, availability, computed, plotCandidates, awaitingData } =
    useSimilarCandidates({
      target,
      targetLab,
      filters: applied,
      cutoff,
      anyFilter,
      inCollection,
      collectionPending,
    });

  const items: RenderItem[] = useMemo(
    () =>
      (anyFilter ? (computed ?? []) : toRenderItems(all)).filter(
        (i) => i.distance < cutoff,
      ),
    [anyFilter, computed, all, cutoff],
  );
  const toggle =
    (key: "brands" | "types" | "formats" | "binders" | "ranges") =>
    (value: string) =>
      commit((prev) => {
        const next = new Set(prev[key]);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return { ...prev, [key]: next };
      });

  /**
   * The applied filters as chips, and the undo for one. Every branch reuses a
   * writer that already exists, so the summary is a second view of the filter
   * state and never a second way to write it.
   */
  const chips = describeSimilarFilters(applied);
  // The badge and the Clear-all gate are the chip list's length rather than
  // separate tallies, so the three can't disagree about what's applied.
  const activeCount = chips.length;
  const removeChip = (c: ActiveFilterChip) => {
    switch (c.kind) {
      case "mine":
        commit((prev) => ({ ...prev, mine: "" }));
        break;
      case "brands":
      case "ranges":
      case "types":
      case "formats":
      case "binders":
        toggle(c.kind)(c.value);
        break;
      case "metallic":
        commit((prev) => ({ ...prev, metallic: "" }));
        break;
      case "discontinued":
        commit((prev) => ({ ...prev, includeDiscontinued: false }));
        break;
      case "minMatch":
        commit((prev) => ({ ...prev, minMatch: DEFAULT_MATCH }));
        break;
      // Browse-only, and the panel has a control for neither — `q` and `family`
      // are carried in the URL but never applied here, so
      // `describeSimilarFilters` emits no chip the user couldn't act on.
      case "search":
      case "families":
        break;
    }
  };

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
    // Sanitised like every other write. Nothing survives clearing that could
    // name a dead brand today, but this was the one state-write path skipping
    // the healing the mount effect treats as mandatory.
    setFilters(sanitiseSimilarParams(readSimilarParams(cleared), { brands, ranges }));
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
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-primary hover:underline"
          >
            Clear all
          </button>
        ) : null}
      </div>
      {/* Above the groups, so what's applied is visible without scrolling. */}
      <ActiveFilters chips={chips} onRemove={removeChip} className="pb-3" />
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
          brands: facetOptions(brands, availability?.brands ?? null, selBrands, "brands"),
          ranges: facetOptions(ranges, availability?.ranges ?? null, selRanges, "ranges"),
          types: facetOptions(types, availability?.types ?? null, selTypes, "types"),
          formats: facetOptions(PAINT_FORMATS, availability?.formats ?? null, applied.formats, "formats"),
          binders: facetOptions(PAINT_BINDERS, availability?.binders ?? null, applied.binders, "binders"),
          families: [],
        }}
        selected={{ ...applied, families: NO_FAMILIES }}
        onToggle={(key, value) => {
          // The panel has no family group, so that key can never arrive.
          if (key !== "families") toggle(key)(value);
        }}
        onMetallic={(value) => commit((prev) => ({ ...prev, metallic: value }))}
        onDiscontinued={(value) =>
          commit((prev) => ({ ...prev, includeDiscontinued: value }))
        }
        // Hidden while "only paints I own" is on: your discontinued paints are
        // shown regardless, so the box would do nothing.
        show={{ family: false, discontinued: !applied.mine }}
        collection={
          collection.enabled
            ? {
                value: applied.mine,
                onChange: (value) => commit((prev) => ({ ...prev, mine: value })),
              }
            : undefined
        }
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
          {/* Mobile only, and only while the drawer is shut: the sidebar copy is
              unmounted there, so the chips inside it can't do their job. */}
          {mobileOpen ? null : (
            <ActiveFilters
              chips={chips}
              onRemove={removeChip}
              className="mb-3 md:hidden"
            />
          )}
          {collectionFailed ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              <p>
                Couldn’t load your paints to filter by them. Remove the “
                {collectionFilterLabel(applied.mine)}” filter to see every
                alternative, or try again.
              </p>
              <button
                type="button"
                onClick={() => void collection.reload()}
                className="mt-3 rounded-md border border-border px-3 py-1.5 font-medium text-foreground hover:bg-muted"
              >
                Try again
              </button>
            </div>
          ) : loadError && (anyFilter || view === "plot") ? (
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
              candidates={plotCandidates ?? NO_CANDIDATES}
              axis={axis}
              axisOverridden={axisChoice !== null}
              onAxisChange={setAxisChoice}
              targetIsNeutral={pickScatterAxis(targetChroma) === "chroma"}
            />
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {applied.mine
                ? "None of your paints match these filters. Try a looser minimum match."
                : "No alternatives match these filters. Try widening them."}
            </div>
          ) : (
            <SimilarList items={items} linkQuery={linkQuery} />
          )}
        </div>
      </div>
    </section>
  );
}
