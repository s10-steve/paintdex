import { describe, it, expect } from "vitest";
import { barModel, rampGradient, overlayCenter, elementSize, moveItem } from "@/lib/scheme/bars";
import {
  exportSchemeJSON,
  importScheme,
  importSchemeObject,
  schemeSlug,
  toExportShape,
  SCHEME_FORMAT,
} from "@/lib/scheme/io";
import { canonicalScheme, planReload, planSignInScheme } from "@/lib/scheme/sync";
import type { SchemeBinding } from "@/lib/scheme/local-store";
import type { SchemeRow } from "@/lib/supabase/types";
import {
  makeShareToken,
  makeShareSlug,
  shareUrl,
  SHARE_TOKEN_LENGTH,
} from "@/lib/scheme/share";
import {
  MAX_MIX_COMPONENTS,
  MAX_NOTE,
  MAX_SCHEME_TITLE,
  ROLES,
  roleOf,
  weightOf,
} from "@/lib/scheme/types";
import type { Scheme, SchemePaint, SchemeRole } from "@/lib/scheme/types";

let seq = 0;
function p(role: SchemeRole): SchemePaint {
  return { id: `p${seq++}`, name: role, brand: "custom", range: "custom", hex: "#808080", role };
}

describe("roles", () => {
  it("treats drybrush exactly like highlight", () => {
    // Same ramp behaviour and share of the bar; only its name and colour differ.
    expect(ROLES.drybrush.solid).toBe(ROLES.highlight.solid);
    expect(ROLES.drybrush.solid).toBe(true);
    expect(ROLES.drybrush.weight).toBe(ROLES.highlight.weight);
    expect(ROLES.drybrush.opacity).toBe(ROLES.highlight.opacity);
  });

  it("puts drybrush in the ramp, not the overlays", () => {
    const { segs, overlays } = barModel([p("base"), p("drybrush")]);
    expect(segs.map((s) => s.paint.role)).toEqual(["base", "drybrush"]);
    expect(overlays).toEqual([]);
  });

  it("survives an export/import round trip", () => {
    const imported = importSchemeObject(
      toExportShape({ title: "t", elements: [{ id: "e", name: "E", paints: [p("drybrush")] }] }),
      () => "x",
    );
    expect(imported.elements[0].paints[0].role).toBe("drybrush");
  });

  it("gives every overlay role the same share of the bar", () => {
    // Bands are told apart by colour and opacity, not thickness.
    const widths = (["wash", "glaze", "weathering"] as const).map((r) => weightOf(p(r)));
    expect(new Set(widths).size).toBe(1);
  });

  it("makes weathering more opaque than washes and glazes", () => {
    // Rust streaks and verdigris read far stronger than a glaze in practice.
    const weathering = roleOf(p("weathering")).opacity ?? 0;
    expect(weathering).toBeGreaterThan(roleOf(p("wash")).opacity ?? 0);
    expect(weathering).toBeGreaterThan(roleOf(p("glaze")).opacity ?? 0);
  });

  it("composites weathering normally, and washes/glazes as ink", () => {
    // The whole point: a mint oxide over brass must read as the oxide, not as
    // the brown-green that multiplying it against the base produces.
    expect(roleOf(p("weathering")).blendMode).toBe("normal");
    expect(roleOf(p("wash")).blendMode).toBe("multiply");
    expect(roleOf(p("glaze")).blendMode).toBe("multiply");
  });
});

