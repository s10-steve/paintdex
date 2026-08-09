/**
 * `/my-paints`'s display options: how a collection is sorted and grouped.
 *
 * Two things here are decisions rather than mechanics, and both are what the
 * assertions are really for: near-neutral paints are collected at the *end* of a
 * hue sort rather than interleaved at meaningless angles, and colour-family
 * groups come out in spectrum order rather than alphabetically.
 */
import { describe, it, expect } from "vitest";
import { groupCollection } from "@/lib/paints/collection-view";
import type { BrowsePaint } from "@/lib/paints/types";

const paint = (
  id: string,
  name: string,
  hex: string,
  extra: Partial<BrowsePaint> = {},
): BrowsePaint =>
  ({
    id,
    name,
    brand: "Citadel",
    range: "Base",
    type: "base",
    hex,
    discontinued: false,
    family: "red",
    l: 50,
    ...extra,
  }) as BrowsePaint;

const names = (paints: readonly BrowsePaint[]) => paints.map((p) => p.name);
const flat = (paints: BrowsePaint[], sort: Parameters<typeof groupCollection>[2]) =>
  names(groupCollection(paints, [], sort)[0].paints);

describe("sorting", () => {
  const red = paint("red", "Red", "#cc0000", { family: "red", l: 44 });
  const yellow = paint("yellow", "Yellow", "#e8d000", { family: "yellow", l: 84 });
  const green = paint("green", "Green", "#00a000", { family: "green", l: 57 });
  const blue = paint("blue", "Blue", "#0040c0", { family: "blue", l: 33 });

  it("sorts by name by default, which is what the page opens on", () => {
    expect(flat([yellow, blue, red], "name")).toEqual(["Blue", "Red", "Yellow"]);
  });

  it("runs hue red → yellow → green → blue", () => {
    expect(flat([blue, green, yellow, red], "hue")).toEqual([
      "Red",
      "Yellow",
      "Green",
      "Blue",
    ]);
  });

  it("collects near-neutrals after the coloured paints, light to dark reversed", () => {
    // Below NEUTRAL_CHROMA a hue angle is noise, not merely small — greys would
    // otherwise be sprayed through the spectrum at angles that mean nothing.
    const white = paint("white", "White", "#f2f2f0", { family: "neutral", l: 95 });
    const grey = paint("grey", "Grey", "#7b7b7d", { family: "neutral", l: 52 });
    const black = paint("black", "Black", "#161618", { family: "neutral", l: 8 });

    expect(flat([white, blue, grey, red, black], "hue")).toEqual([
      "Red",
      "Blue",
      "Black",
      "Grey",
      "White",
    ]);
  });

  it("sorts saturation most vivid first, so the greys fall to the end", () => {
    const grey = paint("grey", "Grey", "#7b7b7d", { family: "neutral", l: 52 });
    expect(flat([grey, red], "chroma")).toEqual(["Red", "Grey"]);
  });

  it("sorts lightness dark to light, from the index's precomputed L*", () => {
    expect(flat([yellow, blue, green], "lightness")).toEqual(["Blue", "Green", "Yellow"]);
  });

  it("puts a paint whose hex won't parse last rather than throwing", () => {
    const broken = paint("broken", "Broken", "not-a-colour", { family: "neutral", l: 50 });
    expect(flat([broken, red], "hue")).toEqual(["Red", "Broken"]);
    expect(flat([broken, red], "chroma")).toEqual(["Red", "Broken"]);
  });

  it("breaks ties on name, so equal colours don't swap between renders", () => {
    const b = paint("b", "Bravo", "#cc0000", { l: 44 });
    const a = paint("a", "Alpha", "#cc0000", { l: 44 });
    expect(flat([b, a], "hue")).toEqual(["Alpha", "Bravo"]);
    expect(flat([b, a], "lightness")).toEqual(["Alpha", "Bravo"]);
  });

  it("leaves the caller's array alone", () => {
    const input = [yellow, blue, red];
    groupCollection(input, [], "hue");
    expect(names(input)).toEqual(["Yellow", "Blue", "Red"]);
  });
});

