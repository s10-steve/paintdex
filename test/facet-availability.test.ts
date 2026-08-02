import { describe, it, expect } from "vitest";
import {
  computeAvailability,
  facetOptions,
  matchesFacets,
  type Facetable,
  type FacetSelection,
} from "@/lib/paints/facet-availability";
import { emptySharedFacets } from "@/lib/paints/filter-params";

const p = (
  brand: string,
  range: string,
  type: string,
  family: string,
  extra: { metallic?: boolean; discontinued?: boolean } = {},
): Facetable => ({ brand, range, type, family, ...extra });

const sel = (over: Partial<FacetSelection> = {}): FacetSelection => ({
  ...emptySharedFacets(),
  families: new Set(),
  ...over,
});

const POOL: Facetable[] = [
  p("Citadel", "Base", "base", "red"),
  p("Citadel", "Layer", "layer", "red"),
  p("Citadel", "Retro", "layer", "blue", { discontinued: true }),
  p("Vallejo", "Game Color", "layer", "blue"),
  p("Vallejo", "Metal Color", "metallic", "neutral", { metallic: true }),
];

describe("computeAvailability", () => {
  it("offers everything when nothing is selected", () => {
    const a = computeAvailability(POOL, sel());
    expect([...a.brands].sort()).toEqual(["Citadel", "Vallejo"]);
    expect([...a.types].sort()).toEqual(["base", "layer", "metallic"]);
    expect([...a.families].sort()).toEqual(["blue", "neutral", "red"]);
  });

  it("does not prune a facet's own list from its own selection", () => {
    // Ticking Citadel must not hide Vallejo, or you could never widen again.
    const a = computeAvailability(POOL, sel({ brands: new Set(["Citadel"]) }));
    expect([...a.brands].sort()).toEqual(["Citadel", "Vallejo"]);
  });

  it("prunes other facets by the current selection", () => {
    const a = computeAvailability(POOL, sel({ brands: new Set(["Vallejo"]) }));
    expect([...a.ranges].sort()).toEqual(["Game Color", "Metal Color"]);
    expect([...a.types].sort()).toEqual(["layer", "metallic"]);
    expect([...a.families].sort()).toEqual(["blue", "neutral"]);
  });

  it("honours the metallic finish in both directions", () => {
    const only = computeAvailability(POOL, sel({ metallic: "only" }));
    expect([...only.brands]).toEqual(["Vallejo"]);
    expect([...only.ranges]).toEqual(["Metal Color"]);

    const exclude = computeAvailability(POOL, sel({ metallic: "exclude" }));
    expect([...exclude.ranges]).not.toContain("Metal Color");
  });

  it("hides a discontinued-only range until discontinued are included", () => {
    // This is the property that keeps the facets and the results telling the same
    // story once a paint page gains the include-discontinued control.
    const hidden = computeAvailability(POOL, sel());
    expect([...hidden.ranges]).not.toContain("Retro");

    const shown = computeAvailability(POOL, sel({ includeDiscontinued: true }));
    expect([...shown.ranges]).toContain("Retro");
  });

  it("lets colour family participate, and skips it for its own list", () => {
    const a = computeAvailability(POOL, sel({ families: new Set(["red"]) }));
    expect([...a.brands]).toEqual(["Citadel"]);
    // Its own list stays whole.
    expect([...a.families].sort()).toEqual(["blue", "neutral", "red"]);
  });

  it("returns empty sets for an empty pool rather than throwing", () => {
    const a = computeAvailability([], sel());
    expect(a.brands.size).toBe(0);
    expect(a.ranges.size).toBe(0);
  });
});

