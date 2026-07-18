import { describe, it, expect } from "vitest";
import { hexToLab, hueFamily } from "@/lib/color";
import { filterPaints, findSimilar } from "@/lib/paints/filter";
import type { Paint, PaintWithLab } from "@/lib/paints/types";

function make(p: Paint): PaintWithLab {
  return { ...p, lab: hexToLab(p.hex), family: hueFamily(p.hex) };
}

const paints: PaintWithLab[] = [
  make({ id: "citadel-abaddon-black", name: "Abaddon Black", brand: "Citadel", range: "Base", type: "base", hex: "#000000", discontinued: false }),
  make({ id: "citadel-mephiston-red", name: "Mephiston Red", brand: "Citadel", range: "Base", type: "base", hex: "#9A1115", discontinued: false }),
  make({ id: "vallejo-black", name: "Black", brand: "Vallejo", range: "Model Color", type: "other", hex: "#0A0A0A", discontinued: false }),
  make({ id: "vallejo-old-red", name: "Old Red", brand: "Vallejo", range: "Game Color", type: "other", hex: "#A01418", discontinued: true }),
];

describe("filterPaints", () => {
  it("hides discontinued by default and shows them when asked", () => {
    expect(filterPaints(paints, {}).length).toBe(3);
    expect(filterPaints(paints, { includeDiscontinued: true }).length).toBe(4);
  });

  it("filters by brand (OR within facet)", () => {
    const r = filterPaints(paints, { brands: ["Vallejo"] });
    expect(r.map((p) => p.id)).toEqual(["vallejo-black"]);
  });

  it("searches across name and brand", () => {
    expect(filterPaints(paints, { search: "black" }).length).toBe(2);
    expect(filterPaints(paints, { search: "mephiston" }).map((p) => p.id)).toEqual([
      "citadel-mephiston-red",
    ]);
  });

  it("filters by colour family", () => {
    const reds = filterPaints(paints, { families: ["red"], includeDiscontinued: true });
    expect(reds.every((p) => p.family === "red")).toBe(true);
    expect(reds.length).toBe(2);
  });

  it("sorts by lightness", () => {
    const r = filterPaints(paints, { includeDiscontinued: true }, "lightness");
    const lightness = r.map((p) => p.lab[0]);
    expect(lightness).toEqual([...lightness].sort((a, b) => a - b));
  });
});

describe("findSimilar", () => {
  const target = paints[0]; // Abaddon Black

  it("ranks the closest colour first and excludes the target", () => {
    const r = findSimilar(paints, target);
    expect(r[0].paint.id).toBe("vallejo-black");
    expect(r.find((s) => s.paint.id === target.id)).toBeUndefined();
  });

  it("can exclude same-brand paints", () => {
    const r = findSimilar(paints, paints[1], { excludeSameBrand: true });
    expect(r.every((s) => s.paint.brand !== "Citadel")).toBe(true);
  });

  it("excludes discontinued by default", () => {
    const r = findSimilar(paints, paints[1]);
    expect(r.find((s) => s.paint.discontinued)).toBeUndefined();
  });
});
