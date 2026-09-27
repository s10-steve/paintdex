import { describe, it, expect } from "vitest";
import { shoppingList } from "@/lib/scheme/shopping-list";
import type { BrowsePaint } from "@/lib/paints/types";
import type { Scheme, SchemePaint } from "@/lib/scheme/types";
import type { PaintStatus } from "@/lib/supabase/types";

const bp = (id: string, name: string, brand: string, hex: string, range = "Base"): BrowsePaint =>
  ({ id, name, brand, range, type: "base", hex, discontinued: false, family: "red", l: 40 }) as BrowsePaint;

const CATALOGUE: BrowsePaint[] = [
  bp("citadel-mephiston-red", "Mephiston Red", "Warhammer", "#960C09"),
  bp("citadel-agrax", "Agrax Earthshade", "Warhammer", "#5A4A2E", "Shade"),
  bp("citadel-lahmian", "Lahmian Medium", "Warhammer", "#F9F9F9", "Technical"),
  bp("vallejo-bloody-red", "Bloody Red", "Vallejo", "#9A0E0E", "Game Color"),
  bp("vallejo-white", "Dead White", "Vallejo", "#FFFFFF", "Game Color"),
];

let n = 0;
const sp = (name: string, brand: string, range: string, hex: string, extra: Partial<SchemePaint> = {}): SchemePaint => ({
  id: `p${n++}`,
  name,
  brand,
  range,
  hex,
  role: "base",
  ...extra,
});

const scheme = (...elements: [string, SchemePaint[]][]): Scheme => ({
  title: "Test",
  elements: elements.map(([name, paints], i) => ({ id: `e${i}`, name, paints })),
});

const ids = (items: { paintId: string }[]) => items.map((i) => i.paintId);

describe("shoppingList", () => {
  it("splits the scheme's paints into owned, wishlist and to-buy", () => {
    const entries = new Map<string, PaintStatus>([
      ["vallejo-bloody-red", "owned"],
      ["citadel-agrax", "wishlist"],
    ]);
    const list = shoppingList(
      scheme([
        "Armour",
        [
          sp("Mephiston Red", "Warhammer", "Base", "#960C09"),
          sp("Agrax Earthshade", "Warhammer", "Shade", "#5A4A2E"),
          sp("Bloody Red", "Vallejo", "Game Color", "#9A0E0E"),
        ],
      ]),
      CATALOGUE,
      entries,
    );
    expect(ids(list.owned)).toEqual(["vallejo-bloody-red"]);
    expect(ids(list.wishlist)).toEqual(["citadel-agrax"]);
    expect(ids(list.needed)).toEqual(["citadel-mephiston-red"]);
  });

  it("lists a paint used on several elements once, with every element it's on", () => {
    const red = () => sp("Mephiston Red", "Warhammer", "Base", "#960C09");
    const list = shoppingList(scheme(["Armour", [red()]], ["Cloak", [red()]], ["Armour", [red()]]), CATALOGUE, new Map());
    expect(list.needed).toHaveLength(1);
    expect(list.needed[0].elements).toEqual(["Armour", "Cloak"]);
  });

  it("counts every ingredient of a mix, mediums included", () => {
    // You still have to buy Lahmian Medium, even though the blend ignores it.
    const wash = sp("Agrax Earthshade", "Warhammer", "Shade", "#5A4A2E", {
      mix: [{ name: "Lahmian Medium", brand: "Warhammer", range: "Technical", hex: "#F9F9F9", parts: 1, medium: true }],
    });
    const list = shoppingList(scheme(["Recesses", [wash]]), CATALOGUE, new Map());
    expect(ids(list.needed)).toEqual(["citadel-agrax", "citadel-lahmian"]);
  });

  it("still matches paints a scheme saved under the old Citadel name", () => {
    const list = shoppingList(
      scheme(["Armour", [sp("Mephiston Red", "Citadel", "Base", "#960C09")]]),
      CATALOGUE,
      new Map(),
    );
    expect(ids(list.needed)).toEqual(["citadel-mephiston-red"]);
  });

  it("keeps custom colours and unknown paints as unmatched, with a reason", () => {
    const list = shoppingList(
      scheme([
        "Gems",
        [
          sp("My green", "custom", "custom", "#00AA00", { custom: true }),
          sp("Renamed Paint", "Warhammer", "Base", "#123456"),
        ],
      ]),
      CATALOGUE,
      new Map(),
    );
    expect(list.unmatched.map((u) => [u.name, u.reason])).toEqual([
      ["My green", "custom"],
      ["Renamed Paint", "not-found"],
    ]);
    expect(list.needed).toEqual([]);
  });

  it("offers the closest paint you own, by colour, for anything you haven't got", () => {
    const entries = new Map<string, PaintStatus>([
      ["vallejo-bloody-red", "owned"],
      ["vallejo-white", "owned"],
      // Wishlisted paints aren't ones you can reach for.
      ["citadel-agrax", "wishlist"],
    ]);
    const list = shoppingList(
      scheme(["Armour", [sp("Mephiston Red", "Warhammer", "Base", "#960C09")]]),
      CATALOGUE,
      entries,
    );
    expect(list.needed[0].closestOwned?.paint.id).toBe("vallejo-bloody-red");
    expect(list.needed[0].closestOwned?.distance).toBeLessThan(5);
  });

  it("gives wishlist and unmatched items a closest owned paint too", () => {
    const entries = new Map<string, PaintStatus>([
      ["vallejo-bloody-red", "owned"],
      ["citadel-mephiston-red", "wishlist"],
    ]);
    const list = shoppingList(
      scheme([
        "Armour",
        [
          sp("Mephiston Red", "Warhammer", "Base", "#960C09"),
          sp("Deep red", "custom", "custom", "#990000", { custom: true }),
        ],
      ]),
      CATALOGUE,
      entries,
    );
    expect(list.wishlist[0].closestOwned?.paint.id).toBe("vallejo-bloody-red");
    expect(list.unmatched[0].closestOwned?.paint.id).toBe("vallejo-bloody-red");
  });

  it("has no closest paint when you own nothing, and survives a malformed hex", () => {
    const list = shoppingList(
      scheme(["X", [sp("Mephiston Red", "Warhammer", "Base", "#960C09"), sp("Bad", "custom", "custom", "nope", { custom: true })]]),
      CATALOGUE,
      new Map([["vallejo-white", "owned" as PaintStatus]]),
    );
    expect(list.needed[0].closestOwned?.paint.id).toBe("vallejo-white");
    expect(list.unmatched[0].closestOwned).toBeNull();
    expect(shoppingList(scheme(["X", [sp("Mephiston Red", "Warhammer", "Base", "#960C09")]]), CATALOGUE, new Map()).needed[0].closestOwned).toBeNull();
  });

  it("is empty for an empty scheme", () => {
    expect(shoppingList(scheme(), CATALOGUE, new Map())).toEqual({
      owned: [],
      wishlist: [],
      needed: [],
      unmatched: [],
    });
  });
});
