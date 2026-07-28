/**
 * Layout maths for the "alternatives plot" — the paint detail page's spatial view
 * of a paint's closest matches, arranged with hue shift (or saturation) across
 * and lightness up.
 *
 * The point of the view is *direction*, not just distance. A ΔE-ranked list says
 * how close an alternative is; it can't say whether it's warmer, cooler, lighter
 * or more muted. So the reference paint anchors the plot — x is measured relative
 * to it and it sits at x = 0 — and you read left/right for hue or saturation,
 * up/down for lightness, and distance-from-centre for "how different".
 *
 * This module is **pure**: no DOM, no React, no SVG, so the packing rules can be
 * unit-tested in node (see `test/scatter.test.ts`). `similar-plot.tsx` consumes
 * the `ScatterLayout` produced here and draws it.
 *
 * Geometry is in **logical plot pixels supplied by the caller** (`ScatterSize`).
 * The caller measures the container; this module never touches `window` or a
 * `ResizeObserver`. Positions stay in real pixels rather than a normalised 0..1
 * space that a `viewBox` rescales, so a 24px mark is 24px on a phone — which is
 * what keeps tick text legible and hit targets tappable.
 *
 * Like `presets.ts`, this module **must not import `@/lib/paints/load`**:
 * candidates arrive as arguments. Import the loader here and the ~4,900-paint
 * catalogue lands in the client bundle.
 */
import { hueDelta, labToLch, NEUTRAL_CHROMA, type Lab } from "@/lib/color";

/**
 * What the horizontal axis means.
 *
 * `hue` is the interesting axis for a colourful paint, but it is meaningless when
 * the reference paint is near-grey — see `pickScatterAxis`. `chroma` answers a
 * different and equally real question: same colour, more or less punchy.
 */
export type ScatterAxis = "hue" | "chroma";

/**
 * Floors on how far a domain may shrink, in data units. Auto-fitting alone would
 * stretch a cluster spanning half a degree across the whole plot, dramatising
 * hex-rounding noise as real separation.
 *
 * Hue is a *half*-span because its domain is symmetric about zero; the other two
 * are total spans, because they fit each end independently.
 */
export const X_MIN_HALF_SPAN_HUE = 6;
export const X_MIN_SPAN_CHROMA = 8;
/** Smallest height the y domain may shrink to, in L* units. */
export const Y_MIN_SPAN = 8;

/**
 * Radius the renderer's ring around the reference paint extends beyond a mark.
 * Lives here because the domain-to-pixel inset has to reserve room for it.
 */
export const TARGET_RING = 7;

/**
 * Marks plotted at most. The cap is what buys the naive O(n²) relaxation below:
 * 120 points is 7,140 pairs × ≤60 passes ≈ 430k distance checks, well under a
 * millisecond, so there is no spatial index to maintain. Anything dropped is
 * reported in `omittedCount` and surfaced to the user — never silently cut.
 *
 * It only bites for washes and neutrals; a typical paint has 99–120 candidates
 * inside the default ΔE cutoff, but Agrax Earthshade has ~350.
 */
export const MAX_POINTS = 120;

/**
 * Fraction of the plot's area the marks may claim before the cap tightens.
 *
 * `MAX_POINTS` is a compute ceiling; this is the readability one, and on a phone
 * it's the binding constraint. 120 marks at the touch-sized 24px do not fit in a
 * ~300 × 300 box: relaxation packs them into a solid tile and the positions —
 * the entire point of the view — stop being legible. Showing the 60 closest
 * clearly, and saying so, beats showing 120 as a blob.
 *
 * Well above 1 because marks are allowed to crowd; below the ~1.4 where a hex
 * packing turns into continuous fill.
 */
export const AREA_BUDGET = 0.5;

/** Largest number of marks that stays legible in a plot of this size. */
export function capForArea(
  plot: { width: number; height: number },
  inset: number,
  markR: number,
): number {
  const w = Math.max(0, plot.width - 2 * inset);
  const h = Math.max(0, plot.height - 2 * inset);
  const cell = Math.pow(2 * markR + 1, 2);
  return Math.max(12, Math.floor(((w * h) / cell) * AREA_BUDGET));
}

