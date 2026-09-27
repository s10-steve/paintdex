import { describe, it, expect } from "vitest";
import { MAX_SUGGESTION, paintGroup, shoppingList } from "@/lib/scheme/shopping-list";
import type { BrowsePaint } from "@/lib/paints/types";
import type { Scheme, SchemePaint } from "@/lib/scheme/types";
import type { PaintStatus } from "@/lib/supabase/types";

const bp = (
  id: string,
  name: string,
  brand: string,
  hex: string,
  range = "Base",
  extra: Partial<BrowsePaint> = {},
): BrowsePaint =>
  ({
    id,
    name,
    brand,
    range,
    type: "opaque",
    format: "brush",
    binder: "acrylic",
    hex,
    discontinued: false,
    family: "red",
    l: 40,
    ...extra,
  }) as BrowsePaint;

const CATALOGUE: BrowsePaint[] = [
  bp("citadel-mephiston-red", "Mephiston Red", "Warhammer", "#960C09"),
  bp("citadel-agrax", "Agrax Earthshade", "Warhammer", "#5A4A2E", "Shade", { type: "wash" }),
  bp("citadel-lahmian", "Lahmian Medium", "Warhammer", "#F9F9F9", "Technical", { type: "medium" }),
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
    // White is no stand-in for red: past MAX_SUGGESTION there's nothing close.
    expect(list.needed[0].closestOwned).toBeNull();
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

describe("like-for-like suggestions", () => {
  // The three bad suggestions from the first preview, in miniature.
  const LIKE: BrowsePaint[] = [
    bp("macragge", "Macragge Blue", "Warhammer", "#0D407F"),
    bp("nuln", "Nuln Oil", "Warhammer", "#14100E", "Shade", { type: "wash" }),
    bp("kantor", "Kantor Blue", "Warhammer", "#02134E"),
    bp("fenrisian", "Fenrisian Grey", "Warhammer", "#6D94B3", "Layer", { type: "opaque" }),
    bp("heavy-metal", "Heavy Metal", "Scale 75", "#7090A8", "Metal", { type: "opaque", metallic: true }),
    bp("stormhost", "Stormhost Silver", "Warhammer", "#BBBBBB", "Layer", { type: "opaque", metallic: true }),
    bp("lahmian", "Lahmian Medium", "Warhammer", "#BDBDBD", "Technical", { type: "medium" }),
    bp("silver-other", "Silver", "Vallejo", "#B0B0B0", "Model Color", { type: "opaque", metallic: true }),
    bp("agrax", "Agrax Earthshade", "Warhammer", "#5A4A2E", "Shade", { type: "wash" }),
    bp("seraphim", "Seraphim Sepia", "Warhammer", "#6A5530", "Shade", { type: "wash" }),
  ];
  const own = (...ids: string[]) => new Map(ids.map((id) => [id, "owned" as PaintStatus]));
  const needFor = (name: string, owned: Map<string, PaintStatus>) => {
    const p = LIKE.find((x) => x.name === name)!;
    return shoppingList(
      scheme(["X", [sp(p.name, p.brand, p.range, p.hex)]]),
      LIKE,
      owned,
    ).needed[0];
  };

  it("never offers a wash for an opaque paint", () => {
    expect(needFor("Macragge Blue", own("nuln", "kantor")).closestOwned?.paint.id).toBe("kantor");
    expect(needFor("Macragge Blue", own("nuln")).closestOwned).toBeNull();
  });

  it("offers a wash for a wash", () => {
    expect(needFor("Agrax Earthshade", own("seraphim", "kantor")).closestOwned?.paint.id).toBe(
      "seraphim",
    );
  });

  it("matches metallic finish both ways", () => {
    expect(needFor("Fenrisian Grey", own("heavy-metal")).closestOwned).toBeNull();
    expect(needFor("Stormhost Silver", own("silver-other")).closestOwned?.paint.id).toBe(
      "silver-other",
    );
  });

  it("never suggests a technical paint, nor anything for one", () => {
    expect(needFor("Stormhost Silver", own("lahmian")).closestOwned).toBeNull();
    expect(needFor("Lahmian Medium", own("stormhost", "silver-other")).closestOwned).toBeNull();
  });

  it("uses the scheme role to narrow a hand-entered colour", () => {
    const list = shoppingList(
      scheme(["X", [sp("My shade", "custom", "custom", "#5A4A2E", { custom: true, role: "wash" })]]),
      LIKE,
      own("seraphim", "kantor"),
    );
    expect(list.unmatched[0].closestOwned?.paint.id).toBe("seraphim");
  });

  it("groups the catalogue's types coarsely", () => {
    expect(paintGroup({ type: "opaque" })).toBe("opaque");
    // An ink thinned is a wash, and a glaze is a wash over a wider area.
    expect((["wash", "glaze", "ink"] as const).map((type) => paintGroup({ type }))).toEqual(
      Array(3).fill("wash"),
    );
    expect(paintGroup({ type: "contrast" })).toBe("one-coat");
    // No colour substitute for any of these.
    expect((["varnish", "medium", "technical"] as const).map((type) => paintGroup({ type }))).toEqual(
      Array(3).fill("technical"),
    );
    expect(MAX_SUGGESTION).toBe(20);
  });

  it("only suggests a paint with the same binder", () => {
    // Tamiya's enamel panel-line wash is a wash, but not a stand-in for an
    // acrylic shade — and the reverse.
    const withEnamel: BrowsePaint[] = [
      ...LIKE,
      bp("panel-line", "Panel Line Accent Color: Brown", "Tamiya", "#5B4A2F", "Weathering & Accents", {
        type: "wash",
        binder: "enamel",
      }),
    ];
    const need = (name: string, owned: Map<string, PaintStatus>) => {
      const p = withEnamel.find((x) => x.name === name)!;
      return shoppingList(scheme(["X", [sp(p.name, p.brand, p.range, p.hex)]]), withEnamel, owned).needed[0];
    };
    expect(need("Agrax Earthshade", own("panel-line")).closestOwned).toBeNull();
    expect(need("Agrax Earthshade", own("panel-line", "seraphim")).closestOwned?.paint.id).toBe("seraphim");
    expect(need("Panel Line Accent Color: Brown", own("seraphim")).closestOwned).toBeNull();
  });

  it("ignores format: an airbrush version stands in for the pot", () => {
    const withAir: BrowsePaint[] = [
      ...LIKE,
      bp("kantor-air", "Kantor Blue", "Warhammer", "#02134E", "Air", { format: "airbrush" }),
    ];
    const p = withAir.find((x) => x.id === "macragge")!;
    const list = shoppingList(scheme(["X", [sp(p.name, p.brand, p.range, p.hex)]]), withAir, own("kantor-air"));
    expect(list.needed[0].closestOwned?.paint.id).toBe("kantor-air");
  });
});