describe("barModel", () => {
  it("splits solids (ramp) from wash/glaze/weathering overlays", () => {
    const { segs, overlays } = barModel([
      p("base"),
      p("wash"),
      p("layer"),
      p("glaze"),
      p("highlight"),
      p("weathering"),
    ]);
    expect(segs.map((s) => s.paint.role)).toEqual(["base", "layer", "highlight"]);
    expect(overlays.map((o) => o.paint.role)).toEqual(["wash", "glaze", "weathering"]);
    // Overlays retain their original index in the paint list (for placement).
    expect(overlays.map((o) => o.idx)).toEqual([1, 3, 5]);
  });

  it("weights segments proportionally and the fractions sum to 1", () => {
    // Role is the only thing that sizes a band: base 1.4 against highlight 0.55.
    const { segs } = barModel([p("base"), p("highlight")]);
    const total = ROLES.base.weight + ROLES.highlight.weight;
    expect(segs[0].frac).toBeCloseTo(ROLES.base.weight / total, 5);
    expect(segs[1].frac).toBeCloseTo(ROLES.highlight.weight / total, 5);
    expect(segs.reduce((n, s) => n + s.frac, 0)).toBeCloseTo(1, 5);
    // First segment sits at the bottom (start 0), last reaches the top (end 1).
    expect(segs[0].start).toBeCloseTo(0, 5);
    expect(segs[segs.length - 1].end).toBeCloseTo(1, 5);
  });

  it("orders the ramp by role weight, largest at the base", () => {
    const { segs } = barModel([p("base"), p("layer"), p("highlight")]);
    // Defaults 1.4 / 1.0 / 0.55 → base is the largest, highlight the smallest.
    expect(segs[0].frac).toBeGreaterThan(segs[1].frac);
    expect(segs[1].frac).toBeGreaterThan(segs[2].frac);
  });

  it("falls back to an equal ramp (and no overlays) when there are no solids", () => {
    const { segs, overlays } = barModel([p("wash"), p("glaze")]);
    expect(segs).toHaveLength(2);
    expect(overlays).toHaveLength(0);
    expect(segs[0].frac).toBeCloseTo(0.5, 5);
  });

  it("handles an empty element", () => {
    const { segs, overlays } = barModel([]);
    expect(segs).toHaveLength(0);
    expect(overlays).toHaveLength(0);
  });
});

describe("rampGradient", () => {
  it("returns a single colour for one segment", () => {
    const { segs } = barModel([p("base")]);
    expect(rampGradient(segs, true)).toBe("#808080");
  });

  it("emits one centre stop per colour when blended", () => {
    const { segs } = barModel([p("base"), p("layer"), p("highlight")]);
    const g = rampGradient(segs, true);
    expect(g.startsWith("linear-gradient(to top,")).toBe(true);
    // Three solids → three stops when blended.
    expect(g.match(/%/g)).toHaveLength(3);
  });

  it("emits paired boundary stops (hard steps) when banded", () => {
    const { segs } = barModel([p("base"), p("layer"), p("highlight")]);
    const g = rampGradient(segs, false);
    // Three solids → six stops (start+end per segment).
    expect(g.match(/%/g)).toHaveLength(6);
  });

  it("is empty for no segments", () => {
    expect(rampGradient([], true)).toBe("");
  });
});

describe("overlayCenter", () => {
  it("pins overlays applied before any solid to the bottom", () => {
    // wash at index 0, then base, layer.
    const paints = [p("wash"), p("base"), p("layer")];
    const { segs, overlays } = barModel(paints);
    expect(overlayCenter(overlays[0], segs)).toBeCloseTo(segs[0].start, 5);
  });

  it("pins overlays applied after all solids to the top", () => {
    const paints = [p("base"), p("layer"), p("glaze")];
    const { segs, overlays } = barModel(paints);
    expect(overlayCenter(overlays[0], segs)).toBeCloseTo(segs[segs.length - 1].end, 5);
  });

  it("places a mid-sequence overlay on the boundary between its neighbours", () => {
    // base, wash, layer → wash sits on the base/layer boundary.
    const paints = [p("base"), p("wash"), p("layer")];
    const { segs, overlays } = barModel(paints);
    expect(overlayCenter(overlays[0], segs)).toBeCloseTo(segs[0].end, 5);
  });
});