/* Relaxation tuning. */
export const MAX_ITERATIONS = 60;
export const SEPARATION_STRENGTH = 0.5;
/** Largest per-point movement (px) below which a pass counts as settled. */
export const SETTLE_EPSILON = 0.25;
/**
 * Hard ceiling on how far a mark may sit from the truth, in mark radii.
 *
 * This is the honesty budget, and it deliberately outranks clickability: within a
 * radius of 3r only about seven marks can sit a full diameter apart, so a big
 * pile of identical colours *stays* partly overlapped rather than being flung
 * somewhere it doesn't belong. `ScatterLayout.overlapping` reports how many, and
 * the plot tells the user.
 *
 * There is no spring pulling marks back toward their true positions: the clamp
 * already bounds the lie, and a spring against a shared true position silently
 * balanced the separation force — piles settled overlapped while still reporting
 * `converged: true`.
 */
export const MAX_DISPLACEMENT_R = 3;

/** A candidate paint to plot. Lab is required — hex alone can't place a mark. */
export interface ScatterCandidate {
  id: string;
  name: string;
  brand: string;
  range: string;
  hex: string;
  lab: Lab;
  /** CIEDE2000 distance from the reference paint. */
  distance: number;
}

/** Plot box and gutters, all in logical px. The caller measures; this doesn't. */
export interface ScatterSize {
  width: number;
  height: number;
  /** Radius of one paint mark. Also sets the minimum centre separation. */
  markR: number;
  gutterLeft: number;
  gutterRight: number;
  gutterTop: number;
  gutterBottom: number;
}

export interface ScatterOptions {
  size: ScatterSize;
  /** Force an axis. Omitted = auto from the reference paint's C*. */
  axis?: ScatterAxis;
  limit?: number;
}

export interface ScatterPoint {
  id: string;
  name: string;
  brand: string;
  range: string;
  hex: string;
  distance: number;
  /** Data-space x: signed hue shift in degrees, or signed ΔC*, per `axis`. */
  ax: number;
  /** Absolute CIE L*, for the readout — lightness has a meaningful 0–100 scale. */
  l: number;
  /** Signed lightness difference from the reference paint. Drives y. */
  dl: number;
  /** Honest position in logical px, before overlap relaxation. */
  trueX: number;
  trueY: number;
  /** Rendered position in logical px, after relaxation. */
  x: number;
  y: number;
  /** Nudged more than a mark radius from the truth — renderer draws a tether. */
  displaced: boolean;
  /**
   * Hue mode only: this candidate is itself near-neutral, so its own hue angle —
   * and therefore its x — is approximate. Marked with a dotted ring; never
   * hidden, and never damped toward zero, which would be a different lie.
   */
  hueUncertain: boolean;
}

export interface ScatterAxisSpec {
  min: number;
  max: number;
  ticks: number[];
  /** The real spread was under the floor, so the domain was widened to it. */
  floored: boolean;
}

export interface ScatterLayout {
  axis: ScatterAxis;
  width: number;
  height: number;
  markR: number;
  /** Inner plot rect, inside the gutters. */
  plot: { x: number; y: number; width: number; height: number };
  /**
   * Pixels reserved inside `plot` on every side before the domain starts. The
   * renderer must place its ticks and gridlines with this same value — read it
   * back rather than recomputing, for the reason `PosterLayout.rowHeight` exists:
   * a renderer that insets by a different amount puts every gridline slightly
   * off its own marks, and nothing looks broken enough to notice.
   */
  inset: number;
  /** x is relative to the reference paint; y is relative lightness (ΔL*). */
  x: ScatterAxisSpec;
  y: ScatterAxisSpec;
  /** Where the reference paint sits: x is the centre, y is its ΔL = 0 line. */
  target: { x: number; y: number; l: number; chroma: number };
  /**
   * ΔE ascending, always. This is simultaneously the canonical order, the DOM
   * order, the keyboard traversal order and the screen-reader reading order, so
   * the plot narrates the same ranking the list view shows.
   *
   * Note what is deliberately *not* here: a reversed paint order. The closest
   * matches do need to sit on top, but the renderer gets that from `z-index`.
   * Reversing the DOM to paint it would read the ranking out backwards.
   */
  points: ScatterPoint[];
  /** Candidates beyond `limit`. Surfaced to the user; never dropped silently. */
  omittedCount: number;
  iterations: number;
  converged: boolean;
  maxDisplacement: number;
  /**
   * Marks still sitting less than a mark diameter from a better-ranked one, so
   * partly hidden beneath it. Unavoidable for stacks of identical colours (see
   * `MAX_DISPLACEMENT_R`); reported so the plot can say so rather than quietly
   * losing paints behind each other.
   */
  overlapping: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Which x-axis to open on for a given reference paint.
 *
 * Below `NEUTRAL_CHROMA` the reference's own hue angle is noise, so plotting hue
 * *shift* from it is worse than useless — it's confidently wrong. Measured over
 * the catalogue, Administratum Grey's near matches span −180…+161° of "hue
 * shift" and Abaddon Black's span −173…+179°: pure scatter, no signal. Chroma is
 * the honest axis there, and "more muted ↔ more saturated" is a question people
 * genuinely ask of a grey.
 */
export function pickScatterAxis(targetChroma: number): ScatterAxis {
  return targetChroma < NEUTRAL_CHROMA ? "chroma" : "hue";
}

/**
 * Tick values on the 1/2/5×10^k ladder, inside `[min, max]`, aiming for `count`.
 * Returns a single tick for a degenerate range — a step of 0 would loop forever.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const ticks: number[] = [];
  const first = Math.ceil(min / step) * step;
  for (let t = first; t <= max + step * 1e-9; t += step) {
    // Re-round: repeated addition of a fractional step drifts (0.30000000000004).
    ticks.push(Math.round(t / step) * step);
  }
  return ticks.length ? ticks : [min];
}

/** Auto-fit a domain that must contain 0, floored to a minimum width. */
function fitAroundZero(
  values: number[],
  floor: number,
  symmetric: boolean,
): ScatterAxisSpec {
  let lo = 0;
  let hi = 0;
  for (const v of values) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }

