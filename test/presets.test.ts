/**
 * The curated example schemes (`src/lib/scheme/presets.ts`).
 *
 * The important test here is the drift guard: presets deliberately store
 * catalogue *ids* rather than hex values, which only works if every id really
 * resolves. If a paint is renamed or dropped from `data/paints/`, this suite is
 * what turns that into a red build instead of a homepage full of grey bars.
 */
import { describe, it, expect } from "vitest";
import { getPaintById } from "@/lib/paints/load";
import {
  SCHEME_PRESETS,
  findPreset,
  resolvePreset,
  resolvePresets,
  type PresetPaintData,
} from "@/lib/scheme/presets";
import { ROLES, roleOf } from "@/lib/scheme/types";
import { importSchemeObject, toExportShape } from "@/lib/scheme/io";

const allRefs = SCHEME_PRESETS.flatMap((spec) =>
  spec.elements.flatMap((el) => el.paints.map((ref) => ({ spec, el, ref }))),
);

describe("SCHEME_PRESETS", () => {
  it("has unique slugs", () => {
    const slugs = SCHEME_PRESETS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  // The drift guard. A failure here means a preset points at a paint that no
  // longer exists — fix the preset (or the data), don't relax the test.
  it("references only paint ids that exist in the catalogue", () => {
    const missing = allRefs
      .filter(({ ref }) => getPaintById(ref.id) === undefined)
      .map(({ spec, ref }) => `${spec.slug}: ${ref.id}`);
    expect(missing).toEqual([]);
  });

  it("uses only real roles", () => {
    const bad = allRefs
      .filter(({ ref }) => !(ref.role in ROLES))
      .map(({ spec, ref }) => `${spec.slug}: ${ref.id} → ${ref.role}`);
    expect(bad).toEqual([]);
  });

  // An element with no solid paint has an empty tonal ramp, so `barModel` falls
  // back to treating the overlays as solids and the bar renders as the
  // diagonal-hatch empty state. Never what a showcase scheme wants.
  it("gives every element at least one solid-role paint", () => {
    const flat = SCHEME_PRESETS.flatMap((spec) =>
      spec.elements.map((el) => ({ spec, el })),
    );
    const rampless = flat
      .filter(({ el }) => !el.paints.some((ref) => ROLES[ref.role]?.solid))
      .map(({ spec, el }) => `${spec.slug}: ${el.name}`);
    expect(rampless).toEqual([]);
  });

  it("keeps every fallback hex a valid 6-digit hex", () => {
    // Deliberately NOT asserting the fallback equals the catalogue hex: a
    // legitimate data correction would then fail the build. The fallback only
    // ever renders in an already-degraded state.
    const bad = allRefs
      .filter(({ ref }) => !/^#[0-9A-Fa-f]{6}$/.test(ref.fallback.hex))
      .map(({ spec, ref }) => `${spec.slug}: ${ref.id}`);
    expect(bad).toEqual([]);
  });
});

describe("resolvePreset", () => {
  const spec = SCHEME_PRESETS[0];

  it("resolves names, brands and hexes from the lookup", () => {
    const resolved = resolvePreset(spec, getPaintById);
    const first = resolved.elements[0].paints[0];
    const source = getPaintById(spec.elements[0].paints[0].id)!;
    expect(first.name).toBe(source.name);
    expect(first.brand).toBe(source.brand);
    expect(first.range).toBe(source.range);
    expect(first.hex).toBe(source.hex.toUpperCase());
    expect(first.role).toBe(spec.elements[0].paints[0].role);
  });

  it("carries the scheme title and slug through", () => {
    const resolved = resolvePreset(spec, getPaintById);
    expect(resolved.title).toBe(spec.title);
    expect(resolved.slug).toBe(spec.slug);
  });

  it("preserves an explicit weight and omits it otherwise", () => {
    const resolved = resolvePreset(spec, getPaintById);
    for (const [i, el] of spec.elements.entries()) {
      for (const [j, ref] of el.paints.entries()) {
        const out = resolved.elements[i].paints[j];
        if (ref.weight === undefined) expect("weight" in out).toBe(false);
        else expect(out.weight).toBe(ref.weight);
      }
    }
  });

  it("falls back to the literal when a paint has left the catalogue", () => {
    const resolved = resolvePreset(spec, () => undefined);
    const ref = spec.elements[0].paints[0];
    const out = resolved.elements[0].paints[0];
    expect(out.name).toBe(ref.fallback.name);
    expect(out.hex).toBe(ref.fallback.hex.toUpperCase());
    expect(out.role).toBe(ref.role);
    // A missing catalogue entry is not a hand-mixed colour.
    expect(out.custom).toBeUndefined();
  });

  it("honours hexOverride over the catalogue hex", () => {
    const stub = (): PresetPaintData => ({
      name: "Stub",
      brand: "Stub",
      range: "Stub",
      hex: "#111111",
    });
    const overridden = resolvePreset(
      {
        ...spec,
        elements: [
          {
            name: "One",
            paints: [
              { ...spec.elements[0].paints[0], hexOverride: "#abcdef" },
            ],
          },
        ],
      },
      stub,
    );
    expect(overridden.elements[0].paints[0].hex).toBe("#ABCDEF");
  });
});

describe("resolvePresets", () => {
  it("produces ids that are unique across all presets", () => {
    const resolved = resolvePresets(getPaintById);
    const ids = resolved.flatMap((s) => [
      ...s.elements.map((e) => e.id),
      ...s.elements.flatMap((e) => e.paints.map((p) => p.id)),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Ids come from slug+position, not `uid()` — a session counter would give the
  // server and the client different values and break hydration.
  it("produces the same ids on every call", () => {
    const a = resolvePresets(getPaintById);
    const b = resolvePresets(getPaintById);
    expect(a.map((s) => s.elements.map((e) => e.id))).toEqual(
      b.map((s) => s.elements.map((e) => e.id)),
    );
  });

  it("round-trips through the scheme export format unchanged", () => {
    for (const resolved of resolvePresets(getPaintById)) {
      const shape = toExportShape(resolved);
      const back = importSchemeObject(shape, (() => {
        let n = 0;
        return () => `x${n++}`;
      })());
      expect(toExportShape(back)).toEqual(shape);
    }
  });

  it("keeps every resolved paint's role meaningful", () => {
    for (const resolved of resolvePresets(getPaintById)) {
      for (const el of resolved.elements) {
        for (const p of el.paints) {
          // roleOf falls back to `layer` for an unknown role; catching that here
          // means a typo can't silently become a layer.
          expect(roleOf(p)).toBe(ROLES[p.role]);
        }
      }
    }
  });
});

describe("findPreset", () => {
  it("finds every preset by its slug", () => {
    for (const spec of SCHEME_PRESETS) {
      expect(findPreset(spec.slug)).toBe(spec);
    }
  });

  it("returns undefined for an unknown slug", () => {
    expect(findPreset("no-such-scheme")).toBeUndefined();
  });
});
