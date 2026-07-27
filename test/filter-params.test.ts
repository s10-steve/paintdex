import { describe, it, expect } from "vitest";
import {
  DEFAULT_MATCH,
  MATCH_VALUES,
  emptySimilarParams,
  hasFacetFilter,
  isDefaultSimilarParams,
  matchCutoff,
  parseList,
  readSimilarParams,
  sanitiseSimilarParams,
  similarLinkQuery,
  writeSimilarParams,
  type SimilarParamState,
} from "@/lib/paints/filter-params";

const read = (qs: string) => readSimilarParams(new URLSearchParams(qs));
const write = (state: SimilarParamState, qs = "") =>
  writeSimilarParams(new URLSearchParams(qs), state).toString();

const state = (over: Partial<SimilarParamState> = {}): SimilarParamState => ({
  ...emptySimilarParams(),
  ...over,
});

describe("parseList", () => {
  it("returns nothing for an absent or empty param", () => {
    expect(parseList(null)).toEqual([]);
    expect(parseList("")).toEqual([]);
  });

  it("splits on commas and drops empties", () => {
    expect(parseList("Citadel")).toEqual(["Citadel"]);
    expect(parseList("Citadel,Vallejo")).toEqual(["Citadel", "Vallejo"]);
    expect(parseList("Citadel,,Vallejo,")).toEqual(["Citadel", "Vallejo"]);
  });
});

describe("readSimilarParams", () => {
  it("defaults to an unfiltered list view", () => {
    expect(read("")).toEqual(emptySimilarParams());
    expect(read("").minMatch).toBe(DEFAULT_MATCH);
    expect(read("").view).toBe("list");
  });

  it("reads the facets the browse page already uses", () => {
    const s = read("brand=Citadel,Vallejo&range=Base&type=layer,wash&metal=1");
    expect([...s.brands]).toEqual(["Citadel", "Vallejo"]);
    expect([...s.ranges]).toEqual(["Base"]);
    expect([...s.types]).toEqual(["layer", "wash"]);
    expect(s.metallic).toBe("only");
  });

  it("maps the metal flag both ways, and ignores anything else", () => {
    expect(read("metal=1").metallic).toBe("only");
    expect(read("metal=0").metallic).toBe("exclude");
    expect(read("metal=").metallic).toBe("");
    expect(read("metal=yes").metallic).toBe("");
    expect(read("").metallic).toBe("");
  });

  it("accepts every offered match value", () => {
    for (const v of MATCH_VALUES) expect(read(`match=${v}`).minMatch).toBe(v);
  });

  it("drops paint types that aren't in the vocabulary", () => {
    // A hand-edited or stale URL must not produce a filter nothing can satisfy.
    const s = read("type=layer,nonsense,wash");
    expect([...s.types]).toEqual(["layer", "wash"]);
    expect([...read("type=nonsense").types]).toEqual([]);
  });

  it("falls back to the default for an unknown match value", () => {
    expect(read("match=7").minMatch).toBe(DEFAULT_MATCH);
    expect(read("match=").minMatch).toBe(DEFAULT_MATCH);
  });

  it("only recognises plot as a non-default view", () => {
    expect(read("view=plot").view).toBe("plot");
    expect(read("view=list").view).toBe("list");
    expect(read("view=grid").view).toBe("list");
  });

  it("keeps brands and ranges it can't validate", () => {
    // They can't be checked without importing the catalogue; a stale one simply
    // matches nothing and the sidebar still lets you untick it.
    expect([...read("brand=Nonexistent Paints").brands]).toEqual([
      "Nonexistent Paints",
    ]);
  });
});