  if (symmetric) {
    // Hue is genuinely two-sided — a colour can shift either way round the wheel
    // with no bound — so both ends take the larger magnitude and the reference
    // paint lands dead centre.
    const half = Math.max(Math.abs(lo), Math.abs(hi));
    const floored = half < floor;
    const h = Math.max(half, floor);
    return { min: -h, max: h, ticks: niceTicks(-h, h), floored };
  }

  // Everything else fits each end independently, because it has a hard bound and
  // forcing symmetry wastes half the plot on the paints that need it most.
  // Lightness: every alternative to Abaddon Black is lighter and every
  // alternative to Vallejo White is darker. Chroma: C* can't go below 0, so
  // nothing is ever less saturated than a paint that has no saturation, and a
  // symmetric ΔC* domain reserved the whole left half for impossible values.
  const floored = hi - lo < floor;
  if (floored) {
    const pad = (floor - (hi - lo)) / 2;
    lo -= pad;
    hi += pad;
  }
  return { min: lo, max: hi, ticks: niceTicks(lo, hi), floored };
}

/**
 * Push overlapping marks apart so every swatch stays individually hoverable and
 * clickable, without letting any of them wander far from the truth.
 *
 * Deliberately deterministic — no `Math.random`, both because identical input
 * must give identical output (React would otherwise reshuffle the plot on every
 * unrelated re-render) and because the tests assert exact stability.
 *
 * Rank drives who yields: `pts` is ΔE-ascending, and mobility rises with index,
 * so the closest matches — the ones the user came for — hold their honest
 * positions while looser matches absorb the shuffling.
 */
