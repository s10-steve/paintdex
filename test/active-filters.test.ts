/**
 * The applied-filter summary.
 *
 * The chips are a second rendering of state the sidebar already shows, so what's
 * worth pinning is where the two could disagree: a chip for something that isn't
 * a filter (`sort`, `view`), a chip for a default (`disc=0`, the opening
 * `minMatch`), or a chip the page it's rendered on has no control to undo.
 */
import { describe, it, expect } from "vitest";
import {
  describeBrowseFilters,
  describeSimilarFilters,
} from "@/lib/paints/active-filters";
import {
  DEFAULT_MATCH,
  emptyBrowseParams,
  emptySimilarParams,
  type BrowseParamState,
  type SimilarParamState,
} from "@/lib/paints/filter-params";

const browse = (over: Partial<BrowseParamState> = {}): BrowseParamState => ({
  ...emptyBrowseParams(),
  ...over,
});

const similar = (over: Partial<SimilarParamState> = {}): SimilarParamState => ({
  ...emptySimilarParams(),
  ...over,
});

const labels = (chips: { label: string }[]) => chips.map((c) => c.label);
const keys = (chips: { key: string }[]) => chips.map((c) => c.key);

describe("describeBrowseFilters", () => {
  it("is empty for an unfiltered page", () => {
    expect(describeBrowseFilters(browse())).toEqual([]);
  });

  it("orders chips to match the sidebar's groups", () => {
    const chips = describeBrowseFilters(
      browse({
        brands: new Set(["Vallejo"]),
        families: new Set(["red"]),
        types: new Set(["oil"]),
        metallic: "only",
        ranges: new Set(["Model Color"]),
        includeDiscontinued: true,
        search: "ork flesh",
      }),
    );
    // Brand → family → type → finish → range → discontinued → search.
    expect(labels(chips)).toEqual([
      "Vallejo",
      "Red",
      "Oil",
      "Metallic only",
      "Model Color",
      "Including discontinued",
      "Search: ork flesh",
    ]);
  });

  it("keys a chip by facet and value so a page can hand it back to its toggle", () => {
    const chips = describeBrowseFilters(
      browse({ brands: new Set(["Citadel"]), types: new Set(["base"]) }),
    );
    // The key keeps the raw catalogue value; only the label is display-cased, so
    // a page can hand `value` straight back to its toggle.
    expect(keys(chips)).toEqual(["brands:Citadel", "types:base"]);
    expect(labels(chips)).toEqual(["Citadel", "Base"]);
    expect(chips[0]).toMatchObject({ kind: "brands", value: "Citadel" });
  });

  it("never emits a chip for sort — it's presentation, not a filter", () => {
    expect(describeBrowseFilters(browse({ sort: "lightness" }))).toEqual([]);
  });

  it("only chips discontinued when it's actually on", () => {
    // `disc=0` is the default. A chip for it would read "Excluding
    // discontinued" on a page nobody has filtered.
    expect(describeBrowseFilters(browse({ includeDiscontinued: false }))).toEqual(
      [],
    );
    expect(
      labels(describeBrowseFilters(browse({ includeDiscontinued: true }))),
    ).toEqual(["Including discontinued"]);
  });

  it("distinguishes the two metallic states", () => {
    expect(labels(describeBrowseFilters(browse({ metallic: "exclude" })))).toEqual(
      ["Non-metallic only"],
    );
  });
});

describe("describeSimilarFilters", () => {
  it("is empty for an unfiltered panel", () => {
    expect(describeSimilarFilters(similar())).toEqual([]);
  });

  it("never emits a chip for view — it's presentation, not a filter", () => {
    expect(describeSimilarFilters(similar({ view: "plot" }))).toEqual([]);
  });

  it("chips the ΔE cutoff by name, and only when it isn't the default", () => {
    expect(describeSimilarFilters(similar({ minMatch: DEFAULT_MATCH }))).toEqual(
      [],
    );
    // "Match: 2" would make the user translate a bound they only chose by name.
    expect(labels(describeSimilarFilters(similar({ minMatch: "2" })))).toEqual([
      "Match: Near-perfect or better",
    ]);
  });

  it("emits nothing for browse-only filters the panel can't undo", () => {
    // `q` and `family` ride along in the URL but are never applied here, so a
    // chip would offer to remove a filter that isn't doing anything — and the
    // panel has no control to restore it.
    const chips = describeSimilarFilters(
      similar({ brands: new Set(["Mig"]) }) as SimilarParamState,
    );
    expect(labels(chips)).toEqual(["Mig"]);
    expect(chips.some((c) => c.kind === "search" || c.kind === "families")).toBe(
      false,
    );
  });

  it("agrees with browse on the facets they share", () => {
    const shared = {
      brands: new Set(["Citadel"]),
      types: new Set(["shade"]),
      ranges: new Set(["Base"]),
      metallic: "only" as const,
      includeDiscontinued: true,
    };
    expect(labels(describeSimilarFilters(similar(shared)))).toEqual(
      labels(describeBrowseFilters(browse(shared))),
    );
  });
});
