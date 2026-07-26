import { describe, it, expect } from "vitest";
import { hexToLab, hueFamily } from "@/lib/color";
import { filterPaints, findSimilar } from "@/lib/paints/filter";
import type { BrowsePaint, Paint, PaintWithLab } from "@/lib/paints/types";

// Carries both the full Lab triple (for findSimilar) and the lightness `l`
// (for filterPaints), so the same records satisfy PaintWithLab and BrowsePaint.
function make(p: Paint): PaintWithLab & BrowsePaint {
  const lab = hexToLab(p.hex);
  return { ...p, lab, l: lab[0], family: hueFamily(p.hex) };
}

const paints: (PaintWithLab & BrowsePaint)[] = [
  make({ id: "citadel-abaddon-black", name: "Abaddon Black", brand: "Citadel", range: "Base", type: "base", hex: "#000000", discontinued: false }),
  make({ id: "citadel-mephiston-red", name: "Mephiston Red", brand: "Citadel", range: "Base", type: "base", hex: "#9A1115", discontinued: false }),
  make({ id: "vallejo-black", name: "Black", brand: "Vallejo", range: "Model Color", type: "other", hex: "#0A0A0A", discontinued: false }),
  make({ id: "vallejo-old-red", name: "Old Red", brand: "Vallejo", range: "Game Color", type: "other", hex: "#A01418", discontinued: true }),
  make({ id: "tamiya-panel-line-dark-brown", name: "Panel Line Accent Color: Dark Brown", brand: "Tamiya", range: "Panel Line Accent", type: "wash", hex: "#4A342A", discontinued: false, code: "87140" }),
];

describe("filterPaints", () => {
  it("hides discontinued by default and shows them when asked", () => {
    expect(filterPaints(paints, {}).length).toBe(4);
    expect(filterPaints(paints, { includeDiscontinued: true }).length).toBe(5);
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

  it("matches every word of a multi-word query anywhere in the paint", () => {
    // The reported bug: the words are all there, just not contiguous.
    expect(filterPaints(paints, { search: "panel line dark brown" }).map((p) => p.id)).toEqual([
      "tamiya-panel-line-dark-brown",
    ]);
    // Order within the query doesn't matter.
    expect(filterPaints(paints, { search: "brown dark panel" }).map((p) => p.id)).toEqual([
      "tamiya-panel-line-dark-brown",
    ]);
    // A contiguous phrase still works (regression guard).
    expect(filterPaints(paints, { search: "accent color: dark" }).map((p) => p.id)).toEqual([
      "tamiya-panel-line-dark-brown",
    ]);
  });

  it("matches tokens across different fields, and rejects an absent token", () => {
    expect(filterPaints(paints, { search: "mephiston citadel" }).map((p) => p.id)).toEqual([
      "citadel-mephiston-red",
    ]);
    expect(filterPaints(paints, { search: "87140 tamiya" }).map((p) => p.id)).toEqual([
      "tamiya-panel-line-dark-brown",
    ]);
    expect(filterPaints(paints, { search: "mephiston vallejo" })).toEqual([]);
  });

  it("treats a blank or whitespace-only query as no query", () => {
    expect(filterPaints(paints, { search: "" }).length).toBe(4);
    expect(filterPaints(paints, { search: "   " }).length).toBe(4);
  });

  it("orders matches by relevance, not alphabetically", () => {
    // Vallejo's "Black" is the name exactly; Citadel's merely contains the word,
    // so the exact match leads despite "Abaddon Black" sorting first by name.
    expect(filterPaints(paints, { search: "black" })[0].id).toBe("vallejo-black");

    // An explicit sort still wins over relevance.
    expect(filterPaints(paints, { search: "black" }, "brand").map((p) => p.id)).toEqual([
      "citadel-abaddon-black",
      "vallejo-black",
    ]);
  });

  it("filters by colour family", () => {
    const reds = filterPaints(paints, { families: ["red"], includeDiscontinued: true });
    expect(reds.every((p) => p.family === "red")).toBe(true);
    expect(reds.length).toBe(2);
  });

  it("sorts by lightness", () => {
    const r = filterPaints(paints, { includeDiscontinued: true }, "lightness");
    const lightness = r.map((p) => p.l);
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
