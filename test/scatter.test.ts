import { describe, it, expect } from "vitest";
import { hexToLab, labToLch } from "@/lib/color";
import {
  layoutScatter,
  pickScatterAxis,
  niceTicks,
  describePoint,
  capForArea,
  MAX_POINTS,
  MAX_DISPLACEMENT_R,
  X_MIN_HALF_SPAN_HUE,
  X_MIN_SPAN_CHROMA,
  Y_MIN_SPAN,
  type ScatterCandidate,
  type ScatterSize,
} from "@/lib/paints/scatter";

const SIZE: ScatterSize = {
  width: 640,
  height: 440,
  markR: 9,
  gutterLeft: 44,
  gutterRight: 12,
  gutterTop: 12,
  gutterBottom: 40,
};

/** A candidate from a hex; `distance` defaults to a spread-out stand-in. */
function cand(id: string, hex: string, distance: number): ScatterCandidate {
  return {
    id,
    name: id,
    brand: "Test",
    range: "Test Range",
    hex,
    lab: hexToLab(hex),
    distance,
  };
}

const RED = hexToLab("#960C09"); // Mephiston Red, C* ~ 66
const GREY = hexToLab("#989C94"); // Administratum Grey, C* ~ 5
const BLACK = hexToLab("#000000");
const WHITE = hexToLab("#FFFFFF");

/** A spread of distinct colours around a mid red, for generic layout tests. */
const MIXED = [
  cand("a", "#A01410", 1.2),
  cand("b", "#8B1A14", 2.6),
  cand("c", "#B02018", 4.1),
  cand("d", "#7A0C08", 5.5),
  cand("e", "#C03028", 8.3),
  cand("f", "#6E1512", 9.4),
];

const inPlot = (
  p: { x: number; y: number },
  layout: ReturnType<typeof layoutScatter>,
) =>
  p.x >= layout.plot.x + layout.markR - 1e-6 &&
  p.x <= layout.plot.x + layout.plot.width - layout.markR + 1e-6 &&
  p.y >= layout.plot.y + layout.markR - 1e-6 &&
  p.y <= layout.plot.y + layout.plot.height - layout.markR + 1e-6;

describe("pickScatterAxis", () => {
  it("uses hue for a saturated paint", () => {
    expect(pickScatterAxis(labToLch(RED).c)).toBe("hue");
  });

  it("falls back to chroma for a near-neutral paint", () => {
    expect(pickScatterAxis(labToLch(GREY).c)).toBe("chroma");
    expect(pickScatterAxis(labToLch(BLACK).c)).toBe("chroma");
  });

  it("is overridable, so the user can still ask for hue on a grey", () => {
    const layout = layoutScatter({ lab: GREY }, MIXED, {
      size: SIZE,
      axis: "hue",
    });
    expect(layout.axis).toBe("hue");
  });

  it("is what layoutScatter defaults to when no axis is forced", () => {
    expect(layoutScatter({ lab: GREY }, MIXED, { size: SIZE }).axis).toBe("chroma");
    expect(layoutScatter({ lab: RED }, MIXED, { size: SIZE }).axis).toBe("hue");
  });
});

describe("niceTicks", () => {
  it("uses round steps inside the range", () => {
    const ticks = niceTicks(-12, 12);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(-12);
      expect(t).toBeLessThanOrEqual(12);
    }
    expect(ticks).toContain(0);
  });

  it("terminates on a degenerate range instead of looping on a zero step", () => {
    expect(niceTicks(5, 5)).toEqual([5]);
    expect(niceTicks(5, 4)).toEqual([5]);
  });

  it("produces a readable number of ticks across many ranges", () => {
    for (const [lo, hi] of [
      [-6, 6],
      [-180, 180],
      [0, 1],
      [-0.5, 0.5],
      [19, 43],
    ] as const) {
      const ticks = niceTicks(lo, hi);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(12);
    }
  });

  it("does not drift on fractional steps", () => {
    for (const t of niceTicks(0, 1)) {
      expect(Number.isFinite(t)).toBe(true);
      // A repeated += of 0.2 would give 0.6000000000000001.
      expect(Math.abs(t - Number(t.toFixed(6)))).toBeLessThan(1e-9);
    }
  });
});