describe("writeSimilarParams", () => {
  it("writes nothing for a default state", () => {
    expect(write(state())).toBe("");
  });

  it("omits a default match and a list view", () => {
    expect(write(state({ minMatch: DEFAULT_MATCH, view: "list" }))).toBe("");
    expect(write(state({ minMatch: "5" }))).toContain("match=5");
    expect(write(state({ view: "plot" }))).toContain("view=plot");
  });

  it("deletes a facet param rather than writing an empty one", () => {
    const cleared = write(state(), "brand=Citadel&type=layer&metal=1&match=5");
    expect(cleared).toBe("");
  });

  it("is order-independent, so the same selection shares the same link", () => {
    const a = state({ brands: new Set(["Vallejo", "Citadel"]) });
    const b = state({ brands: new Set(["Citadel", "Vallejo"]) });
    expect(write(a)).toBe(write(b));
  });

  it("leaves params it does not own alone", () => {
    const out = write(state({ brands: new Set(["Citadel"]) }), "preset=foo");
    const params = new URLSearchParams(out);
    expect(params.get("preset")).toBe("foo");
    expect(params.get("brand")).toBe("Citadel");
  });

  it("does not mutate the params it was given", () => {
    const input = new URLSearchParams("brand=Citadel");
    writeSimilarParams(input, state());
    expect(input.toString()).toBe("brand=Citadel");
  });
});

describe("round-trip", () => {
  const cases: [string, SimilarParamState][] = [
    ["empty", state()],
    ["one brand", state({ brands: new Set(["Citadel"]) })],
    ["two brands", state({ brands: new Set(["Citadel", "Vallejo"]) })],
    ["metallic only", state({ metallic: "only" })],
    ["metallic excluded", state({ metallic: "exclude" })],
    ["plot view", state({ view: "plot" })],
    ["tight cutoff", state({ minMatch: "2" })],
    ["no cutoff", state({ minMatch: "all" })],
    [
      "everything at once",
      state({
        brands: new Set(["AK Interactive", "Army Painter"]),
        types: new Set(["layer", "wash"]),
        ranges: new Set(["D&D Nolzur's Marvelous Pigments", "Warpaints"]),
        metallic: "exclude",
        minMatch: "20",
        view: "plot",
      }),
    ],
  ];

  for (const [name, original] of cases) {
    it(`survives write then read: ${name}`, () => {
      expect(readSimilarParams(writeSimilarParams(new URLSearchParams(), original)))
        .toEqual(original);
    });
  }

  it("survives values with ampersands, apostrophes and spaces", () => {
    // The real worst case in the catalogue.
    const original = state({
      ranges: new Set(["D&D Nolzur's Marvelous Pigments Primer"]),
      brands: new Set(["Army Painter"]),
    });
    const qs = similarLinkQuery(original);
    expect(qs.startsWith("?")).toBe(true);
    // Parsed back through a full URL, the way the component actually reads it.
    const url = new URL(`https://paintdex.app/paints/x${qs}`);
    expect(readSimilarParams(url.searchParams)).toEqual(original);
  });
});

describe("similarLinkQuery", () => {
  it("is empty for a default state, so ordinary links stay clean", () => {
    expect(similarLinkQuery(state())).toBe("");
  });

  it("is a ?-prefixed query when anything is set", () => {
    expect(similarLinkQuery(state({ brands: new Set(["Vallejo"]) }))).toBe(
      "?brand=Vallejo",
    );
  });

  it("carries the view alongside the filters", () => {
    const qs = similarLinkQuery(
      state({ brands: new Set(["Vallejo"]), view: "plot" }),
    );
    const params = new URLSearchParams(qs.slice(1));
    expect(params.get("brand")).toBe("Vallejo");
    expect(params.get("view")).toBe("plot");
  });
});

describe("hasFacetFilter", () => {
  it("ignores the match cutoff, which post-filters rather than re-ranking", () => {
    expect(hasFacetFilter(state({ minMatch: "2" }))).toBe(false);
    expect(hasFacetFilter(state({ view: "plot" }))).toBe(false);
  });

  it("is true for any facet", () => {
    expect(hasFacetFilter(state({ brands: new Set(["Citadel"]) }))).toBe(true);
    expect(hasFacetFilter(state({ types: new Set(["layer"]) }))).toBe(true);
    expect(hasFacetFilter(state({ ranges: new Set(["Base"]) }))).toBe(true);
    expect(hasFacetFilter(state({ metallic: "only" }))).toBe(true);
  });
});

