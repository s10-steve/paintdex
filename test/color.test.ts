import { describe, it, expect } from "vitest";
import {
  hexToRgb,
  normalizeHex,
  hexToLab,
  ciede2000,
  contrastText,
  hueFamily,
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