describe("layoutScatter — axes", () => {
  it("puts the reference paint at the horizontal centre", () => {
    const layout = layoutScatter({ lab: RED }, MIXED, { size: SIZE });
    const centre = layout.plot.x + layout.plot.width / 2;
    expect(layout.target.x).toBeCloseTo(centre, 6);
    expect(layout.x.min).toBeCloseTo(-layout.x.max, 10);
  });

  it("marks the reference paint's own lightness as the y origin", () => {
    const layout = layoutScatter({ lab: RED }, MIXED, { size: SIZE });
    expect(layout.target.l).toBeCloseTo(labToLch(RED).l, 6);
    expect(inPlot({ x: layout.target.x, y: layout.target.y }, layout)).toBe(true);
  });

  it("does not waste half the plot when every alternative is lighter", () => {
    // Everything is lighter than black, so a symmetric ΔL domain would leave the
    // bottom half empty. The fit is asymmetric on purpose.
    const layout = layoutScatter({ lab: BLACK }, MIXED, { size: SIZE });
    expect(layout.y.min).toBeCloseTo(0, 6);
    expect(layout.y.max).toBeGreaterThan(0);
    // The reference paint sits on the floor of the plot, not in the middle.
    expect(layout.target.y).toBeGreaterThan(
      layout.plot.y + layout.plot.height * 0.7,
    );
  });

  it("mirrors that when every alternative is darker", () => {
    const layout = layoutScatter({ lab: WHITE }, MIXED, { size: SIZE });
    expect(layout.y.max).toBeCloseTo(0, 6);
    expect(layout.y.min).toBeLessThan(0);
    expect(layout.target.y).toBeLessThan(layout.plot.y + layout.plot.height * 0.3);
  });

  it("floors a tightly-clustered domain rather than magnifying noise", () => {
    // Three nearly-identical reds: the true hue spread is a fraction of a degree.
    const tight = [
      cand("t1", "#960C09", 0.1),
      cand("t2", "#960D0A", 0.2),
      cand("t3", "#970C09", 0.3),
    ];
    const layout = layoutScatter({ lab: RED }, tight, { size: SIZE });
    expect(layout.x.floored).toBe(true);
    expect(layout.x.max).toBeCloseTo(X_MIN_HALF_SPAN_HUE, 10);
    expect(layout.y.floored).toBe(true);
    expect(layout.y.max - layout.y.min).toBeCloseTo(Y_MIN_SPAN, 10);
  });

  it("does not reserve plot width for impossible negative saturation", () => {
    // Black has C* = 0, so nothing can be *less* saturated than it. A symmetric
    // ΔC* domain would hand the whole left half of the plot to values that cannot
    // exist, cramming every real mark into the right.
    const layout = layoutScatter({ lab: BLACK }, MIXED, { size: SIZE });
    expect(layout.axis).toBe("chroma");
    expect(layout.x.min).toBeCloseTo(0, 6);
    expect(layout.x.max).toBeGreaterThan(0);
    // The reference paint therefore sits at the left edge, not the middle.
    expect(layout.target.x).toBeLessThan(layout.plot.x + layout.plot.width * 0.2);
  });

  it("still floors a narrow saturation spread", () => {
    const layout = layoutScatter({ lab: GREY }, [cand("g", "#9A9E96", 0.4)], {
      size: SIZE,
    });
    expect(layout.axis).toBe("chroma");
    expect(layout.x.floored).toBe(true);
    expect(layout.x.max - layout.x.min).toBeCloseTo(X_MIN_SPAN_CHROMA, 10);
  });

  it("keeps hue symmetric, because a hue can shift either way", () => {
    const layout = layoutScatter({ lab: RED }, MIXED, { size: SIZE });
    expect(layout.axis).toBe("hue");
    expect(layout.x.min).toBeCloseTo(-layout.x.max, 10);
  });

  it("keeps x monotonic in hue shift before relaxation", () => {
    const layout = layoutScatter({ lab: RED }, MIXED, { size: SIZE });
    const byAx = [...layout.points].sort((a, b) => a.ax - b.ax);
    for (let i = 1; i < byAx.length; i++) {
      expect(byAx[i].trueX).toBeGreaterThanOrEqual(byAx[i - 1].trueX - 1e-9);
    }
  });
});

describe("layoutScatter — ordering", () => {
  it("returns points ΔE ascending, for keyboard traversal", () => {
    const layout = layoutScatter({ lab: RED }, MIXED, { size: SIZE });
    for (let i = 1; i < layout.points.length; i++) {
      expect(layout.points[i].distance).toBeGreaterThanOrEqual(
        layout.points[i - 1].distance,
      );
    }
  });

  it("keeps every candidate exactly once", () => {
    const layout = layoutScatter({ lab: RED }, MIXED, { size: SIZE });
    expect(new Set(layout.points.map((p) => p.id)).size).toBe(MIXED.length);
  });
});

