import { describe, it, expect } from "vitest";
import { getAllPaints } from "@/lib/paints/load";

describe("getAllPaints", () => {
  // The precomputed similar-colour index (build-similar-index.ts) and the
  // browse index (build-browse-index.ts) both rank/emit in name-A–Z-within-brand
  // order. getAllPaints() must use the SAME order so that findSimilar over it
  // breaks equal-distance ties identically to the precomputed index. If this
  // ever drifts, the runtime findSimilar and the prebuilt lists diverge on ties.
  it("is ordered name A–Z within brand", () => {
    const paints = getAllPaints();
    const expected = [...paints].sort(
      (x, y) => x.brand.localeCompare(y.brand) || x.name.localeCompare(y.name),
    );
    expect(paints.map((p) => p.id)).toEqual(expected.map((p) => p.id));
  });
});