describe("grouping", () => {
  const citadelRed = paint("c-red", "Mephiston Red", "#960c0c", { family: "red" });
  const vallejoBlue = paint("v-blue", "Andrea Blue", "#1f6cb0", {
    brand: "Vallejo",
    range: "Model Color",
    family: "blue",
    type: "layer",
  });
  const citadelBlue = paint("c-blue", "Macragge Blue", "#0d407f", {
    range: "Layer",
    family: "blue",
    type: "layer",
  });

  it("returns one unlabelled group when nothing is ticked", () => {
    const groups = groupCollection([citadelRed, vallejoBlue], [], "name");
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("");
    expect(groups[0].label).toBe("");
    expect(groups[0].groups).toEqual([]);
  });

  it("groups by brand, alphabetically", () => {
    const groups = groupCollection([vallejoBlue, citadelRed], ["brand"], "name");
    expect(groups.map((g) => g.label)).toEqual(["Citadel", "Vallejo"]);
    expect(names(groups[0].paints)).toEqual(["Mephiston Red"]);
  });

  it("groups by range, alphabetically", () => {
    const groups = groupCollection([citadelBlue, citadelRed, vallejoBlue], ["range"], "name");
    expect(groups.map((g) => g.label)).toEqual(["Base", "Layer", "Model Color"]);
  });

  it("orders colour families as a spectrum, not A–Z, and cases the label once", () => {
    // Alphabetical would put Blue before Red and Yellow last; and the label has
    // to come from `facetLabel`, so a heading and its facet checkbox can't
    // disagree about casing.
    const groups = groupCollection([vallejoBlue, citadelRed], ["family"], "name");
    expect(groups.map((g) => g.label)).toEqual(["Red", "Blue"]);
    expect(groups.map((g) => g.key)).toEqual(["red", "blue"]);
  });

  it("orders types by the catalogue's own vocabulary, not A–Z", () => {
    // `PAINT_TYPES` runs base → layer → shade …, which is the order the pots
    // are used in; alphabetically Layer would come before Base.
    const groups = groupCollection([citadelBlue, citadelRed], ["type"], "name");
    expect(groups.map((g) => g.label)).toEqual(["Base", "Layer"]);
  });

  it("sorts within each group, not just across the whole list", () => {
    const groups = groupCollection([citadelBlue, citadelRed], ["brand"], "hue");
    expect(names(groups[0].paints)).toEqual(["Mephiston Red", "Macragge Blue"]);
  });

  it("has no groups at all for an empty list", () => {
    expect(groupCollection([], ["brand"], "name")).toEqual([]);
  });
});

describe("grouping on two axes", () => {
  const citadelBase = paint("c-red", "Mephiston Red", "#960c0c", { range: "Base" });
  const citadelLayer = paint("c-blue", "Macragge Blue", "#0d407f", { range: "Layer" });
  const vallejo = paint("v-blue", "Andrea Blue", "#1f6cb0", {
    brand: "Vallejo",
    range: "Model Color",
  });
  const all = [citadelLayer, vallejo, citadelBase];

  it("nests in the order the axes are given — first ticked is the outer heading", () => {
    const groups = groupCollection(all, ["brand", "range"], "name");
    expect(groups.map((g) => g.label)).toEqual(["Citadel", "Vallejo"]);
    expect(groups[0].groups.map((g) => g.label)).toEqual(["Base", "Layer"]);
    expect(names(groups[0].groups[0].paints)).toEqual(["Mephiston Red"]);
  });

  it("flips when the axes are given the other way round", () => {
    const groups = groupCollection(all, ["range", "brand"], "name");
    expect(groups.map((g) => g.label)).toEqual(["Base", "Layer", "Model Color"]);
    expect(groups[0].groups.map((g) => g.label)).toEqual(["Citadel"]);
  });

  it("gives a parent every paint beneath it, so its count needs no summing", () => {
    const groups = groupCollection(all, ["brand", "range"], "name");
    expect(names(groups[0].paints)).toEqual(["Macragge Blue", "Mephiston Red"]);
    expect(groups[0].paints).toHaveLength(
      groups[0].groups.reduce((n, g) => n + g.paints.length, 0),
    );
  });

  it("leaves the leaves in the chosen sort", () => {
    const groups = groupCollection(all, ["brand", "range"], "hue");
    expect(names(groups[0].paints)).toEqual(["Mephiston Red", "Macragge Blue"]);
  });
});