describe("layoutScatter — overlap", () => {
  /** 90 candidates sharing one hex — the Vallejo White case. */
  const stacked = Array.from({ length: 90 }, (_, i) =>
    cand(`s${String(i).padStart(3, "0")}`, "#F2F0EA", 1 + i * 0.01),
  );

  it("separates marks that start life exactly coincident", () => {
    const layout = layoutScatter({ lab: WHITE }, stacked, { size: SIZE });
    // Every mark must have moved off the shared true position.
    const distinct = new Set(
      layout.points.map((p) => `${p.x.toFixed(3)}|${p.y.toFixed(3)}`),
    );
    expect(distinct.size).toBe(layout.points.length);
  });

  it("fully separates a solvable set, and says so", () => {
    // Six distinct colours, comfortably spread: nothing should stay overlapped.
    const layout = layoutScatter({ lab: RED }, MIXED, { size: SIZE });
    expect(layout.overlapping).toBe(0);
    for (let i = 0; i < layout.points.length; i++) {
      for (let j = i + 1; j < layout.points.length; j++) {
        const a = layout.points[i];
        const b = layout.points[j];
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(
          2 * layout.markR - 0.5,
        );
      }
    }
  });

  it("separates a pile up to the honesty budget, then reports the remainder", () => {
    // 90 marks cannot all sit a diameter apart within 3 mark radii of one point —
    // roughly seven fit. The budget wins, and the overflow is disclosed rather
    // than being flung across the plot or silently hidden.
    const layout = layoutScatter({ lab: WHITE }, stacked, { size: SIZE });
    expect(layout.overlapping).toBeGreaterThan(0);
    expect(layout.overlapping).toBeLessThan(layout.points.length);
    // The closest match is never the one buried: it holds the top of the stack.
    const best = layout.points[0];
    expect(Math.hypot(best.x - best.trueX, best.y - best.trueY)).toBeLessThan(
      MAX_DISPLACEMENT_R * layout.markR,
    );
  });

  it("bounds how far any mark may sit from the truth", () => {
    const layout = layoutScatter({ lab: WHITE }, stacked, { size: SIZE });
    for (const p of layout.points) {
      expect(Math.hypot(p.x - p.trueX, p.y - p.trueY)).toBeLessThanOrEqual(
        MAX_DISPLACEMENT_R * layout.markR + 1e-6,
      );
    }
    expect(layout.maxDisplacement).toBeLessThanOrEqual(
      MAX_DISPLACEMENT_R * layout.markR + 1e-6,
    );
  });

  it("keeps the best matches truer than the loosest ones", () => {
    const layout = layoutScatter({ lab: WHITE }, stacked, { size: SIZE });
    const drift = (i: number) => {
      const p = layout.points[i];
      return Math.hypot(p.x - p.trueX, p.y - p.trueY);
    };
    // Compare the closest few against the loosest few, not single points — one
    // pair can invert under the spring without the ranking being broken.
    const head = [0, 1, 2, 3, 4].reduce((s, i) => s + drift(i), 0) / 5;
    const n = layout.points.length;
    const tail =
      [n - 5, n - 4, n - 3, n - 2, n - 1].reduce((s, i) => s + drift(i), 0) / 5;
    expect(head).toBeLessThan(tail);
  });

  it("keeps every mark fully inside the plot rect", () => {
    const layout = layoutScatter({ lab: WHITE }, stacked, { size: SIZE });
    for (const p of layout.points) expect(inPlot(p, layout)).toBe(true);
  });

  it("flags marks it had to nudge", () => {
    const layout = layoutScatter({ lab: WHITE }, stacked, { size: SIZE });
    expect(layout.points.some((p) => p.displaced)).toBe(true);
    // ...and does not flag a comfortably-spread set.
    const spread = layoutScatter({ lab: RED }, MIXED, { size: SIZE });
    expect(spread.points.every((p) => !p.displaced)).toBe(true);
  });
});

describe("layoutScatter — determinism", () => {
  it("gives identical output for identical input", () => {
    const a = layoutScatter({ lab: RED }, MIXED, { size: SIZE });
    const b = layoutScatter({ lab: RED }, MIXED, { size: SIZE });
    expect(a).toEqual(b);
  });

  it("is independent of the input array's order", () => {
    const shuffled = [MIXED[3], MIXED[0], MIXED[5], MIXED[2], MIXED[4], MIXED[1]];
    const a = layoutScatter({ lab: RED }, MIXED, { size: SIZE });
    const b = layoutScatter({ lab: RED }, shuffled, { size: SIZE });
    expect(b.points.map((p) => p.id)).toEqual(a.points.map((p) => p.id));
    for (let i = 0; i < a.points.length; i++) {
      expect(b.points[i].x).toBeCloseTo(a.points[i].x, 10);
      expect(b.points[i].y).toBeCloseTo(a.points[i].y, 10);
    }
  });

  it("does not mutate the caller's candidate array", () => {
    const input = [...MIXED];
    layoutScatter({ lab: RED }, input, { size: SIZE });
    expect(input).toEqual(MIXED);
  });
});

