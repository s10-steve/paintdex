import { describe, it, expect } from "vitest";
import { barModel, rampGradient, overlayCenter } from "@/lib/scheme/bars";
import type { SchemePaint, SchemeRole } from "@/lib/scheme/types";

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
