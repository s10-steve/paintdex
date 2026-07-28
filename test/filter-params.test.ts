import { describe, it, expect } from "vitest";
import {
  BROWSE_CLEARABLE,
  DEFAULT_MATCH,
  DEFAULT_SORT,
  MATCH_VALUES,
  SIMILAR_CLEARABLE,
  TRAVEL_PARAMS,
  clearParams,
  emptyBrowseParams,
  emptySharedFacets,
  hasSharedFacet,
  parseDisc,
  parseFamilies,
  parseSort,
  readBrowseParams,
  readSharedFacets,
  travelParams,
  travelQuery,
  writeBrowseParams,
  type BrowseParamState,
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

/* ============ the shared vocabulary: browse + paint page together ============ */

const readBrowse = (qs: string) => readBrowseParams(new URLSearchParams(qs));
const browseState = (over: Partial<BrowseParamState> = {}): BrowseParamState => ({
  ...emptyBrowseParams(),
  ...over,
});
const writeBrowse = (s: BrowseParamState, qs = "") =>
  writeBrowseParams(new URLSearchParams(qs), s).toString();

describe("the new codecs", () => {
  it("reads disc as a strict 1", () => {
    expect(parseDisc("1")).toBe(true);
    for (const v of ["0", "true", "yes", "", null]) expect(parseDisc(v)).toBe(false);
  });

  it("validates colour families against the vocabulary", () => {
    expect(parseFamilies("red,neutral")).toEqual(["red", "neutral"]);
    expect(parseFamilies("red,nonsense")).toEqual(["red"]);
    // Case-sensitive, like every other closed vocabulary here.
    expect(parseFamilies("RED")).toEqual([]);
  });

  it("falls back to the default sort for anything unknown", () => {
    expect(parseSort("brand")).toBe("brand");
    expect(parseSort("lightness")).toBe("lightness");
    for (const v of ["name", "relevance", "", null]) expect(parseSort(v)).toBe(DEFAULT_SORT);
  });
});

describe("readSharedFacets", () => {
  it("is exactly the intersection of the two page readers", () => {
    // The guard against the two state shapes drifting apart.
    const qs = "brand=Citadel,Vallejo&range=Base&type=layer&metal=0&disc=1";
    const shared = readSharedFacets(new URLSearchParams(qs));
    const fromBrowse = readBrowse(qs);
    const fromPanel = read(qs);
    for (const key of Object.keys(shared) as (keyof typeof shared)[]) {
      expect(fromBrowse[key]).toEqual(shared[key]);
      expect(fromPanel[key]).toEqual(shared[key]);
    }
  });

  it("reads the discontinued flag", () => {
    expect(readSharedFacets(new URLSearchParams("disc=1")).includeDiscontinued).toBe(true);
    expect(readSharedFacets(new URLSearchParams("")).includeDiscontinued).toBe(false);
  });
});

describe("hasSharedFacet", () => {
  it("counts an explicit include-discontinued", () => {
    expect(hasSharedFacet({ ...emptySharedFacets(), includeDiscontinued: true })).toBe(true);
  });

  it("does NOT count the default, which would cost every paint page its first render", () => {
    expect(hasSharedFacet(emptySharedFacets())).toBe(false);
    expect(hasSharedFacet({ ...emptySharedFacets(), includeDiscontinued: false })).toBe(false);
  });

  it("ignores browse-only and panel-only controls", () => {
    expect(hasSharedFacet(browseState({ search: "red", sort: "brand" }))).toBe(false);
    expect(hasSharedFacet(browseState({ families: new Set(["red"]) }))).toBe(false);
    expect(hasSharedFacet(state({ minMatch: "2", view: "plot" }))).toBe(false);
  });
});

describe("carried but not applied", () => {
  it("leaves a paint page's default state untouched by browse-only params", () => {
    // THE load-bearing property: arriving from a family-filtered browse must not
    // flip the panel off its fetch-free precomputed first render.
    const s = read("q=red&family=red&sort=brand&utm_source=x");
    expect(isDefaultSimilarParams(s)).toBe(true);
  });

  it("preserves q/family/sort through a panel write", () => {
    const out = write(state({ brands: new Set(["Vallejo"]) }), "q=red&family=red&sort=brand");
    const params = new URLSearchParams(out);
    expect(params.get("q")).toBe("red");
    expect(params.get("family")).toBe("red");
    expect(params.get("sort")).toBe("brand");
    expect(params.get("brand")).toBe("Vallejo");
  });

  it("preserves match/view through a browse write", () => {
    const out = writeBrowse(browseState({ brands: new Set(["Vallejo"]) }), "match=2&view=plot");
    const params = new URLSearchParams(out);
    expect(params.get("match")).toBe("2");
    expect(params.get("view")).toBe("plot");
    expect(params.get("brand")).toBe("Vallejo");
  });
});

describe("writeBrowseParams", () => {
  it("writes nothing for a default browse state", () => {
    expect(writeBrowse(browseState())).toBe("");
  });

  it("omits the default sort, like the default match", () => {
    expect(writeBrowse(browseState({ sort: DEFAULT_SORT }))).toBe("");
    expect(writeBrowse(browseState({ sort: "brand" }))).toContain("sort=brand");
  });

  it("trims and omits an empty search", () => {
    expect(writeBrowse(browseState({ search: "   " }))).toBe("");
    expect(new URLSearchParams(writeBrowse(browseState({ search: " red " }))).get("q")).toBe("red");
  });

  it("round-trips a fully-populated browse state", () => {
    const original = browseState({
      brands: new Set(["Citadel"]),
      ranges: new Set(["D&D Nolzur's Marvelous Pigments"]),
      types: new Set(["layer"]),
      families: new Set(["red"]),
      metallic: "exclude",
      includeDiscontinued: true,
      search: "red",
      sort: "lightness",
    });
    expect(readBrowseParams(writeBrowseParams(new URLSearchParams(), original))).toEqual(original);
  });

  it("sorts multi-value params, so both pages produce the same URL", () => {
    const a = writeBrowse(browseState({ brands: new Set(["Vallejo", "Citadel"]) }));
    const b = writeBrowse(browseState({ brands: new Set(["Citadel", "Vallejo"]) }));
    expect(a).toBe(b);
    // ...and the panel agrees with browse for the same selection.
    expect(new URLSearchParams(a).get("brand")).toBe(
      new URLSearchParams(write(state({ brands: new Set(["Citadel", "Vallejo"]) }))).get("brand"),
    );
  });

  it("still reads an old insertion-order bookmark", () => {
    expect([...readBrowse("brand=Vallejo,Citadel").brands].sort()).toEqual(["Citadel", "Vallejo"]);
  });
});

describe("travelParams", () => {
  const current = new URLSearchParams(
    "brand=Vallejo&q=red&sort=brand&family=red&match=2&view=plot&disc=1" +
      "&utm_source=newsletter&fbclid=abc&preset=death-guard&scheme=uuid",
  );

  it("carries every param the two pages own", () => {
    const out = travelParams(current);
    for (const key of ["brand", "q", "sort", "family", "match", "view", "disc"]) {
      expect(out.get(key)).toBe(current.get(key));
    }
  });

  it("drops everything else, so tracking and other features don't propagate", () => {
    const out = travelParams(current);
    for (const key of ["utm_source", "fbclid", "preset", "scheme"]) {
      expect(out.get(key)).toBeNull();
    }
  });

  it("lets overrides win", () => {
    const out = travelParams(current, new URLSearchParams("q=blue"));
    expect(out.get("q")).toBe("blue");
    expect(out.get("brand")).toBe("Vallejo");
  });

  it("treats an empty override as a delete", () => {
    expect(travelParams(current, new URLSearchParams("q=")).get("q")).toBeNull();
  });

  it("returns an empty query string when there is nothing to carry", () => {
    expect(travelQuery(new URLSearchParams("utm_source=x"))).toBe("");
    expect(travelQuery(new URLSearchParams(""))).toBe("");
  });

  it("prefixes with ? when there is", () => {
    expect(travelQuery(new URLSearchParams("brand=Vallejo"))).toBe("?brand=Vallejo");
  });

  it("has TRAVEL_PARAMS covering exactly the ten owned params", () => {
    expect([...TRAVEL_PARAMS].sort()).toEqual(
      [
        "brand",
        "range",
        "type",
        "metal",
        "disc",
        "family",
        "q",
        "sort",
        "match",
        "view",
      ].sort(),
    );
  });
});

describe("similarLinkQuery with the current URL", () => {
  it("carries browse-only params so a later Back restores them", () => {
    const current = new URLSearchParams("q=red&family=red&sort=brand&utm_source=x");
    const qs = similarLinkQuery(state({ brands: new Set(["Vallejo"]) }), current);
    const params = new URLSearchParams(qs.slice(1));
    expect(params.get("q")).toBe("red");
    expect(params.get("family")).toBe("red");
    expect(params.get("sort")).toBe("brand");
    expect(params.get("brand")).toBe("Vallejo");
    // But not the tracking param.
    expect(params.get("utm_source")).toBeNull();
  });

  it("behaves exactly as before when given no current URL", () => {
    expect(similarLinkQuery(state({ brands: new Set(["Vallejo"]) }))).toBe("?brand=Vallejo");
  });
});

describe("clearParams — clear the controls in front of you", () => {
  const busy = "q=x&brand=B&range=R&type=layer&metal=1&disc=1&family=red&sort=brand&view=plot&match=2&utm_source=n";

  it("browse keeps sort, the panel's params, and foreign params", () => {
    const out = clearParams(new URLSearchParams(busy), BROWSE_CLEARABLE);
    expect([...out.keys()].sort()).toEqual(["match", "sort", "utm_source", "view"]);
    // The bug this fixes: browse used to wipe `sort` despite never counting it.
    expect(out.get("sort")).toBe("brand");
  });

  it("the panel keeps browse's params, sort, view and foreign params", () => {
    const out = clearParams(new URLSearchParams(busy), SIMILAR_CLEARABLE);
    expect([...out.keys()].sort()).toEqual(["family", "q", "sort", "utm_source", "view"]);
    // It must not destroy an inbound filter it gives the user no control for.
    expect(out.get("family")).toBe("red");
    expect(out.get("q")).toBe("x");
  });

  it("does not mutate its input", () => {
    const input = new URLSearchParams("brand=B&sort=brand");
    clearParams(input, BROWSE_CLEARABLE);
    expect(input.toString()).toBe("brand=B&sort=brand");
  });
});

describe("sanitiseSharedFacets", () => {
  it("preserves every non-facet field on both state shapes", () => {
    const known = { brands: ["Citadel"], ranges: ["Base"] };
    const panel = sanitiseSimilarParams(
      state({ brands: new Set(["Gone"]), minMatch: "2", view: "plot", includeDiscontinued: true }),
      known,
    );
    expect([...panel.brands]).toEqual([]);
    expect(panel.minMatch).toBe("2");
    expect(panel.view).toBe("plot");
    expect(panel.includeDiscontinued).toBe(true);
  });
});
