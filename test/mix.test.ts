/**
 * The mixed-entry maths: the Lab blend in `@/lib/color` and the
 * `SchemePaint`-shaped helpers in `@/lib/scheme/mix`.
 *
 * The blend feeds canvas `addColorStop` and the Satori OpenGraph route, so most
 * of what's pinned here is what happens to malformed input — it must degrade,
 * never throw and never emit something that isn't a hex.
 */
import { describe, expect, it } from "vitest";
import { blendHexLab, ciede2000, hexToLab, labToHex, normalizeHex } from "@/lib/color";
import {
  components,
  displayHex,
  hasMix,
  mixBrandLabel,
  mixName,
  mixTitle,
  partsOf,
  ratioLabel,
} from "@/lib/scheme/mix";
import type { MixComponent, SchemePaint } from "@/lib/scheme/types";

const HEX = /^#[0-9A-F]{6}$/;

const paint = (over: Partial<SchemePaint> = {}): SchemePaint => ({
  id: "p1",
  name: "Agrax Earthshade",
  brand: "Citadel",
  range: "Shade",
  hex: "#3C3C28",
  role: "wash",
  ...over,
});

const comp = (over: Partial<MixComponent> = {}): MixComponent => ({
  name: "Lahmian Medium",
  brand: "Citadel",
  range: "Technical",
  hex: "#F9F9F9",
  parts: 1,
  ...over,
});

describe("labToHex", () => {
  it("round-trips a colour through Lab without moving it", () => {
    for (const hex of ["#000000", "#FFFFFF", "#3C3C28", "#F9F9F9", "#52543F", "#97604C"]) {
      expect(labToHex(hexToLab(hex))).toBe(hex);
    }
  });

  it("clamps an out-of-gamut Lab point instead of emitting a broken hex", () => {
    // Far outside sRGB in every direction; unclamped this produces negative
    // channels, and `(-3).toString(16)` is "-3" — not a hex.
    for (const lab of [
      [150, 200, 200],
      [-50, -200, -200],
    ] as const) {
      expect(labToHex(lab)).toMatch(HEX);
    }
  });
});

describe("blendHexLab", () => {
  it("puts a 1:1 black/white mix in the middle", () => {
    const mid = blendHexLab([
      { hex: "#000000", weight: 1 },
      { hex: "#FFFFFF", weight: 1 },
    ]);
    expect(mid).toMatch(HEX);
    // L* 0 and 100 average to 50, which is a mid grey — not #808080, which is
    // the *sRGB* midpoint and perceptually lighter.
    expect(hexToLab(mid)[0]).toBeCloseTo(50, 0);
  });

  it("lands nearer the heavier side of an uneven mix", () => {
    const heavy = blendHexLab([
      { hex: "#000000", weight: 3 },
      { hex: "#FFFFFF", weight: 1 },
    ]);
    const toBlack = ciede2000(hexToLab(heavy), hexToLab("#000000"));
    const toWhite = ciede2000(hexToLab(heavy), hexToLab("#FFFFFF"));
    expect(toBlack).toBeLessThan(toWhite);
  });

  it("drops entries with an unusable weight", () => {
    const only = { hex: "#3C3C28", weight: 1 };
    for (const bad of [0, -1, NaN, Infinity]) {
      expect(blendHexLab([only, { hex: "#FFFFFF", weight: bad }])).toBe("#3C3C28");
    }
  });

  it("skips an unparseable hex rather than throwing", () => {
    expect(() => blendHexLab([{ hex: "not a colour", weight: 1 }])).not.toThrow();
    expect(blendHexLab([{ hex: "#3C3C28", weight: 1 }, { hex: "zzz", weight: 1 }])).toBe(
      "#3C3C28",
    );
  });

  it("falls back to grey when nothing survives, never to NaN", () => {
    expect(blendHexLab([])).toBe("#808080");
    expect(blendHexLab([{ hex: "#3C3C28", weight: 0 }])).toBe("#808080");
  });

  it("returns a lone survivor untouched, with no Lab round trip", () => {
    // A plain paint's colour must come back bit-identical rather than shifted
    // by a rounding step it never needed.
    expect(blendHexLab([{ hex: "#abA390", weight: 7 }])).toBe(normalizeHex("#ABA390"));
  });
});

describe("partsOf", () => {
  it("defaults anything unusable to one share", () => {
    for (const bad of [undefined, 0, -1, NaN, Infinity]) {
      expect(partsOf({ parts: bad as number | undefined })).toBe(1);
    }
    expect(partsOf({ parts: 2.5 })).toBe(2.5);
  });
});

