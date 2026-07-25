import { describe, it, expect } from "vitest";
import {
  BRAND_LINE_H,
  calloutHeight,
  defaultPosterOptions,
  layoutPoster,
  paintRowHeight,
  photoRect,
  projectAnchor,
  COLUMN_W,
  FOOTER_H,
  GAP,
  GAP_TIGHT,
  HEADER_H,
  MARGIN,
  POSTER_SIZE,
  ROW_H,
  type PhotoFraming,
  type PosterAnchors,
} from "@/lib/scheme/poster";
import { brandLabel } from "@/lib/scheme/types";
import type { SchemeElement, SchemePaint, SchemeRole } from "@/lib/scheme/types";

let seq = 0;
const paint = (role: SchemeRole = "layer"): SchemePaint => ({
  id: `p${seq++}`,
  name: `paint-${seq}`,
  brand: "custom",
  range: "custom",
  hex: "#808080",
  role,
});

const element = (name: string, paints = 3): SchemeElement => ({
  id: `e${name}`,
  name,
  paints: Array.from({ length: paints }, () => paint()),
});

/** n elements, all anchored down the given side, evenly spread vertically. */
const stack = (n: number, x: number): { elements: SchemeElement[]; anchors: PosterAnchors } => {
  const elements = Array.from({ length: n }, (_, i) => element(`e${i}`));
  const anchors: PosterAnchors = {};
  for (let i = 0; i < n; i++) anchors[i] = { x, y: (i + 0.5) / n };
  return { elements, anchors };
};

/**
 * Brand lines are on by default and make every row taller. The geometry tests
 * below reason in exact pixels, so they pin the lean single-line pitch and let
 * the brand-specific block own the taller case.
 */
const LEAN = { showBrands: false };

const { width: W, height: H } = POSTER_SIZE;
const bandTop = HEADER_H;
const bandBottom = H - FOOTER_H;

describe("photo framing", () => {
  const square: PhotoFraming = {
    naturalWidth: 1000,
    naturalHeight: 1000,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  };

  it("covers the poster rather than fitting inside it", () => {
    const r = photoRect(square, W, H);
    // A square photo on a 4:5 poster must overflow horizontally, never letterbox.
    expect(r.dh).toBeCloseTo(H);
    expect(r.dw).toBeCloseTo(H);
    expect(r.dx).toBeCloseTo((W - H) / 2);
    expect(r.dy).toBeCloseTo(0);
  });

  it("keeps an anchor on the same pixel of the model when the framing changes", () => {
    // The whole reason anchors are stored in photo space: re-framing must not
    // strand the leader rings mid-air.
    const eye = { x: 0.5, y: 0.35 };
    const a = projectAnchor(eye, square, W, H);
    const b = projectAnchor(eye, { ...square, zoom: 1.4, offsetY: -60 }, W, H);

    // The centre column is fixed under a centred zoom; the y moves with the photo.
    expect(b.x).toBeCloseTo(a.x);
    expect(b.y).toBeLessThan(a.y);

    // And it lands exactly where the same fraction of the drawn photo now sits.
    const r = photoRect({ ...square, zoom: 1.4, offsetY: -60 }, W, H);
    expect(b.y).toBeCloseTo(r.dy + eye.y * r.dh);
  });
});

