import { describe, it, expect } from "vitest";
import { barModel, rampGradient, overlayCenter, elementBarWidth } from "@/lib/scheme/bars";
import { exportSchemeJSON, importScheme, schemeSlug } from "@/lib/scheme/io";
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

describe("elementBarWidth", () => {
  it("defaults to the base width when weight is unset", () => {
    expect(elementBarWidth(undefined)).toBe(60);
    expect(elementBarWidth(1)).toBe(60);
  });

  it("scales with weight so heavier elements read wider", () => {
    expect(elementBarWidth(2)).toBeGreaterThan(elementBarWidth(1));
    expect(elementBarWidth(0.5)).toBeLessThan(elementBarWidth(1));
  });

  it("clamps to sane bounds", () => {
    expect(elementBarWidth(10)).toBe(170);
    expect(elementBarWidth(0.01)).toBe(36);
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

describe("scheme import/export", () => {
  let n = 0;
  const newId = () => `x${n++}`;

  const sample: Scheme = {
    title: "Test Scheme",
    elements: [
      {
        id: "e1",
        name: "Armour",
        weight: 2,
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
    expect(back.elements[0].weight).toBe(2);
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
});