describe("displayHex", () => {
  it("returns a plain paint's own colour, identically", () => {
    const p = paint();
    expect(hasMix(p)).toBe(false);
    expect(displayHex(p)).toBe(p.hex);
  });

  it("treats an empty mix array as no mix at all", () => {
    expect(displayHex(paint({ mix: [], parts: 3 }))).toBe("#3C3C28");
  });

  /**
   * The case the whole `medium` flag exists for. Lahmian Medium is #F9F9F9 in
   * the catalogue, so blending it as a pigment drags a 1:1 Agrax wash to a pale
   * beige — when in reality it is the same brown, thinner.
   */
  it("leaves a medium out of the blend", () => {
    const tinted = displayHex(paint({ parts: 1, mix: [comp()] }));
    const thinned = displayHex(paint({ parts: 1, mix: [comp({ medium: true })] }));

    expect(thinned).toBe("#3C3C28");
    expect(ciede2000(hexToLab(tinted), hexToLab("#3C3C28"))).toBeGreaterThan(10);
  });

  it("blends everything when every component is a medium", () => {
    // Nothing left to tint with, so grey would be a worse answer than the mean.
    const out = displayHex(
      paint({ medium: true, parts: 1, mix: [comp({ medium: true })] }),
    );
    expect(out).toMatch(HEX);
    expect(out).not.toBe("#808080");
  });

  it("moves with the ratio", () => {
    const even = displayHex(paint({ parts: 1, mix: [comp()] }));
    const heavy = displayHex(paint({ parts: 4, mix: [comp()] }));
    const d = (hex: string) => ciede2000(hexToLab(hex), hexToLab("#3C3C28"));
    expect(d(heavy)).toBeLessThan(d(even));
  });

  it("is stable across two structurally equal paints", () => {
    const a = paint({ id: "a", parts: 1, mix: [comp()] });
    const b = paint({ id: "b", parts: 1, mix: [comp()] });
    expect(displayHex(a)).toBe(displayHex(b));
  });
});

describe("labels", () => {
  const mixed = paint({ parts: 1, mix: [comp({ medium: true })] });

  it("joins names and shares", () => {
    expect(mixName(mixed)).toBe("Agrax Earthshade + Lahmian Medium");
    expect(ratioLabel(mixed)).toBe("1:1");
    expect(mixTitle(mixed)).toBe("1:1 Agrax Earthshade + Lahmian Medium");
  });

  it("counts a medium in the ratio even though it isn't in the blend", () => {
    // The user typed 1:1 and wants to read 1:1 back.
    expect(ratioLabel(mixed)).toBe("1:1");
  });

  it("leaves a plain paint's labels alone", () => {
    const p = paint();
    expect(mixName(p)).toBe("Agrax Earthshade");
    expect(ratioLabel(p)).toBe("");
    expect(mixTitle(p)).toBe("Agrax Earthshade");
  });

  it("trims trailing zeroes off a fractional share", () => {
    expect(ratioLabel(paint({ parts: 1, mix: [comp({ parts: 0.5 })] }))).toBe("1:0.5");
  });

  it("falls back to one share when a stored value is unusable", () => {
    const p = paint({ parts: NaN, mix: [comp({ parts: 0 })] });
    expect(ratioLabel(p)).toBe("1:1");
    expect(components(p).every((c) => c.parts === 1)).toBe(true);
  });

  it("names three paints in order, primary first", () => {
    const p = paint({
      parts: 2,
      mix: [comp({ name: "Nuln Oil" }), comp({ name: "Contrast Medium" })],
    });
    expect(mixName(p)).toBe("Agrax Earthshade + Nuln Oil + Contrast Medium");
    expect(ratioLabel(p)).toBe("2:1:1");
  });

  describe("mixBrandLabel", () => {
    it("collapses one repeated maker to a single name", () => {
      expect(mixBrandLabel(mixed)).toBe("Citadel");
    });

    it("joins two distinct makers", () => {
      expect(mixBrandLabel(paint({ parts: 1, mix: [comp({ brand: "Vallejo" })] }))).toBe(
        "Citadel · Vallejo",
      );
    });

    it("caps at two — the poster's brand line has no room for a third", () => {
      const p = paint({
        parts: 1,
        mix: [comp({ brand: "Vallejo" }), comp({ brand: "Scale 75" })],
      });
      expect(mixBrandLabel(p)).toBe("Citadel · Vallejo");
    });

    it("names a hand-entered colour rather than showing 'custom'", () => {
      const p = paint({
        parts: 1,
        mix: [comp({ brand: "custom", range: "custom", custom: true })],
      });
      expect(mixBrandLabel(p)).toBe("Citadel · Custom colour");
    });
  });
});