function relax(
  pts: ScatterPoint[],
  markR: number,
  bounds: { x: number; y: number; width: number; height: number },
): {
  iterations: number;
  converged: boolean;
  maxDisplacement: number;
  overlapping: number;
} {
  const n = pts.length;
  const minSep = 2 * markR + 1;
  const maxDisp = MAX_DISPLACEMENT_R * markR;
  const minX = bounds.x + markR;
  const maxX = bounds.x + bounds.width - markR;
  const minY = bounds.y + markR;
  const maxY = bounds.y + bounds.height - markR;

  const mobility = pts.map((_, i) => 0.4 + 0.6 * (i / Math.max(1, n - 1)));
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);

  let iterations = 0;
  let converged = false;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    iterations = iter + 1;
    dx.fill(0);
    dy.fill(0);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = pts[i];
        const b = pts[j];
        let vx = b.x - a.x;
        let vy = b.y - a.y;
        let dist = Math.hypot(vx, vy);
        if (dist >= minSep) continue;

        if (dist === 0) {
          // Exactly coincident even after the pre-spread. Pick a direction from
          // the indices so the fan-out stays reproducible.
          const angle = j * 2.39996;
          vx = Math.cos(angle);
          vy = Math.sin(angle);
          dist = 1;
        }

        const push = ((minSep - dist) / 2) * SEPARATION_STRENGTH;
        const ux = (vx / dist) * push;
        const uy = (vy / dist) * push;
        dx[i] -= ux * mobility[i];
        dy[i] -= uy * mobility[i];
        dx[j] += ux * mobility[j];
        dy[j] += uy * mobility[j];
      }
    }

    let largestMove = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const beforeX = p.x;
      const beforeY = p.y;

      p.x += dx[i];
      p.y += dy[i];

      // Clamp the lie radially against the honest position, every pass — a mark
      // dragged far and only snapped back at the end would spend the whole
      // relaxation shoving neighbours from a spot it never actually occupies.
      const offX = p.x - p.trueX;
      const offY = p.y - p.trueY;
      const drift = Math.hypot(offX, offY);
      if (drift > maxDisp) {
        const k = maxDisp / drift;
        p.x = p.trueX + offX * k;
        p.y = p.trueY + offY * k;
      }
      p.x = clamp(p.x, minX, maxX);
      p.y = clamp(p.y, minY, maxY);

      largestMove = Math.max(largestMove, Math.hypot(p.x - beforeX, p.y - beforeY));
    }

    if (largestMove < SETTLE_EPSILON) {
      converged = true;
      break;
    }
  }

  let maxDisplacement = 0;
  for (const p of pts) {
    const d = Math.hypot(p.x - p.trueX, p.y - p.trueY);
    p.displaced = d > markR;
    maxDisplacement = Math.max(maxDisplacement, d);
  }

  // Count what the packer could not solve. `j` is the worse match of each pair,
  // and it's the one drawn underneath, so it's the one reported as hidden.
  const hidden = new Set<number>();
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y) < minSep - 0.5) {
        hidden.add(j);
      }
    }
  }

  return { iterations, converged, maxDisplacement, overlapping: hidden.size };
}

/**
 * Place `candidates` around `target` on the chosen axes.
 *
 * Note what is deliberately *not* enforced: a mark is free to cross x = 0 under
 * relaxation, so a very slightly warmer paint can end up drawn a hair to the
 * cool side. Clamping the sign would fight the packer exactly where it's needed
 * (dense clusters hug the reference paint), and the bounded displacement plus the
 * tether line on `displaced` marks is the honest way to say "this has been
 * nudged" rather than pretending it hasn't.
 */