describe("facetOptions", () => {
  const values = ["Citadel", "Vallejo", "Tamiya"];

  it("prunes nothing before the catalogue has loaded", () => {
    const out = facetOptions(values, null, new Set(), "brands");
    expect(out.map((o) => o.value)).toEqual(values);
  });

  it("keeps only available values once it has", () => {
    const out = facetOptions(values, new Set(["Citadel", "Tamiya"]), new Set(), "brands");
    expect(out.map((o) => o.value)).toEqual(["Citadel", "Tamiya"]);
  });

  it("always keeps a selected value, even when unavailable", () => {
    // Otherwise a filter you set becomes impossible to untick.
    const out = facetOptions(values, new Set(["Citadel"]), new Set(["Vallejo"]), "brands");
    expect(out.map((o) => o.value)).toEqual(["Citadel", "Vallejo"]);
  });

  it("follows the order of `values`, not the availability set", () => {
    // So PAINT_TYPES / COLOUR_FAMILIES ordering survives.
    const out = facetOptions(values, new Set(["Tamiya", "Citadel"]), new Set(), "brands");
    expect(out.map((o) => o.value)).toEqual(["Citadel", "Tamiya"]);
  });

  it("leaves a brand's own casing alone", () => {
    expect(facetOptions(["Citadel"], null, new Set(), "brands")).toEqual([
      { value: "Citadel", label: "Citadel" },
    ]);
  });

  it("title-cases the lowercase internal vocabularies", () => {
    // The label is the accessible name as well as the visible text — it used to
    // be cased by a CSS `capitalize`, which a screen reader can't see, so the
    // checkbox announced "oil" while showing "Oil".
    expect(facetOptions(["oil"], null, new Set(), "types")[0].label).toBe("Oil");
    expect(facetOptions(["red"], null, new Set(), "families")[0].label).toBe("Red");
    // The value stays the raw catalogue string — it's what goes back to toggle.
    expect(facetOptions(["oil"], null, new Set(), "types")[0].value).toBe("oil");
  });
});

/**
 * The shared facet predicate.
 *
 * There used to be three implementations of this rule — here, in
 * `filterPaints`, and hand-rolled in the alternatives panel — plus a verbatim
 * second copy of the metallic test. `facet-availability`'s header records that
 * computing availability separately is how `disc` and `family` came to mean
 * different things on the two pages; that fix covered which options are
 * *offered*, not which records are *kept*.
 */
describe("matchesFacets", () => {
  const sel = (over: Partial<FacetSelection> = {}): FacetSelection => ({
    brands: new Set(),
    ranges: new Set(),
    types: new Set(),
    families: new Set(),
    metallic: "",
    includeDiscontinued: false,
    ...over,
  });
  const p = {
    brand: "Citadel",
    range: "Base",
    type: "base",
    family: "red",
    discontinued: false,
    metallic: false,
  };

  it("keeps everything when nothing is selected", () => {
    expect(matchesFacets(p, sel())).toBe(true);
  });

  it("ANDs across facets and ORs within one", () => {
    expect(matchesFacets(p, sel({ brands: new Set(["Citadel", "Vallejo"]) }))).toBe(true);
    expect(matchesFacets(p, sel({ brands: new Set(["Vallejo"]) }))).toBe(false);
    // Brand matches, type doesn't.
    expect(
      matchesFacets(p, sel({ brands: new Set(["Citadel"]), types: new Set(["layer"]) })),
    ).toBe(false);
  });

  it("hides discontinued paints unless asked", () => {
    const gone = { ...p, discontinued: true };
    expect(matchesFacets(gone, sel())).toBe(false);
    expect(matchesFacets(gone, sel({ includeDiscontinued: true }))).toBe(true);
  });

  it("applies the metallic finish three ways", () => {
    const metal = { ...p, metallic: true };
    expect(matchesFacets(metal, sel({ metallic: "" }))).toBe(true);
    expect(matchesFacets(metal, sel({ metallic: "only" }))).toBe(true);
    expect(matchesFacets(metal, sel({ metallic: "exclude" }))).toBe(false);
    expect(matchesFacets(p, sel({ metallic: "only" }))).toBe(false);
  });

  it("leaves out the skipped facet, so it can't hide its own siblings", () => {
    const other = sel({ brands: new Set(["Vallejo"]) });
    expect(matchesFacets(p, other)).toBe(false);
    expect(matchesFacets(p, other, "brand")).toBe(true);
  });
});
