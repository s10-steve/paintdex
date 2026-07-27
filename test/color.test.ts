import { describe, it, expect } from "vitest";
import {
  hexToRgb,
  normalizeHex,
  hexToLab,
  ciede2000,
  contrastText,
  hueFamily,
  labToLch,
  chroma,
  hueDelta,
  NEUTRAL_CHROMA,
} from "@/lib/color";

describe("hex parsing", () => {
  it("parses #RRGGBB", () => {
    expect(hexToRgb("#FF8800")).toEqual([255, 136, 0]);
  });
  it("parses shorthand #RGB", () => {
    expect(hexToRgb("#f80")).toEqual([255, 136, 0]);
  });
  it("normalizes to uppercase #RRGGBB", () => {
    expect(normalizeHex("ff8800")).toBe("#FF8800");
    expect(normalizeHex("#f80")).toBe("#FF8800");
  });
  it("throws on invalid hex", () => {
    expect(() => hexToRgb("nope")).toThrow();
  });
});

describe("ciede2000", () => {
  it("is zero for identical colours", () => {
    expect(ciede2000(hexToLab("#231F20"), hexToLab("#231F20"))).toBeCloseTo(0, 6);
  });

  it("matches the Sharma et al. reference pair (~2.0425)", () => {
    // From the canonical CIEDE2000 test dataset.
    const lab1 = [50, 2.6772, -79.7751] as const;
    const lab2 = [50, 0, -82.7485] as const;
    expect(ciede2000(lab1, lab2)).toBeCloseTo(2.0425, 3);
  });

  it("another reference pair (~2.8615)", () => {
    const lab1 = [50, 3.1571, -77.2803] as const;
    const lab2 = [50, 0, -82.7485] as const;
    expect(ciede2000(lab1, lab2)).toBeCloseTo(2.8615, 3);
  });

  it("ranks near-identical blacks closer than a distant colour", () => {
    const black = hexToLab("#000000");
    const nearBlack = ciede2000(black, hexToLab("#0A0A0A"));
    const white = ciede2000(black, hexToLab("#FFFFFF"));
    expect(nearBlack).toBeLessThan(white);
    expect(white).toBeGreaterThan(90);
  });
});

describe("contrastText", () => {
  it("uses white text on dark backgrounds", () => {
    expect(contrastText("#000000")).toBe("#ffffff");
    expect(contrastText("#231F20")).toBe("#ffffff");
  });
  it("uses black text on light backgrounds", () => {
    expect(contrastText("#FFFFFF")).toBe("#000000");
    expect(contrastText("#F9F9F9")).toBe("#000000");
  });
});

describe("hueFamily", () => {
  it("classifies primaries", () => {
    expect(hueFamily("#FF0000")).toBe("red");
    expect(hueFamily("#00FF00")).toBe("green");
    expect(hueFamily("#0000FF")).toBe("blue");
  });
  it("classifies neutrals", () => {
    expect(hueFamily("#000000")).toBe("neutral");
    expect(hueFamily("#FFFFFF")).toBe("neutral");
    expect(hueFamily("#808080")).toBe("neutral");
  });
  it("classifies brown as a dark/muted orange", () => {
    expect(hueFamily("#5A3A1A")).toBe("brown");
  });
});

describe("labToLch", () => {
  it("keeps L* and derives chroma from a*/b*", () => {
    const lch = labToLch([50, 3, 4]);
    expect(lch.l).toBe(50);
    expect(lch.c).toBeCloseTo(5, 10); // 3-4-5 triangle
  });

  it("reports hue anticlockwise from +a*, in [0, 360)", () => {
    expect(labToLch([50, 10, 0]).h).toBeCloseTo(0, 10);
    expect(labToLch([50, 0, 10]).h).toBeCloseTo(90, 10);
    expect(labToLch([50, -10, 0]).h).toBeCloseTo(180, 10);
    // Negative atan2 results are wrapped up, never left negative.
    expect(labToLch([50, 0, -10]).h).toBeCloseTo(270, 10);
  });

  it("gives a grey zero chroma", () => {
    const lch = labToLch(hexToLab("#808080"));
    expect(lch.c).toBeLessThan(0.5);
    expect(lch.h).toBeGreaterThanOrEqual(0);
    expect(lch.h).toBeLessThan(360);
  });

  it("puts a saturated red near hue 40 with high chroma", () => {
    const lch = labToLch(hexToLab("#FF0000"));
    expect(lch.c).toBeGreaterThan(100);
    expect(lch.h).toBeGreaterThan(30);
    expect(lch.h).toBeLessThan(45);
  });
});

describe("chroma / NEUTRAL_CHROMA", () => {
  it("separates the catalogue's greys from its colours", () => {
    expect(chroma("#989C94")).toBeLessThan(NEUTRAL_CHROMA); // Administratum Grey
    expect(chroma("#960C09")).toBeGreaterThan(NEUTRAL_CHROMA); // Mephiston Red
  });
});

describe("hueDelta", () => {
  it("is zero for the same hue", () => {
    expect(hueDelta(200, 200)).toBe(0);
  });

  it("takes the short way round the wrap point", () => {
    expect(hueDelta(350, 10)).toBeCloseTo(20, 10);
    expect(hueDelta(10, 350)).toBeCloseTo(-20, 10);
  });

  it("signs ordinary moves by direction", () => {
    expect(hueDelta(0, 90)).toBeCloseTo(90, 10);
    expect(hueDelta(90, 0)).toBeCloseTo(-90, 10);
  });

  it("reports a half-turn as +180, keeping the range (-180, 180]", () => {
    expect(hueDelta(0, 180)).toBe(180);
    expect(hueDelta(180, 0)).toBe(180);
  });

  it("never returns a magnitude above 180", () => {
    for (let from = 0; from < 360; from += 7) {
      for (let to = 0; to < 360; to += 11) {
        const d = hueDelta(from, to);
        expect(Math.abs(d)).toBeLessThanOrEqual(180);
      }
    }
  });
});
