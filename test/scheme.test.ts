import { describe, it, expect } from "vitest";
import { barModel, rampGradient, overlayCenter, elementSize, moveItem } from "@/lib/scheme/bars";
import {
  exportSchemeJSON,
  importScheme,
  importSchemeObject,
  schemeSlug,
  toExportShape,
  SCHEME_FORMAT,
} from "@/lib/scheme/io";
import { planSignInScheme } from "@/lib/scheme/sync";
import {
  makeShareToken,
  makeShareSlug,
  shareUrl,
  SHARE_TOKEN_LENGTH,
} from "@/lib/scheme/share";
import { ROLES, roleOf, weightOf } from "@/lib/scheme/types";
import type { Scheme, SchemePaint, SchemeRole } from "@/lib/scheme/types";

let seq = 0;
function p(role: SchemeRole, weight?: number): SchemePaint {
  return {
    id: `p${seq++}`,
    name: role,
    brand: "custom",
    range: "custom",
    hex: "#808080",
    role,
    weight,
  };
}

describe("roles", () => {
  it("treats drybrush exactly like highlight", () => {
    // Same ramp behaviour and share of the bar; only its name and colour differ.
    expect(ROLES.drybrush.solid).toBe(ROLES.highlight.solid);
    expect(ROLES.drybrush.solid).toBe(true);
    expect(ROLES.drybrush.weight).toBe(ROLES.highlight.weight);
    expect(ROLES.drybrush.opacity).toBe(ROLES.highlight.opacity);
  });

  it("puts drybrush in the ramp, not the overlays", () => {
    const { segs, overlays } = barModel([p("base"), p("drybrush")]);
    expect(segs.map((s) => s.paint.role)).toEqual(["base", "drybrush"]);
    expect(overlays).toEqual([]);
  });

  it("survives an export/import round trip", () => {
    const imported = importSchemeObject(
      toExportShape({ title: "t", elements: [{ id: "e", name: "E", paints: [p("drybrush")] }] }),
      () => "x",
    );
    expect(imported.elements[0].paints[0].role).toBe("drybrush");
  });

  it("gives every overlay role the same share of the bar", () => {
    // Bands are told apart by colour and opacity, not thickness.
    const widths = (["wash", "glaze", "weathering"] as const).map((r) => weightOf(p(r)));
    expect(new Set(widths).size).toBe(1);
  });

  it("makes weathering markedly more opaque than washes and glazes", () => {
    // Rust streaks and copper patina read far stronger than a glaze in practice.
    const weathering = roleOf(p("weathering")).opacity ?? 0;
    expect(weathering).toBeGreaterThan((roleOf(p("wash")).opacity ?? 0) + 0.2);
    expect(weathering).toBeGreaterThan((roleOf(p("glaze")).opacity ?? 0) + 0.2);
  });
});

describe("barModel", () => {
  it("splits solids (ramp) from wash/glaze/weathering overlays", () => {
    const { segs, overlays } = barModel([
      p("base"),
      p("wash"),
      p("layer"),
      p("glaze"),
      p("highlight"),
      p("weathering"),
    ]);
    expect(segs.map((s) => s.paint.role)).toEqual(["base", "layer", "highlight"]);
    expect(overlays.map((o) => o.paint.role)).toEqual(["wash", "glaze", "weathering"]);
    // Overlays retain their original index in the paint list (for placement).
    expect(overlays.map((o) => o.idx)).toEqual([1, 3, 5]);
  });

  it("weights segments proportionally and the fractions sum to 1", () => {
    const { segs } = barModel([p("base", 3), p("highlight", 1)]);
    expect(segs[0].frac).toBeCloseTo(0.75, 5);
    expect(segs[1].frac).toBeCloseTo(0.25, 5);
    expect(segs.reduce((n, s) => n + s.frac, 0)).toBeCloseTo(1, 5);
    // First segment sits at the bottom (start 0), last reaches the top (end 1).
    expect(segs[0].start).toBeCloseTo(0, 5);
    expect(segs[segs.length - 1].end).toBeCloseTo(1, 5);
  });

  it("uses role default weights when a paint has no explicit weight", () => {
    const { segs } = barModel([p("base"), p("layer"), p("highlight")]);
    // Defaults 1.4 / 1.0 / 0.55 → base is the largest, highlight the smallest.
    expect(segs[0].frac).toBeGreaterThan(segs[1].frac);
    expect(segs[1].frac).toBeGreaterThan(segs[2].frac);
  });

  it("falls back to an equal ramp (and no overlays) when there are no solids", () => {
    const { segs, overlays } = barModel([p("wash"), p("glaze")]);
    expect(segs).toHaveLength(2);
    expect(overlays).toHaveLength(0);
    expect(segs[0].frac).toBeCloseTo(0.5, 5);
  });

  it("handles an empty element", () => {
    const { segs, overlays } = barModel([]);
    expect(segs).toHaveLength(0);
    expect(overlays).toHaveLength(0);
  });
});