describe("elementSize", () => {
  it("gives the first element the largest width and each later one smaller", () => {
    const sizes = [0, 1, 2, 3].map(elementSize);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeLessThan(sizes[i - 1]);
    }
    expect(sizes[0]).toBe(1);
  });

  it("keeps the first-vs-last ratio bounded regardless of count", () => {
    // Geometric taper: the ratio between neighbours is constant, so a long list
    // never collapses later bars to zero the way a linear count→1 taper would.
    expect(elementSize(1) / elementSize(0)).toBeCloseTo(elementSize(6) / elementSize(5), 5);
  });

  // Regression: the raw Math.pow gives values like 0.4096000000000002, whose
  // serialisation into `flex-grow` differs between the server HTML and the
  // client's style object — a hydration mismatch on every server-rendered bar.
  // Bounding the decimals is what makes both sides agree.
  it("returns values short enough to serialise identically on server and client", () => {
    for (let i = 0; i < 16; i++) {
      const decimals = String(elementSize(i)).split(".")[1] ?? "";
      expect(decimals.length).toBeLessThanOrEqual(6);
    }
  });
});

describe("moveItem", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("moves an item up (dir -1) and down (dir +1)", () => {
    expect(moveItem(items, "b", -1).map((i) => i.id)).toEqual(["b", "a", "c"]);
    expect(moveItem(items, "b", 1).map((i) => i.id)).toEqual(["a", "c", "b"]);
  });

  it("returns the array unchanged at the ends or for an unknown id", () => {
    expect(moveItem(items, "a", -1)).toBe(items);
    expect(moveItem(items, "c", 1)).toBe(items);
    expect(moveItem(items, "z", 1)).toBe(items);
  });

  it("does not mutate the input array", () => {
    const moved = moveItem(items, "a", 1);
    expect(moved).not.toBe(items);
    expect(items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});

describe("scheme import/export", () => {
  let n = 0;
  const newId = () => `x${n++}`;

  const sample: Scheme = {
    title: "Test Scheme",
    elements: [
      {
        id: "e1",
        name: "Armour",
        paints: [
          { id: "a1", name: "Base Grey", brand: "Vallejo", range: "Model Color", hex: "#404040", role: "base" },
          { id: "a2", name: "My Mix", brand: "custom", range: "custom", hex: "#AABBCC", role: "highlight", custom: true },
        ],
      },
    ],
  };

  it("round-trips a scheme through export → import (ignoring ids)", () => {
    const json = exportSchemeJSON(sample);
    const back = importScheme(json, newId);
    expect(back.title).toBe("Test Scheme");
    expect(back.elements).toHaveLength(1);
    expect(back.elements[0].name).toBe("Armour");
    expect(back.elements[0].paints.map((p) => ({ ...p, id: undefined }))).toEqual([
      { id: undefined, name: "Base Grey", brand: "Vallejo", range: "Model Color", hex: "#404040", role: "base" },
      { id: undefined, name: "My Mix", brand: "custom", range: "custom", hex: "#AABBCC", role: "highlight", custom: true },
    ]);
  });

  it("assigns fresh unique ids on import", () => {
    const back = importScheme(exportSchemeJSON(sample), newId);
    const ids = [back.elements[0].id, ...back.elements[0].paints.map((p) => p.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("omits undefined weight/custom from the exported JSON", () => {
    const json = exportSchemeJSON(sample);
    const parsed = JSON.parse(json);
    expect(parsed.app).toBe("paintdex");
    expect("weight" in parsed.elements[0].paints[0]).toBe(false);
    expect("custom" in parsed.elements[0].paints[0]).toBe(false);
  });

  it("rejects non-JSON and non-schemes", () => {
    expect(() => importScheme("not json", newId)).toThrow(/valid JSON/);
    expect(() => importScheme("{}", newId)).toThrow(/paint scheme/);
    expect(() => importScheme('{"elements":"nope"}', newId)).toThrow(/paint scheme/);
  });

  it("sanitises bad fields instead of failing the whole import", () => {
    const dirty = JSON.stringify({
      elements: [{ name: "E", paints: [{ name: "P", hex: "zzz", role: "bogus" }] }],
    });
    const s = importScheme(dirty, newId);
    const paint = s.elements[0].paints[0];
    expect(paint.role).toBe("layer"); // unknown role → default
    expect(paint.hex).toBe("#808080"); // invalid hex → default
    expect(paint.brand).toBe("custom"); // missing → default
  });

  it("normalises hex to uppercase with a leading #", () => {
    const s = importScheme(
      JSON.stringify({ elements: [{ name: "E", paints: [{ name: "P", hex: "aabbcc", role: "base" }] }] }),
      newId,
    );
    expect(s.elements[0].paints[0].hex).toBe("#AABBCC");
  });

  it("slugifies titles for filenames", () => {
    expect(schemeSlug("Black Armour & Trim")).toBe("black-armour-trim");
    expect(schemeSlug("   ")).toBe("paint-scheme");
  });

  it("toExportShape produces the same object exportSchemeJSON stringifies", () => {
    const shape = toExportShape(sample);
    expect(shape.format).toBe(SCHEME_FORMAT);
    expect(shape.app).toBe("paintdex");
    // No runtime ids leak into the stored shape.
    expect(JSON.stringify(shape)).not.toMatch(/"id"/);
    expect(shape).toEqual(JSON.parse(exportSchemeJSON(sample)));
  });

  it("round-trips a scheme through toExportShape → importScheme (the account-sync path)", () => {
    // The DB stores the export shape as jsonb and loads it back through
    // importScheme without a stringify round trip; simulate that here.
    const stored = toExportShape(sample);
    const back = importScheme(JSON.stringify(stored), newId);
    expect(back.title).toBe("Test Scheme");
    expect(back.elements[0].paints.map((p) => ({ ...p, id: undefined }))).toEqual([
      { id: undefined, name: "Base Grey", brand: "Vallejo", range: "Model Color", hex: "#404040", role: "base" },
      { id: undefined, name: "My Mix", brand: "custom", range: "custom", hex: "#AABBCC", role: "highlight", custom: true },
    ]);
  });

  it("importSchemeObject sanitises an already-parsed object (no string round trip)", () => {
    const obj = { elements: [{ name: "E", paints: [{ name: "P", hex: "aabbcc", role: "bogus" }] }] };
    const s = importSchemeObject(obj, newId);
    expect(s.elements[0].paints[0].hex).toBe("#AABBCC");
    expect(s.elements[0].paints[0].role).toBe("layer");
  });

  /**
   * The per-paint `weight` override is gone — role alone sizes a band. An older
   * file or row still carrying one must import cleanly and simply lose it, not
   * carry a stray key into the document (which would leave every affected
   * scheme permanently unequal to its stored `syncedCanon`).
   */
  it("drops a legacy weight override rather than carrying it through", () => {
    const paint = importScheme(
      `{"elements":[{"name":"E","paints":[{"name":"P","hex":"#AABBCC","role":"base","weight":1e400}]}]}`,
      newId,
    ).elements[0].paints[0];

    expect("weight" in paint).toBe(false);
    expect(weightOf(paint)).toBe(ROLES.base.weight);
  });

  it("sizes every band from its role, with nothing left to sanitise", () => {
    // `weightOf` is the single read point, and a role can only be one of seven
    // known keys — an unknown one falls back to `layer` in `roleOf`.
    expect(weightOf(p("base"))).toBe(ROLES.base.weight);
    expect(weightOf(p("highlight"))).toBe(ROLES.highlight.weight);
    expect(weightOf({ ...p("base"), role: "nonsense" as SchemeRole })).toBe(ROLES.layer.weight);
  });

  describe("mixes and notes", () => {
    const withPaint = (fields: string) =>
      importScheme(`{"elements":[{"name":"E","paints":[{"name":"P","hex":"#AABBCC","role":"base"${fields}}]}]}`, newId)
        .elements[0].paints[0];
    const mixOf = (components: string) => withPaint(`,"mix":[${components}]`);

    it("keeps a usable share and clamps an unreasonable one", () => {
      expect(mixOf('{"name":"M","hex":"#FFFFFF","parts":2}').mix?.[0].parts).toBe(2);
      expect(mixOf('{"name":"M","hex":"#FFFFFF","parts":1e6}').mix?.[0].parts).toBe(100);
    });

    /**
     * Shares are normalised by their total, so an all-zero mix divides by zero
     * and every Lab channel comes out NaN — a malformed hex reaching
     * `addColorStop` and the public OpenGraph route. Zero is therefore rejected
     * outright rather than clamped, and defaults to a single share.
     */
    it("rejects an unusable share rather than passing it to the blend", () => {
      for (const bad of ["0", "-1", "1e400", '"2"', "null"]) {
        expect(mixOf(`{"name":"M","hex":"#FFFFFF","parts":${bad}}`).mix?.[0].parts).toBe(1);
      }
    });

    it("sanitises each component like a paint", () => {
      const c = mixOf('{"hex":"not a colour"}').mix?.[0];
      expect(c).toEqual({ name: "Untitled", brand: "custom", range: "custom", hex: "#808080", parts: 1 });
    });

    it("caps the component list", () => {
      const many = Array.from({ length: 9 }, () => '{"name":"M","hex":"#FFFFFF"}').join(",");
      expect(mixOf(many).mix).toHaveLength(MAX_MIX_COMPONENTS);
    });

    it("ignores a mix that isn't a list", () => {
      expect("mix" in withPaint(',"mix":"1:1"')).toBe(false);
    });

    it("carries the medium flag on both the primary and a component", () => {
      const p = withPaint(',"medium":true,"mix":[{"name":"M","hex":"#F9F9F9","medium":true}]');
      expect(p.medium).toBe(true);
      expect(p.mix?.[0].medium).toBe(true);
    });

    /**
     * `parts`/`medium` ride with `mix`. Without this rule a de-mixed entry
     * keeps a stray key, so its document never again equals the `syncedCanon`
     * it was saved with — every load looks like unflushed edits.
     */
    it("drops parts and medium when there is no mix", () => {
      const p = withPaint(',"parts":3,"medium":true');
      expect("parts" in p).toBe(false);
      expect("medium" in p).toBe(false);
      expect("parts" in toExportShape({ title: "", elements: [{ id: "e", name: "E", paints: [{ ...p, parts: 3, medium: true }] }] }).elements[0].paints[0]).toBe(false);
    });

    it("trims a note and caps it at the column's budget", () => {
      expect(withPaint(',"note":"  airbrush the top 75%  "').note).toBe("airbrush the top 75%");
      expect(withPaint(`,"note":"${"x".repeat(500)}"`).note).toHaveLength(MAX_NOTE);
    });

    it("drops an empty or non-string note", () => {
      for (const bad of ['""', '"   "', "42", "null"]) {
        expect("note" in withPaint(`,"note":${bad}`)).toBe(false);
      }
    });

    it("round-trips a mix and a note through export → import", () => {
      const before = mixOf('{"name":"Lahmian Medium","brand":"Citadel","range":"Technical","hex":"#F9F9F9","parts":1,"medium":true}');
      const scheme: Scheme = { title: "T", elements: [{ id: "e", name: "E", paints: [{ ...before, parts: 2, note: "glaze into the lips" }] }] };
      const after = importScheme(exportSchemeJSON(scheme), newId).elements[0].paints[0];
      expect(after.parts).toBe(2);
      expect(after.note).toBe("glaze into the lips");
      expect(after.mix).toEqual(before.mix);
    });
  });

  /**
   * The one that matters most. `canonicalScheme` is compared byte-for-byte
   * against the `syncedCanon` stored with a saved scheme, so a single
   * unconditional key added to `toExportShape` would make every document in
   * existence look dirty on its next load — and start a 1s-debounce autosave
   * for every signed-in user at once. Frozen literal, deliberately.
   */
  it("emits byte-identical canonical JSON for a scheme with no mix or note", () => {
    const legacy = {
      format: 1,
      app: "paintdex",
      title: "Test Scheme",
      elements: [
        {
          name: "Armour",
          paints: [
            { name: "Base Grey", brand: "Vallejo", range: "Model Color", hex: "#404040", role: "base" },
            { name: "My Mix", brand: "custom", range: "custom", hex: "#AABBCC", role: "highlight", custom: true },
          ],
        },
      ],
    };
    expect(canonicalScheme(legacy)).toBe(
      '{"format":1,"app":"paintdex","title":"Test Scheme","elements":[{"name":"Armour","paints":[' +
        '{"name":"Base Grey","brand":"Vallejo","range":"Model Color","hex":"#404040","role":"base"},' +
        '{"name":"My Mix","brand":"custom","range":"custom","hex":"#AABBCC","role":"highlight","custom":true}' +
        "]}]}",
    );
  });

  it("trims a title to the database's limit", () => {
    const long = "x".repeat(MAX_SCHEME_TITLE + 50);
    const s = importScheme(JSON.stringify({ title: long, elements: [] }), newId);
    expect(s.title).toHaveLength(MAX_SCHEME_TITLE);
  });
});

describe("planSignInScheme (sign-in reconciliation)", () => {
  const blank: Scheme = { title: "", elements: [] };
  const built: Scheme = {
    title: "White Templars",
    elements: [
      {
        id: "e1",
        name: "Armour",
        paints: [
          { id: "p1", name: "Grey Seer", brand: "Citadel", range: "Base", hex: "#C6C6C4", role: "base" },
        ],
      },
    ],
  };

  it("adopts the local scheme when the user has nothing saved", () => {
    expect(planSignInScheme([], built)).toBe("adopt-local");
    expect(planSignInScheme([], blank)).toBe("adopt-local");
  });

  it("loads the latest saved scheme when the local one is blank", () => {
    expect(planSignInScheme([toExportShape(built)], blank)).toBe("load-latest");
  });

  it("loads the latest when the local scheme is already saved (no duplicate)", () => {
    expect(planSignInScheme([toExportShape(built)], built)).toBe("load-latest");
  });

  it("adopts local — preserving work built while signed out — when it isn't saved", () => {
    const other = toExportShape({ ...built, title: "Something Else" });
    expect(planSignInScheme([other], built)).toBe("adopt-local");
  });

  it("compares regardless of JSON key order (jsonb doesn't preserve it)", () => {
    const shape = toExportShape(built);
    const reordered = {
      elements: shape.elements,
      app: shape.app,
      title: shape.title,
      format: shape.format,
    };
    expect(planSignInScheme([reordered], built)).toBe("load-latest");
  });
});

describe("planReload (reconciling a bound document)", () => {
  const built: Scheme = {
    title: "White Templars",
    elements: [
      {
        id: "e1",
        name: "Armour",
        paints: [
          { id: "p1", name: "Grey Seer", brand: "Citadel", range: "Base", hex: "#C6C6C4", role: "base" },
        ],
      },
    ],
  };
  const edited: Scheme = { ...built, title: "White Templars (wip)" };

  const asRow = (id: string, s: Scheme, title = s.title): SchemeRow =>
    ({
      id,
      user_id: "u1",
      title,
      data: toExportShape(s),
      is_public: false,
      share_slug: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    }) as SchemeRow;

  const bound = (id: string, synced: Scheme, userId = "u1"): SchemeBinding => ({
    id,
    userId,
    syncedCanon: canonicalScheme(synced),
  });

  it("takes the server's copy when the editor holds nothing unflushed", () => {
    // The rename-on-another-device case: same row, different title. It must
    // resolve to the server's row, not to a second copy of ours.
    const renamed = asRow("row-1", built, "Renamed on the phone");
    const plan = planReload({
      rows: [renamed],
      binding: bound("row-1", built),
      local: built,
      userId: "u1",
    });
    expect(plan).toEqual({ kind: "load-row", row: renamed });
  });

  it("keeps local edits that never reached the server", () => {
    // Autosave is debounced, so a tab closed mid-edit leaves the document ahead
    // of the row. Taking the server's copy here would be silent data loss.
    const plan = planReload({
      rows: [asRow("row-1", built)],
      binding: bound("row-1", built),
      local: edited,
      userId: "u1",
    });
    expect(plan.kind).toBe("keep-local");
  });

  it("reports a deleted row instead of re-creating it, and offers the next one", () => {
    const other = asRow("row-2", built, "Something else");
    const plan = planReload({
      rows: [other],
      binding: bound("row-1", built),
      local: built,
      userId: "u1",
    });
    // The id comes back with the plan so the caller doesn't have to re-derive it
    // from a binding it only knows is non-null by how this branch is reached.
    expect(plan).toEqual({ kind: "deleted-elsewhere", id: "row-1", next: other });
  });

  it("reports a deleted row with nothing to fall back to", () => {
    const plan = planReload({
      rows: [],
      binding: bound("row-1", built),
      local: built,
      userId: "u1",
    });
    // Emphatically not "adopt-local": that is the branch that used to undo the
    // delete, by inserting the local copy as a brand-new row.
    expect(plan).toEqual({ kind: "deleted-elsewhere", id: "row-1", next: null });
  });

  it("ignores a binding belonging to another account on a shared browser", () => {
    // u2's rows say nothing about u1's binding, so announcing a deletion would
    // be a lie — fall back to the content path.
    const plan = planReload({
      rows: [asRow("row-9", { ...built, title: "u2's own scheme" })],
      binding: bound("row-1", built, "u1"),
      local: built,
      userId: "u2",
    });
    // Not "deleted-elsewhere" — the content path's answer for unsaved local work.
    expect(plan.kind).toBe("adopt-local");
  });

  it("defers to planSignInScheme when there is no binding", () => {
    const rows = [asRow("row-1", built)];
    const blank: Scheme = { title: "", elements: [] };
    for (const local of [built, blank, { ...built, title: "Unsaved" }]) {
      expect(planReload({ rows, binding: null, local, userId: "u1" }).kind).toBe(
        planSignInScheme(rows.map((r) => r.data), local),
      );
    }
    expect(planReload({ rows: [], binding: null, local: built, userId: "u1" }).kind).toBe(
      "adopt-local",
    );
  });
});

describe("share links", () => {
  it("derives a fixed-length lowercase base-36 token from bytes (deterministic)", () => {
    const bytes = new Uint8Array([0, 1, 255, 128, 42, 7, 200, 99]);
    const a = makeShareToken(bytes);
    const b = makeShareToken(bytes);
    expect(a).toBe(b); // pure: same input → same output
    expect(a).toHaveLength(SHARE_TOKEN_LENGTH);
    expect(a).toMatch(/^[0-9a-z]+$/);
  });

  it("produces different tokens for different random bytes", () => {
    const a = makeShareToken(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    const b = makeShareToken(new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2]));
    expect(a).not.toBe(b);
  });

  it("never returns an empty token, even for all-zero bytes", () => {
    expect(makeShareToken(new Uint8Array(6)).length).toBeGreaterThan(0);
  });

  it("builds a readable slug: title-slug + token", () => {
    const slug = makeShareSlug("White Templars!", "3f9a2b7c10");
    expect(slug).toBe("white-templars-3f9a2b7c10");
  });

  it("falls back to the default title slug when the title is blank", () => {
    expect(makeShareSlug("   ", "abc123")).toBe("paint-scheme-abc123");
  });

  it("builds an absolute share URL and tolerates a trailing slash in origin", () => {
    expect(shareUrl("https://paintdex.app", "foo-123")).toBe(
      "https://paintdex.app/scheme/foo-123",
    );
    expect(shareUrl("https://paintdex.app/", "foo-123")).toBe(
      "https://paintdex.app/scheme/foo-123",
    );
  });
});