describe("matchCutoff", () => {
  it("turns the select's value into a ΔE bound", () => {
    expect(matchCutoff("10")).toBe(10);
    expect(matchCutoff("all")).toBe(Infinity);
  });
});

describe("isDefaultSimilarParams", () => {
  it("is true for a clean state, so a param-free page can skip the restore", () => {
    expect(isDefaultSimilarParams(state())).toBe(true);
    expect(isDefaultSimilarParams(read(""))).toBe(true);
  });

  it("is false for anything the URL could be carrying", () => {
    expect(isDefaultSimilarParams(state({ brands: new Set(["Citadel"]) }))).toBe(false);
    expect(isDefaultSimilarParams(state({ types: new Set(["layer"]) }))).toBe(false);
    expect(isDefaultSimilarParams(state({ ranges: new Set(["Base"]) }))).toBe(false);
    expect(isDefaultSimilarParams(state({ metallic: "only" }))).toBe(false);
    expect(isDefaultSimilarParams(state({ minMatch: "2" }))).toBe(false);
    expect(isDefaultSimilarParams(state({ view: "plot" }))).toBe(false);
  });

  it("ignores params it doesn't own", () => {
    expect(isDefaultSimilarParams(read("utm_source=newsletter"))).toBe(true);
  });
});

describe("sanitiseSimilarParams", () => {
  const known = { brands: ["Citadel", "Vallejo"], ranges: ["Base", "Layer"] };

  it("keeps values that still exist", () => {
    const s = sanitiseSimilarParams(
      state({ brands: new Set(["Citadel"]), ranges: new Set(["Base"]) }),
      known,
    );
    expect([...s.brands]).toEqual(["Citadel"]);
    expect([...s.ranges]).toEqual(["Base"]);
  });

  it("drops a brand that has left the catalogue", () => {
    // Otherwise it's an invisible active filter: no checkbox to untick, zero
    // results, and no explanation.
    const s = sanitiseSimilarParams(
      state({ brands: new Set(["Citadel", "Gone Paints Ltd"]) }),
      known,
    );
    expect([...s.brands]).toEqual(["Citadel"]);
  });

  it("drops an unknown range and can empty the filter entirely", () => {
    const s = sanitiseSimilarParams(state({ ranges: new Set(["Discontinued"]) }), known);
    expect([...s.ranges]).toEqual([]);
    expect(isDefaultSimilarParams(s)).toBe(true);
  });

  it("leaves the other fields alone", () => {
    const s = sanitiseSimilarParams(
      state({ metallic: "only", minMatch: "2", view: "plot", types: new Set(["layer"]) }),
      known,
    );
    expect(s.metallic).toBe("only");
    expect(s.minMatch).toBe("2");
    expect(s.view).toBe("plot");
    expect([...s.types]).toEqual(["layer"]);
  });
});

describe("comma-joining is safe for the real catalogue", () => {
  /**
   * Drift guard, in the spirit of `presets.test.ts`. Multi-value facets are
   * comma-joined to match the browse page's URL format, which only works because
   * no brand or range name contains a comma. If one ever does, a single filter
   * would silently split into two bogus ones — so fail loudly here instead.
   */
  it("has no comma in any brand or range name", async () => {
    const { getAllPaints } = await import("@/lib/paints/load");
    const offenders = new Set<string>();
    for (const p of getAllPaints()) {
      if (p.brand.includes(",")) offenders.add(`brand: ${p.brand}`);
      for (const r of p.ranges ?? [p.range]) {
        if (r.includes(",")) offenders.add(`range: ${r}`);
      }
    }
    expect([...offenders]).toEqual([]);
  });

  it("round-trips every real brand and range name through the URL", () => {
    // Ampersands, apostrophes and accents all appear in real range names.
    const tricky = [
      "Army Painter",
      "D&D Nolzur's Marvelous Pigments Primer",
      "Fantasy & Games Range",
      "Weathering & Accents",
    ];
    const original = state({
      brands: new Set(["AK Interactive"]),
      ranges: new Set(tricky),
    });
    const url = new URL(`https://paintdex.app/paints/x${similarLinkQuery(original)}`);
    expect(readSimilarParams(url.searchParams)).toEqual(original);
  });
});