describe("rampGradient", () => {
  it("returns a single colour for one segment", () => {
    const { segs } = barModel([p("base")]);
    expect(rampGradient(segs, true)).toBe("#808080");
  });

  it("emits one centre stop per colour when blended", () => {
    const { segs } = barModel([p("base"), p("layer"), p("highlight")]);
    const g = rampGradient(segs, true);
    expect(g.startsWith("linear-gradient(to top,")).toBe(true);
    // Three solids → three stops when blended.
    expect(g.match(/%/g)).toHaveLength(3);
  });

  it("emits paired boundary stops (hard steps) when banded", () => {
    const { segs } = barModel([p("base"), p("layer"), p("highlight")]);
    const g = rampGradient(segs, false);
    // Three solids → six stops (start+end per segment).
    expect(g.match(/%/g)).toHaveLength(6);
  });

  it("is empty for no segments", () => {
    expect(rampGradient([], true)).toBe("");
  });
});

describe("overlayCenter", () => {
  it("pins overlays applied before any solid to the bottom", () => {
    // wash at index 0, then base, layer.
    const paints = [p("wash"), p("base"), p("layer")];
    const { segs, overlays } = barModel(paints);
    expect(overlayCenter(overlays[0], segs)).toBeCloseTo(segs[0].start, 5);
  });

  it("pins overlays applied after all solids to the top", () => {
    const paints = [p("base"), p("layer"), p("glaze")];
    const { segs, overlays } = barModel(paints);
    expect(overlayCenter(overlays[0], segs)).toBeCloseTo(segs[segs.length - 1].end, 5);
  });

  it("places a mid-sequence overlay on the boundary between its neighbours", () => {
    // base, wash, layer → wash sits on the base/layer boundary.
    const paints = [p("base"), p("wash"), p("layer")];
    const { segs, overlays } = barModel(paints);
    expect(overlayCenter(overlays[0], segs)).toBeCloseTo(segs[0].end, 5);
  });
});

describe("elementSize", () => {
  it("gives the first element the largest width and each later one smaller", () => {
    const sizes = [0, 1, 2, 3].map(elementSize);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeLessThan(sizes[i - 1]);
    }
    expect(sizes[0]).toBe(1);
  });

  it("keeps the first-vs-last ratio bounded regardless of count", () => {
    // Geometric taper: the ratio between neighbours is constant, so a long list
    // never collapses later bars to zero the way a linear count→1 taper would.
    expect(elementSize(1) / elementSize(0)).toBeCloseTo(elementSize(6) / elementSize(5), 5);
  });
});

