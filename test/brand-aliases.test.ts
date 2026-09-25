/**
 * Citadel → Warhammer. The catalogue relabelled its paints but kept their
 * `citadel-*` ids, so the old name lives on only in what the catalogue doesn't
 * own: saved schemes, old links, and what people type.
 */
import { describe, it, expect } from "vitest";
import { canonicalBrand, formerBrand } from "@/lib/paints/brand-aliases";
import { getAllPaints } from "@/lib/paints/load";

describe("canonicalBrand", () => {
  it("maps a former name to the current one, whatever its case", () => {
    expect(canonicalBrand("Citadel")).toBe("Warhammer");
    expect(canonicalBrand(" citadel ")).toBe("Warhammer");
  });

  it("leaves every other brand alone", () => {
    expect(canonicalBrand("Warhammer")).toBe("Warhammer");
    expect(canonicalBrand("Vallejo")).toBe("Vallejo");
  });
});

describe("formerBrand", () => {
  it("is Citadel for a relabelled paint", () => {
    expect(formerBrand({ id: "citadel-abaddon-black", brand: "Warhammer" })).toBe("Citadel");
  });

  it("is nothing for a paint launched after the rename", () => {
    // Tone Pro was never sold as Citadel; saying so would be false.
    expect(formerBrand({ id: "warhammer-kasrkin-green-3", brand: "Warhammer" })).toBeUndefined();
  });

  it("is nothing for another brand", () => {
    expect(formerBrand({ id: "vallejo-black", brand: "Vallejo" })).toBeUndefined();
  });
});

describe("the real catalogue", () => {
  it("has no paint left under a former brand name", () => {
    // Otherwise `?brand=Citadel` would be mapped away from paints that still
    // carry it, and they'd be unreachable by brand.
    expect(getAllPaints().filter((p) => p.brand === "Citadel")).toEqual([]);
  });

  it("carries all of Tone Pro: thirty colours, five tones each", () => {
    const tones = getAllPaints().filter((p) => p.range === "Tone Pro");
    expect(tones).toHaveLength(150);
    expect(tones.every((p) => p.type === "tone" && p.brand === "Warhammer")).toBe(true);
    for (const n of [1, 2, 3, 4, 5]) {
      expect(tones.filter((p) => p.name.endsWith(` ${n}`))).toHaveLength(30);
    }
  });
});