describe("layoutPoster: eligibility", () => {
  it("omits unanchored and empty elements, with a reason for each", () => {
    const elements = [element("placed"), element("unplaced"), { ...element("empty"), paints: [] }];
    const layout = layoutPoster({ elements, anchors: { 0: { x: 0.3, y: 0.5 }, 2: { x: 0.7, y: 0.5 } } });

    expect(layout.callouts.map((c) => c.name)).toEqual(["placed"]);
    expect(layout.omitted).toEqual([
      { elementIndex: 1, name: "unplaced", reason: "unplaced" },
      { elementIndex: 2, name: "empty", reason: "no-paints" },
    ]);
  });

  it("blames the empty paint list, not the missing anchor, for an empty element", () => {
    // Both are true of a brand-new element; only one is worth acting on.
    const layout = layoutPoster({ elements: [{ ...element("blank"), paints: [] }], anchors: {} });
    expect(layout.omitted).toEqual([{ elementIndex: 0, name: "blank", reason: "no-paints" }]);
  });

  it("omits anchors that the current framing has pushed outside the poster", () => {
    const photo: PhotoFraming = {
      naturalWidth: 1000,
      naturalHeight: 1000,
      zoom: 3,
      offsetX: 0,
      offsetY: 0,
    };
    const layout = layoutPoster({
      elements: [element("centre"), element("corner")],
      anchors: { 0: { x: 0.5, y: 0.5 }, 1: { x: 0.02, y: 0.02 } },
      photo,
    });

    expect(layout.callouts.map((c) => c.name)).toEqual(["centre"]);
    expect(layout.omitted).toEqual([{ elementIndex: 1, name: "corner", reason: "off-frame" }]);
  });
});

describe("layoutPoster: sides", () => {
  it("splits on the anchor's projected position, and honours a manual override", () => {
    const layout = layoutPoster({
      elements: [element("l"), element("r"), element("forced")],
      anchors: {
        0: { x: 0.2, y: 0.3 },
        1: { x: 0.8, y: 0.3 },
        2: { x: 0.2, y: 0.7, side: "right" },
      },
    });

    const by = Object.fromEntries(layout.callouts.map((c) => [c.name, c]));
    expect(by.l.side).toBe("left");
    expect(by.r.side).toBe("right");
    expect(by.forced.side).toBe("right");

    // Columns sit inside the safe margins.
    expect(by.l.x).toBe(MARGIN);
    expect(by.r.x).toBe(W - MARGIN - COLUMN_W);
  });

  it("packs the two columns independently", () => {
    // Four per side is comfortable; eight down one side would not be.
    const elements = Array.from({ length: 8 }, (_, i) => element(`e${i}`));
    const anchors: PosterAnchors = {};
    for (let i = 0; i < 8; i++) anchors[i] = { x: i % 2 === 0 ? 0.2 : 0.8, y: (i + 0.5) / 8 };

    const layout = layoutPoster({ elements, anchors });
    expect(layout.callouts).toHaveLength(8);
    expect(layout.omitted).toEqual([]);
  });
});

describe("layoutPoster: packing", () => {
  it("keeps every callout inside the band and clear of its neighbours", () => {
    const { elements, anchors } = stack(4, 0.2);
    const layout = layoutPoster({ elements, anchors });

    const col = layout.callouts.slice().sort((a, b) => a.y - b.y);
    expect(col).toHaveLength(4);
    for (const c of col) {
      expect(c.y).toBeGreaterThanOrEqual(bandTop - 0.001);
      expect(c.y + c.height).toBeLessThanOrEqual(bandBottom + 0.001);
    }
    for (let i = 1; i < col.length; i++) {
      expect(col[i].y - (col[i - 1].y + col[i - 1].height)).toBeGreaterThanOrEqual(
        layout.gap - 0.001,
      );
    }
  });

  it("sits a lone callout on its anchor rather than at the top of the band", () => {
    const layout = layoutPoster({
      elements: [element("solo")],
      anchors: { 0: { x: 0.2, y: 0.6 } },
    });
    const c = layout.callouts[0];
    expect(c.y + c.height / 2).toBeCloseTo(0.6 * H);
    // The leader leaves from the middle of the ramp strip, not the box centre.
    expect(c.origin.y).toBeGreaterThan(c.y);
    expect(c.origin.y).toBeLessThan(c.y + c.height);
  });

  it("leaves from whichever edge faces the anchor", () => {
    // An anchor behind its own column would make an inner-edge elbow double back.
    const layout = layoutPoster({
      elements: [element("edge")],
      anchors: { 0: { x: 0.02, y: 0.5, side: "left" } },
    });
    const c = layout.callouts[0];
    expect(c.anchor.x).toBeLessThan(c.x + COLUMN_W / 2);
    expect(c.origin.x).toBe(c.x);
  });

  it("preserves scheme order in the output regardless of anchor order", () => {
    const layout = layoutPoster({
      elements: [element("first"), element("second"), element("third")],
      anchors: { 0: { x: 0.2, y: 0.9 }, 1: { x: 0.2, y: 0.1 }, 2: { x: 0.8, y: 0.5 } },
    });
    expect(layout.callouts.map((c) => c.elementIndex)).toEqual([0, 1, 2]);
  });
});