describe("moveItem", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("moves an item up (dir -1) and down (dir +1)", () => {
    expect(moveItem(items, "b", -1).map((i) => i.id)).toEqual(["b", "a", "c"]);
    expect(moveItem(items, "b", 1).map((i) => i.id)).toEqual(["a", "c", "b"]);
  });

  it("returns the array unchanged at the ends or for an unknown id", () => {
    expect(moveItem(items, "a", -1)).toBe(items);
    expect(moveItem(items, "c", 1)).toBe(items);
    expect(moveItem(items, "z", 1)).toBe(items);
  });

  it("does not mutate the input array", () => {
    const moved = moveItem(items, "a", 1);
    expect(moved).not.toBe(items);
    expect(items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});

describe("scheme import/export", () => {
  let n = 0;
  const newId = () => `x${n++}`;

  const sample: Scheme = {
    title: "Test Scheme",
    elements: [
      {
        id: "e1",
        name: "Armour",
        paints: [
          { id: "a1", name: "Base Grey", brand: "Vallejo", range: "Model Color", hex: "#404040", role: "base" },
          { id: "a2", name: "My Mix", brand: "custom", range: "custom", hex: "#AABBCC", role: "highlight", custom: true, weight: 0.5 },
        ],
      },
    ],
  };

  it("round-trips a scheme through export → import (ignoring ids)", () => {
    const json = exportSchemeJSON(sample);
    const back = importScheme(json, newId);
    expect(back.title).toBe("Test Scheme");
    expect(back.elements).toHaveLength(1);
    expect(back.elements[0].name).toBe("Armour");
    expect(back.elements[0].paints.map((p) => ({ ...p, id: undefined }))).toEqual([
      { id: undefined, name: "Base Grey", brand: "Vallejo", range: "Model Color", hex: "#404040", role: "base" },
      { id: undefined, name: "My Mix", brand: "custom", range: "custom", hex: "#AABBCC", role: "highlight", custom: true, weight: 0.5 },
    ]);
  });

  it("assigns fresh unique ids on import", () => {
    const back = importScheme(exportSchemeJSON(sample), newId);
    const ids = [back.elements[0].id, ...back.elements[0].paints.map((p) => p.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("omits undefined weight/custom from the exported JSON", () => {
    const json = exportSchemeJSON(sample);
    const parsed = JSON.parse(json);
    expect(parsed.app).toBe("paintdex");
    expect("weight" in parsed.elements[0].paints[0]).toBe(false);
    expect("custom" in parsed.elements[0].paints[0]).toBe(false);
  });

  it("rejects non-JSON and non-schemes", () => {
    expect(() => importScheme("not json", newId)).toThrow(/valid JSON/);
    expect(() => importScheme("{}", newId)).toThrow(/paint scheme/);
    expect(() => importScheme('{"elements":"nope"}', newId)).toThrow(/paint scheme/);
  });

  it("sanitises bad fields instead of failing the whole import", () => {
    const dirty = JSON.stringify({
      elements: [{ name: "E", paints: [{ name: "P", hex: "zzz", role: "bogus" }] }],
    });
    const s = importScheme(dirty, newId);
    const paint = s.elements[0].paints[0];
    expect(paint.role).toBe("layer"); // unknown role → default
    expect(paint.hex).toBe("#808080"); // invalid hex → default
    expect(paint.brand).toBe("custom"); // missing → default
  });

  it("normalises hex to uppercase with a leading #", () => {
    const s = importScheme(
      JSON.stringify({ elements: [{ name: "E", paints: [{ name: "P", hex: "aabbcc", role: "base" }] }] }),
      newId,
    );
    expect(s.elements[0].paints[0].hex).toBe("#AABBCC");
  });

  it("slugifies titles for filenames", () => {
    expect(schemeSlug("Black Armour & Trim")).toBe("black-armour-trim");
    expect(schemeSlug("   ")).toBe("paint-scheme");
  });

  it("toExportShape produces the same object exportSchemeJSON stringifies", () => {
    const shape = toExportShape(sample);
    expect(shape.format).toBe(SCHEME_FORMAT);
    expect(shape.app).toBe("paintdex");
    // No runtime ids leak into the stored shape.
    expect(JSON.stringify(shape)).not.toMatch(/"id"/);
    expect(shape).toEqual(JSON.parse(exportSchemeJSON(sample)));
  });

  it("round-trips a scheme through toExportShape → importScheme (the account-sync path)", () => {
    // The DB stores the export shape as jsonb and loads it back through
    // importScheme without a stringify round trip; simulate that here.
    const stored = toExportShape(sample);
    const back = importScheme(JSON.stringify(stored), newId);
    expect(back.title).toBe("Test Scheme");
    expect(back.elements[0].paints.map((p) => ({ ...p, id: undefined }))).toEqual([
      { id: undefined, name: "Base Grey", brand: "Vallejo", range: "Model Color", hex: "#404040", role: "base" },
      { id: undefined, name: "My Mix", brand: "custom", range: "custom", hex: "#AABBCC", role: "highlight", custom: true, weight: 0.5 },
    ]);
  });

  it("importSchemeObject sanitises an already-parsed object (no string round trip)", () => {
    const obj = { elements: [{ name: "E", paints: [{ name: "P", hex: "aabbcc", role: "bogus" }] }] };
    const s = importSchemeObject(obj, newId);
    expect(s.elements[0].paints[0].hex).toBe("#AABBCC");
    expect(s.elements[0].paints[0].role).toBe("layer");
  });
});

describe("planSignInScheme (sign-in reconciliation)", () => {
  const blank: Scheme = { title: "", elements: [] };
  const built: Scheme = {
    title: "White Templars",
    elements: [
      {
        id: "e1",
        name: "Armour",
        paints: [
          { id: "p1", name: "Grey Seer", brand: "Citadel", range: "Base", hex: "#C6C6C4", role: "base" },
        ],
      },
    ],
  };

  it("adopts the local scheme when the user has nothing saved", () => {
    expect(planSignInScheme([], built)).toBe("adopt-local");
    expect(planSignInScheme([], blank)).toBe("adopt-local");
  });

  it("loads the latest saved scheme when the local one is blank", () => {
    expect(planSignInScheme([toExportShape(built)], blank)).toBe("load-latest");
  });

  it("loads the latest when the local scheme is already saved (no duplicate)", () => {
    expect(planSignInScheme([toExportShape(built)], built)).toBe("load-latest");
  });

  it("adopts local — preserving work built while signed out — when it isn't saved", () => {
    const other = toExportShape({ ...built, title: "Something Else" });
    expect(planSignInScheme([other], built)).toBe("adopt-local");
  });

  it("compares regardless of JSON key order (jsonb doesn't preserve it)", () => {
    const shape = toExportShape(built);
    const reordered = {
      elements: shape.elements,
      app: shape.app,
      title: shape.title,
      format: shape.format,
    };
    expect(planSignInScheme([reordered], built)).toBe("load-latest");
  });
});

describe("share links", () => {
  it("derives a fixed-length lowercase base-36 token from bytes (deterministic)", () => {
    const bytes = new Uint8Array([0, 1, 255, 128, 42, 7, 200, 99]);
    const a = makeShareToken(bytes);
    const b = makeShareToken(bytes);
    expect(a).toBe(b); // pure: same input → same output
    expect(a).toHaveLength(SHARE_TOKEN_LENGTH);
    expect(a).toMatch(/^[0-9a-z]+$/);
  });

  it("produces different tokens for different random bytes", () => {
    const a = makeShareToken(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    const b = makeShareToken(new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2]));
    expect(a).not.toBe(b);
  });

  it("never returns an empty token, even for all-zero bytes", () => {
    expect(makeShareToken(new Uint8Array(6)).length).toBeGreaterThan(0);
  });

  it("builds a readable slug: title-slug + token", () => {
    const slug = makeShareSlug("White Templars!", "3f9a2b7c10");
    expect(slug).toBe("white-templars-3f9a2b7c10");
  });

  it("falls back to the default title slug when the title is blank", () => {
    expect(makeShareSlug("   ", "abc123")).toBe("paint-scheme-abc123");
  });

  it("builds an absolute share URL and tolerates a trailing slash in origin", () => {
    expect(shareUrl("https://paintdex.app", "foo-123")).toBe(
      "https://paintdex.app/scheme/foo-123",
    );
    expect(shareUrl("https://paintdex.app/", "foo-123")).toBe(
      "https://paintdex.app/scheme/foo-123",
    );
  });
});
