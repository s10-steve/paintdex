/**
 * Pure maths that turns an element's ordered paints into a vertical bar.
 *
 * The bar reads **dark base at the bottom → highlight at the top**. Solid roles
 * (base/layer/highlight) share out the bar's height by weight, forming a tonal
 * ramp; overlay roles (wash/glaze/weathering) don't take a ramp slice — they
 * render as translucent bands positioned where they fall in the sequence.
 *
 * No React, no DOM — safe to unit-test in node and to call during render.
 */
import { roleOf, weightOf, type SchemePaint } from "./types";

/** A solid paint's slot in the ramp, as fractions of the bar height (0..1). */
export interface Seg {
  paint: SchemePaint;
  /** Original index in the element's paint list. */
  idx: number;
  start: number;
  end: number;
  center: number;
  /** Share of the bar height (end - start). */
  frac: number;
}

/** An overlay paint (wash/glaze/weathering) awaiting placement. */
export interface Overlay {
  paint: SchemePaint;
  idx: number;
}

export interface BarModel {
  segs: Seg[];
  overlays: Overlay[];
}

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

/**
 * Split paints into the weighted solid ramp and the overlay list.
 *
 * Fallback: an element made only of overlays (no solids) still needs something
 * to sit on, so every paint is treated as an equal solid and no overlays are
 * drawn — otherwise the bar would be blank.
 */
export function barModel(paints: SchemePaint[]): BarModel {
  const solids: Overlay[] = [];
  const overlays: Overlay[] = [];
  paints.forEach((paint, idx) => {
    (roleOf(paint).solid ? solids : overlays).push({ paint, idx });
  });

  const ramp = solids.length ? solids : paints.map((paint, idx) => ({ paint, idx }));
  const weights = ramp.map((s) => Math.max(0.15, weightOf(s.paint)));
  const total = weights.reduce((a, b) => a + b, 0) || 1;

  let acc = 0;
  const segs: Seg[] = ramp.map((s, i) => {
    const start = acc / total;
    acc += weights[i];
    const end = acc / total;
    return { paint: s.paint, idx: s.idx, start, end, center: (start + end) / 2, frac: weights[i] / total };
  });

  return { segs, overlays: solids.length ? overlays : [] };
}

/**
 * Build the ramp's CSS `linear-gradient` (bottom = base, top = highlight).
 * Blended → one stop at each segment's centre (colours bleed into each other).
 * Banded → paired stops at each segment's boundaries (hard steps).
 */
export function rampGradient(segs: Seg[], blend: boolean): string {
  if (!segs.length) return "";
  if (segs.length === 1) return segs[0].paint.hex;
  const stops: string[] = [];
  if (blend) {
    for (const s of segs) stops.push(`${s.paint.hex} ${(s.center * 100).toFixed(2)}%`);
  } else {
    for (const s of segs) {
      stops.push(`${s.paint.hex} ${(s.start * 100).toFixed(2)}%`);
      stops.push(`${s.paint.hex} ${(s.end * 100).toFixed(2)}%`);
    }
  }
  return `linear-gradient(to top, ${stops.join(", ")})`;
}

/**
 * Where an overlay band centres (0 = bottom, 1 = top): at the ramp boundary
 * after the solids applied before it. Overlays applied before any solid pin to
 * the bottom; after all solids, to the top.
 */
export function overlayCenter(ov: Overlay, segs: Seg[]): number {
  if (!segs.length) return 0.5;
  const before = segs.filter((s) => s.idx < ov.idx).length;
  if (before <= 0) return segs[0].start;
  if (before >= segs.length) return segs[segs.length - 1].end;
  return segs[before - 1].end;
}
