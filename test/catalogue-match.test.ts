/**
 * Recovering a catalogue id from a scheme paint.
 *
 * This exists because a `SchemePaint` carries no catalogue id — it is stripped
 * on export, regenerated on import, and discarded when a paint is added — so the
 * visualiser's collection toggle has to match on name and maker instead.
 *
 * The cases that matter are the ones where it must return `null` rather than
 * guess: a custom colour, an unloaded catalogue, and a paint whose name has
 * moved on. All three render no button, which is the safe failure — a missing
 * control, never one wired to the wrong paint.
 */
import { describe, it, expect } from "vitest";
import { cataloguePaintId } from "@/lib/paints/catalogue-match";
import type { BrowsePaint } from "@/lib/paints/types";

const paint = (
  id: string,
  name: string,
  brand: string,
  range: string,
  extra: Partial<BrowsePaint> = {},
): BrowsePaint =>
  ({
    id,
    name,
    brand,
    range,
    type: "base",
    hex: "#123456",
    discontinued: false,
    family: "blue",
    l: 40,
    ...extra,
  }) as BrowsePaint;

const CATALOGUE: BrowsePaint[] = [
  paint("citadel-abaddon-black", "Abaddon Black", "Citadel", "Base"),
  paint("citadel-mephiston-red", "Mephiston Red", "Citadel", "Base"),
  // The same name under two makers, and the same name under two ranges.
  paint("vallejo-white-air", "White", "Vallejo", "Model Air"),
  paint("vallejo-white-color", "White", "Vallejo", "Model Color"),
  paint("ap-white", "White", "Army Painter", "Warpaints"),
  // A paint sold across several lines: `range` is the primary, `ranges` the rest.
  paint("citadel-lahmian-medium", "Lahmian Medium", "Citadel", "Technical", {
    ranges: ["Technical", "Shade"],
  }),
];

const query = (name: string, brand: string, range: string, custom?: boolean) => ({
  name,
  brand,
  range,
  ...(custom ? { custom: true } : {}),
});

describe("cataloguePaintId", () => {
  it("matches on brand, range and name", () => {
    expect(cataloguePaintId(query("Abaddon Black", "Citadel", "Base"), CATALOGUE)).toBe(
      "citadel-abaddon-black",
    );
  });

  it("is case- and whitespace-insensitive", () => {
    expect(cataloguePaintId(query("  abaddon black ", "citadel", "BASE"), CATALOGUE)).toBe(
      "citadel-abaddon-black",
    );
  });

  it("keeps two ranges of the same name apart", () => {
    // The whole reason the narrow key leads: "White" is three different paints.
    expect(cataloguePaintId(query("White", "Vallejo", "Model Air"), CATALOGUE)).toBe(
      "vallejo-white-air",
    );
    expect(cataloguePaintId(query("White", "Vallejo", "Model Color"), CATALOGUE)).toBe(
      "vallejo-white-color",
    );
    expect(cataloguePaintId(query("White", "Army Painter", "Warpaints"), CATALOGUE)).toBe(
      "ap-white",
    );
  });

  it("falls back to brand and name when the range has changed", () => {
    // A scheme saved before a range was renamed still resolves, to one of the
    // paints of that name — same colour either way.
    expect(cataloguePaintId(query("Mephiston Red", "Citadel", "Layer"), CATALOGUE)).toBe(
      "citadel-mephiston-red",
    );
  });

  it("matches a secondary range from `ranges`", () => {
    // `range` is only the primary line; a scheme may have recorded another.
    expect(cataloguePaintId(query("Lahmian Medium", "Citadel", "Shade"), CATALOGUE)).toBe(
      "citadel-lahmian-medium",
    );
  });

  it("does not cross brands on the fallback", () => {
    expect(cataloguePaintId(query("White", "Nonexistent Brand", "Anything"), CATALOGUE)).toBeNull();
  });

  describe("returns null rather than guessing", () => {
    it("for a hand-entered custom colour", () => {
      expect(cataloguePaintId(query("My mix", "custom", "custom", true), CATALOGUE)).toBeNull();
    });

    it("for a paint the catalogue no longer has", () => {
      expect(cataloguePaintId(query("Gone In 2011", "Citadel", "Base"), CATALOGUE)).toBeNull();
    });

    it("while the catalogue is still loading", () => {
      expect(cataloguePaintId(query("Abaddon Black", "Citadel", "Base"), null)).toBeNull();
      expect(cataloguePaintId(query("Abaddon Black", "Citadel", "Base"), [])).toBeNull();
    });

    it("for an empty name or brand", () => {
      expect(cataloguePaintId(query("", "Citadel", "Base"), CATALOGUE)).toBeNull();
      expect(cataloguePaintId(query("Abaddon Black", "", "Base"), CATALOGUE)).toBeNull();
    });
  });

  it("ignores hex entirely", () => {
    // Catalogue hexes are best-effort and do get corrected, so a scheme saved
    // with the old value must still resolve. Nothing in the query carries one.
    const stale = { name: "Abaddon Black", brand: "Citadel", range: "Base" };
    expect(cataloguePaintId(stale, CATALOGUE)).toBe("citadel-abaddon-black");
  });

  it("keeps separate arrays separate", () => {
    // The index is memoized at module scope on the array's identity, so a second
    // catalogue must not answer from the first one's map.
    const other = [paint("other-black", "Abaddon Black", "Citadel", "Base")];
    expect(cataloguePaintId(query("Abaddon Black", "Citadel", "Base"), CATALOGUE)).toBe(
      "citadel-abaddon-black",
    );
    expect(cataloguePaintId(query("Abaddon Black", "Citadel", "Base"), other)).toBe("other-black");
    expect(cataloguePaintId(query("Abaddon Black", "Citadel", "Base"), CATALOGUE)).toBe(
      "citadel-abaddon-black",
    );
  });
});