describe("layoutPoster: degradation", () => {
  it("tightens the gap before touching any content", () => {
    // Sized so the column fits at GAP_TIGHT but not at GAP.
    const band = bandBottom - bandTop;
    const h = calloutHeight(3);
    const n = Math.floor((band + GAP) / (h + GAP)) + 1;
    expect((h + GAP) * n - GAP).toBeGreaterThan(band);
    expect((h + GAP_TIGHT) * n - GAP_TIGHT).toBeLessThanOrEqual(band);

    const { elements, anchors } = stack(n, 0.2);
    const layout = layoutPoster({ elements, anchors, options: LEAN });

    expect(layout.gap).toBe(GAP_TIGHT);
    expect(layout.callouts).toHaveLength(n);
    expect(layout.callouts.every((c) => c.hiddenCount === 0)).toBe(true);
    expect(layout.omitted).toEqual([]);
  });

  it("would rather close the gap than drop a paint name", () => {
    // The test above can't actually tell the two orders apart: with uniform
    // 3-paint elements every PAINT_TIERS entry produces the same callout height
    // (`tier: 2` still costs three rows once the "+N more" row is added), so it
    // passes whether gaps or truncation are tried first.
    //
    // This fixture can. One long element among several short ones overflows at
    // GAP and fits, whole, at GAP_TIGHT — so truncating it is a strictly worse
    // outcome that the packer must not reach for first.
    const elements = [element("long", 8), ...Array.from({ length: 6 }, (_, i) => element(`short${i}`, 1))];
    const anchors: PosterAnchors = {};
    elements.forEach((_, i) => {
      anchors[i] = { x: 0.2, y: (i + 0.5) / elements.length };
    });

    const layout = layoutPoster({ elements, anchors, options: LEAN });

    expect(layout.gap).toBe(GAP_TIGHT);
    expect(layout.callouts).toHaveLength(elements.length);
    expect(layout.callouts.every((c) => c.hiddenCount === 0)).toBe(true);
    expect(layout.omitted).toEqual([]);
  });

  it("truncates paint lists before dropping a callout, and says how many are hidden", () => {
    const elements = Array.from({ length: 5 }, (_, i) => element(`e${i}`, 8));
    const anchors: PosterAnchors = {};
    for (let i = 0; i < 5; i++) anchors[i] = { x: 0.2, y: (i + 0.5) / 5 };

    const layout = layoutPoster({ elements, anchors, options: LEAN });

    expect(layout.callouts).toHaveLength(5);
    const c = layout.callouts[0];
    expect(c.paints.length).toBeLessThan(8);
    expect(c.hiddenCount).toBe(8 - c.paints.length);
    // The ramp always reflects the whole element, even when the list is cut.
    expect(c.segs.length + c.overlays.length).toBe(8);
  });

  it("drops surplus callouts last, from the end of scheme order, and reports them", () => {
    const { elements, anchors } = stack(14, 0.2);
    const layout = layoutPoster({ elements, anchors, options: LEAN });

    expect(layout.callouts.length).toBeGreaterThan(0);
    expect(layout.callouts.length).toBeLessThan(14);

    const dropped = layout.omitted.filter((o) => o.reason === "no-space");
    expect(dropped.length).toBe(14 - layout.callouts.length);

    // Nothing vanishes silently: every element is either drawn or accounted for.
    const seen = new Set([
      ...layout.callouts.map((c) => c.elementIndex),
      ...layout.omitted.map((o) => o.elementIndex),
    ]);
    expect(seen.size).toBe(14);

    // Earlier elements cover more of the model, so they are the ones kept.
    const keptMax = Math.max(...layout.callouts.map((c) => c.elementIndex));
    const droppedMin = Math.min(...dropped.map((o) => o.elementIndex));
    expect(keptMax).toBeLessThan(droppedMin);
  });
});