export function layoutScatter(
  target: { lab: Lab },
  candidates: ScatterCandidate[],
  { size, axis: forcedAxis, limit = MAX_POINTS }: ScatterOptions,
): ScatterLayout {
  const { width, height, markR } = size;
  const plot = {
    x: size.gutterLeft,
    y: size.gutterTop,
    width: Math.max(1, width - size.gutterLeft - size.gutterRight),
    height: Math.max(1, height - size.gutterTop - size.gutterBottom),
  };

  const t = labToLch(target.lab);
  const axis = forcedAxis ?? pickScatterAxis(t.c);
  const inset = markR + TARGET_RING + 1;

  // The explicit id tiebreak is what makes the output independent of the input
  // array's order — see the shuffle test.
  const ranked = [...candidates].sort(
    (a, b) => a.distance - b.distance || a.id.localeCompare(b.id),
  );
  // Whichever bites first: the compute ceiling or what this plot can legibly hold.
  const cap = Math.min(Math.max(0, limit), capForArea(plot, inset, markR));
  const kept = ranked.slice(0, cap);
  const omittedCount = ranked.length - kept.length;

  const data = kept.map((c) => {
    const lch = labToLch(c.lab);
    return {
      ax: axis === "hue" ? hueDelta(t.h, lch.h) : lch.c - t.c,
      l: lch.l,
      dl: lch.l - t.l,
      hueUncertain: axis === "hue" && lch.c < NEUTRAL_CHROMA,
    };
  });

  const x = fitAroundZero(
    data.map((d) => d.ax),
    axis === "hue" ? X_MIN_HALF_SPAN_HUE : X_MIN_SPAN_CHROMA,
    // Only hue is symmetric — see fitAroundZero.
    axis === "hue",
  );
  const y = fitAroundZero(
    data.map((d) => d.dl),
    Y_MIN_SPAN,
    false,
  );

  // The inset (computed above) is in *pixels* rather than padding the domain, so
  // tick values stay round while nothing at a domain extreme is clipped by the
  // frame. The allowance is the reference paint's ring, not just a mark radius:
  // on a one-sided axis the reference sits hard against an edge (nothing is less
  // saturated than black), and a bare markR inset let its ring hang outside.
  const innerW = Math.max(1, plot.width - 2 * inset);
  const innerH = Math.max(1, plot.height - 2 * inset);
  const toX = (v: number) =>
    plot.x + inset + ((v - x.min) / (x.max - x.min || 1)) * innerW;
  // y is lightness and reads upward, but pixels run down the screen.
  const toY = (v: number) =>
    plot.y + inset + (1 - (v - y.min) / (y.max - y.min || 1)) * innerH;

  const points: ScatterPoint[] = kept.map((c, i) => {
    const d = data[i];
    const px = toX(d.ax);
    const py = toY(d.dl);
    return {
      id: c.id,
      name: c.name,
      brand: c.brand,
      range: c.range,
      hex: c.hex,
      distance: c.distance,
      ax: d.ax,
      l: d.l,
      dl: d.dl,
      trueX: px,
      trueY: py,
      x: px,
      y: py,
      displaced: false,
      hueUncertain: d.hueUncertain,
    };
  });

  // Deterministic pre-spread of exact ties. Without this the relaxation is stuck:
  // coincident marks have a zero-length separation vector and no gradient to
  // follow. It is not hypothetical — Vallejo White's 203 near matches share only
  // 113 distinct hex values, so ~90 marks start life stacked on each other.
  const groups = new Map<string, number[]>();
  const q = Math.max(1, markR / 2);
  points.forEach((p, i) => {
    const key = `${Math.round(p.trueX / q)}|${Math.round(p.trueY / q)}`;
    const g = groups.get(key);
    if (g) g.push(i);
    else groups.set(key, [i]);
  });
  for (const g of groups.values()) {
    for (let j = 1; j < g.length; j++) {
      const p = points[g[j]];
      // Golden angle: successive members spiral out instead of stacking on one
      // ray, and the sequence is fixed rather than random.
      const angle = j * 2.39996;
      const radius = markR * 0.75 * Math.sqrt(j);
      p.x = p.trueX + Math.cos(angle) * radius;
      p.y = p.trueY + Math.sin(angle) * radius;
    }
  }

  const report = relax(points, markR, plot);

  return {
    axis,
    width,
    height,
    markR,
    plot,
    inset,
    x,
    y,
    target: { x: toX(0), y: toY(0), l: t.l, chroma: t.c },
    points,
    omittedCount,
    ...report,
  };
}

/**
 * Worded ends for the saturation axis. Index 0 is the low (left) end.
 *
 * There is deliberately no equivalent for the hue axis: "cooler / warmer" is false
 * in general — from red, +hue heads to yellow; from blue, to purple — so the plot
 * shows swatches of the extreme candidates instead, which is honest and instantly
 * read. The renderer only shows these words when a candidate really sits at that
 * end, because the domain may have been padded to its floor.
 */
export const CHROMA_ENDS: [string, string] = ["more muted", "more saturated"];

/** Unit suffix for a tick value on the x axis. */
export const axisUnit = (axis: ScatterAxis) => (axis === "hue" ? "°" : "");

/**
 * Spoken description of where a mark sits. This goes in the mark's accessible
 * name, so position is carried by the label rather than being a visual-only
 * channel — a screen-reader user gets no geometry otherwise.
 */
export function describePoint(p: ScatterPoint, axis: ScatterAxis): string {
  const parts: string[] = [];
  const ax = Math.round(p.ax);

  if (axis === "hue") {
    if (p.hueUncertain) parts.push("near-neutral, hue approximate");
    else if (ax === 0) parts.push("same hue");
    else parts.push(`hue ${ax > 0 ? "+" : "−"}${Math.abs(ax)}°`);
  } else if (ax === 0) {
    parts.push("same saturation");
  } else {
    // Mirrors the hue branch's "hue +12°" rather than reading as prose, so the two
    // axes are described the same way. Chroma has no unit.
    parts.push(`saturation ${ax > 0 ? "+" : "−"}${Math.abs(ax)}`);
  }

  const dl = Math.round(p.dl);
  if (dl === 0) parts.push(`same lightness (${Math.round(p.l)})`);
  else parts.push(`${Math.abs(dl)} ${dl > 0 ? "lighter" : "darker"} (lightness ${Math.round(p.l)})`);

  return parts.join(", ");
}
