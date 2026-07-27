import { describe, it, expect } from "vitest";
import {
  computeAvailability,
  facetOptions,
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
    const out = facetOptions(values, null, new Set());
    expect(out.map((o) => o.value)).toEqual(values);
  });

  it("keeps only available values once it has", () => {
    const out = facetOptions(values, new Set(["Citadel", "Tamiya"]), new Set());
    expect(out.map((o) => o.value)).toEqual(["Citadel", "Tamiya"]);
  });

  it("always keeps a selected value, even when unavailable", () => {
    // Otherwise a filter you set becomes impossible to untick.
    const out = facetOptions(values, new Set(["Citadel"]), new Set(["Vallejo"]));
    expect(out.map((o) => o.value)).toEqual(["Citadel", "Vallejo"]);
  });

  it("follows the order of `values`, not the availability set", () => {
    // So PAINT_TYPES / COLOUR_FAMILIES ordering survives.
    const out = facetOptions(values, new Set(["Tamiya", "Citadel"]), new Set());
    expect(out.map((o) => o.value)).toEqual(["Citadel", "Tamiya"]);
  });

  it("labels each option with its own value", () => {
    expect(facetOptions(["Citadel"], null, new Set())).toEqual([
      { value: "Citadel", label: "Citadel" },
    ]);
  });
});