describe("calloutHeight", () => {
  it("grows by exactly one row per paint", () => {
    expect(calloutHeight(4) - calloutHeight(3)).toBe(calloutHeight(3) - calloutHeight(2));
  });

  it("never collapses below a single row", () => {
    expect(calloutHeight(0)).toBe(calloutHeight(1));
  });

  it("honours a custom row pitch", () => {
    expect(calloutHeight(3, ROW_H + 10) - calloutHeight(3, ROW_H)).toBe(30);
  });
});

describe("manufacturer line", () => {
  it("adds exactly one brand line to each paint row", () => {
    expect(paintRowHeight({ showBrands: false })).toBe(ROW_H);
    expect(paintRowHeight({ showBrands: true })).toBe(ROW_H + BRAND_LINE_H);
  });

  it("is on by default — an unidentifiable recipe defeats the point of the image", () => {
    expect(defaultPosterOptions().showBrands).toBe(true);
  });

  it("costs poster space, and says so rather than overflowing", () => {
    // Sized to fit comfortably one-line, so any loss is attributable to brands.
    const { elements, anchors } = stack(6, 0.2);
    const lean = layoutPoster({ elements, anchors, options: LEAN });
    const tall = layoutPoster({ elements, anchors, options: { showBrands: true } });

    expect(lean.callouts).toHaveLength(6);
    expect(lean.omitted).toEqual([]);

    // Whatever it gives up — tighter gap, truncated lists, or dropped callouts —
    // the total must still be accounted for and must still fit the band.
    const lost =
      tall.omitted.length + tall.callouts.filter((c) => c.hiddenCount > 0).length;
    expect(lost).toBeGreaterThan(0);
    expect(tall.rowHeight).toBe(ROW_H + BRAND_LINE_H);
    for (const c of tall.callouts) {
      expect(c.y).toBeGreaterThanOrEqual(bandTop - 0.001);
      expect(c.y + c.height).toBeLessThanOrEqual(bandBottom + 0.001);
    }
  });

  it("derives the pitch from the options, so the renderer can't disagree", () => {
    // The packer takes the options whole rather than a pre-computed pitch:
    // passing them separately let a caller reserve one-line space while the
    // renderer drew two-line rows, crushing the brand into the next paint.
    for (const showBrands of [false, true]) {
      const layout = layoutPoster({
        elements: [element("e")],
        anchors: { 0: { x: 0.2, y: 0.5 } },
        options: { showBrands },
      });
      const pitch = paintRowHeight({ showBrands });
      expect(layout.rowHeight).toBe(pitch);
      expect(layout.callouts[0].height).toBe(calloutHeight(3, pitch));
    }
  });
});

describe("brandLabel", () => {
  it("never leaks the literal 'custom' sentinel to the poster", () => {
    const mixed: SchemePaint = { ...paint(), brand: "custom", range: "custom", custom: true };
    expect(brandLabel(mixed)).toBe("Custom colour");
    expect(brandLabel({ ...paint(), brand: "Citadel" })).toBe("Citadel");
  });

  it("keeps the real brand on a catalogue paint the user then tweaked", () => {
    // `custom` is set but the paint still came from a brand — name that brand.
    expect(brandLabel({ ...paint(), brand: "Vallejo", custom: true })).toBe("Vallejo");
  });
});