describe("layoutScatter — capping", () => {
  const many = Array.from({ length: 300 }, (_, i) =>
    cand(`m${String(i).padStart(3, "0")}`, "#960C09", i * 0.1),
  );

  it("keeps the closest `limit` and reports the rest", () => {
    const layout = layoutScatter({ lab: RED }, many, { size: SIZE, limit: 120 });
    expect(layout.points).toHaveLength(120);
    expect(layout.omittedCount).toBe(180);
    const worstKept = Math.max(...layout.points.map((p) => p.distance));
    expect(worstKept).toBeLessThanOrEqual(many[120].distance);
  });

  it("defaults the cap to MAX_POINTS", () => {
    const layout = layoutScatter({ lab: RED }, many, { size: SIZE });
    expect(layout.points).toHaveLength(MAX_POINTS);
    expect(layout.omittedCount).toBe(300 - MAX_POINTS);
  });

  it("reports nothing omitted when everything fits", () => {
    expect(layoutScatter({ lab: RED }, MIXED, { size: SIZE }).omittedCount).toBe(0);
  });

  it("survives an empty candidate list", () => {
    const layout = layoutScatter({ lab: RED }, [], { size: SIZE });
    expect(layout.points).toEqual([]);
    expect(layout.overlapping).toBe(0);
    expect(layout.x.floored).toBe(true);
    expect(Number.isFinite(layout.target.x)).toBe(true);
    expect(Number.isFinite(layout.target.y)).toBe(true);
  });
});

describe("layoutScatter — uncertain hues", () => {
  it("flags a near-neutral candidate without damping its position", () => {
    const items = [cand("grey", "#989C94", 6), cand("red", "#A01410", 2)];
    const layout = layoutScatter({ lab: RED }, items, { size: SIZE, axis: "hue" });
    const grey = layout.points.find((p) => p.id === "grey")!;
    expect(grey.hueUncertain).toBe(true);
    // Present, and reporting its real (if unreliable) hue shift.
    expect(layout.points).toHaveLength(2);
    expect(grey.ax).not.toBe(0);
  });

  it("never flags anything in chroma mode", () => {
    const items = [cand("grey", "#989C94", 6)];
    const layout = layoutScatter({ lab: GREY }, items, { size: SIZE });
    expect(layout.axis).toBe("chroma");
    expect(layout.points[0].hueUncertain).toBe(false);
  });
});

describe("describePoint", () => {
  const layout = layoutScatter({ lab: RED }, MIXED, { size: SIZE });

  it("names the hue direction and the lightness difference", () => {
    const lighter = layout.points.find((p) => p.dl > 1)!;
    const text = describePoint(lighter, "hue");
    expect(text).toMatch(/lighter/);
    expect(text).toMatch(/lightness \d+/);
  });

  it("says so when the hue is not to be trusted", () => {
    const grey = layoutScatter({ lab: RED }, [cand("g", "#989C94", 6)], {
      size: SIZE,
      axis: "hue",
    }).points[0];
    expect(describePoint(grey, "hue")).toMatch(/hue approximate/);
  });

  it("describes saturation the same way it describes hue", () => {
    // "saturation +3", mirroring "hue +12°" rather than reading as prose.
    const chromaLayout = layoutScatter({ lab: GREY }, MIXED, { size: SIZE });
    expect(describePoint(chromaLayout.points[0], "chroma")).toMatch(
      /saturation [+−]\d+/,
    );
  });
});

describe("capForArea", () => {
  it("does not tighten the cap on a roomy desktop plot", () => {
    const plot = { width: 584, height: 388 };
    expect(capForArea(plot, 18, 9)).toBeGreaterThanOrEqual(MAX_POINTS);
  });

  it("tightens it hard on a phone, where 24px marks would tile the plot", () => {
    const plot = { width: 312, height: 316 };
    const cap = capForArea(plot, 21, 12);
    expect(cap).toBeLessThan(MAX_POINTS);
    expect(cap).toBeGreaterThan(20);
  });

  it("never returns a uselessly small plot", () => {
    expect(capForArea({ width: 10, height: 10 }, 20, 12)).toBe(12);
  });

  it("is what limits the points on a small plot, and is reported", () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      cand(`p${String(i).padStart(3, "0")}`, "#960C09", i * 0.05),
    );
    const small: ScatterSize = {
      width: 320,
      height: 380,
      markR: 12,
      gutterLeft: 34,
      gutterRight: 12,
      gutterTop: 12,
      gutterBottom: 52,
    };
    const layout = layoutScatter({ lab: RED }, many, { size: small });
    expect(layout.points.length).toBeLessThan(MAX_POINTS);
    // Nothing vanishes silently — the shortfall is always accounted for.
    expect(layout.points.length + layout.omittedCount).toBe(200);
    // And it is still the *closest* matches that survive.
    expect(Math.max(...layout.points.map((p) => p.distance))).toBeLessThanOrEqual(
      many[layout.points.length].distance,
    );
  });
});
