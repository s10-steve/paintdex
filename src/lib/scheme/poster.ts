/**
 * Layout maths for the shareable "poster" image — a 4:5 portrait card showing a
 * photo of the painted model with a callout per scheme element, each callout
 * holding that element's banded ramp strip and its paint names, joined to a
 * point on the model by a leader line.
 *
 * This module is **pure**: no canvas, no DOM, no React, so the packing rules can
 * be unit-tested in node (see `test/poster.test.ts`). The actual pixels are
 * painted by `./poster-draw`, which consumes the `PosterLayout` produced here.
 *
 * Geometry is expressed in *logical* poster pixels (1080 × 1350). The renderer
 * multiplies everything by a `scale` factor — 2 for export, devicePixelRatio for
 * the on-screen preview — so one set of numbers drives both.
 */
import type { SchemeElement, SchemePaint } from "./types";
import { barModel, type Overlay, type Seg } from "./bars";

/** Logical poster size. 4:5 — the best-performing Instagram feed aspect. */
export const POSTER_SIZE = { width: 1080, height: 1350 } as const;

/** Safe margin kept clear of content on all four sides. */
export const MARGIN = 56;

/** Reserved bands at the top (handle + rule) and bottom (credit line). */
export const HEADER_H = 128;
export const FOOTER_H = 88;

/** Width of a callout column. Two of these plus margins leave the model ~330px. */
export const COLUMN_W = 320;

/* Vertical metrics of a single callout, top to bottom. */
export const NAME_H = 28;
export const NAME_GAP = 12;
export const STRIP_H = 26;
export const STRIP_GAP = 14;
export const ROW_H = 30;

/**
 * Thickness of an overlay band on the ramp strip, in px — the poster's
 * equivalent of `BANDED_OVERLAY_PX` in `scheme-bars.tsx`, but wider. A wash
 * applied last pins to the far end of the ramp, and at the app's 14px it
 * disappeared into the strip's rounded corner at poster scale.
 */
export const OVERLAY_W = 22;

/** Gap between stacked callouts, relaxed to `GAP_TIGHT` before anything is cut. */
export const GAP = 28;
export const GAP_TIGHT = 16;

/**
 * Paint-list lengths tried, in order, when callouts won't fit. `Infinity` means
 * "show every paint"; the finite tiers truncate and add a `+N more` row.
 */
export const PAINT_TIERS = [Infinity, 4, 3, 2] as const;

export type PosterSide = "left" | "right";

/**
 * Where an element's leader line lands, as a fraction of the **source photo**
 * (0..1), not of the poster.
 *
 * An anchor names a part of the model, so it has to travel with the model: once
 * the ring is on the eye lens it must stay on the eye lens when the user zooms
 * or pans to re-frame the shot. Storing poster coordinates instead leaves the
 * rings stranded mid-air the moment the framing changes.
 *
 * `side` overrides the automatic left/right column split.
 */
export interface PosterAnchor {
  x: number;
  y: number;
  side?: PosterSide;
}

/** How the photo is fitted to the poster. Mirrors `PosterPhoto` minus the bitmap. */
export interface PhotoFraming {
  naturalWidth: number;
  naturalHeight: number;
  /** 1 = smallest scale that covers the poster; >1 zooms in. */
  zoom: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Destination rect for the photo: scaled to *cover* the poster, centred, then
 * nudged by the user's pan. Shared by the renderer and by anchor projection so
 * the rings can never drift from the pixels they were placed on.
 */
export function photoRect(f: PhotoFraming, w: number, h: number) {
  const cover = Math.max(w / f.naturalWidth, h / f.naturalHeight);
  const s = cover * (f.zoom || 1);
  const dw = f.naturalWidth * s;
  const dh = f.naturalHeight * s;
  return { dx: (w - dw) / 2 + f.offsetX, dy: (h - dh) / 2 + f.offsetY, dw, dh };
}

/** Photo-space anchor (0..1) → absolute poster pixels. */
export function projectAnchor(
  a: { x: number; y: number },
  f: PhotoFraming,
  w: number,
  h: number,
): { x: number; y: number } {
  const r = photoRect(f, w, h);
  return { x: r.dx + a.x * r.dw, y: r.dy + a.y * r.dh };
}

/** Absolute poster pixels → photo-space anchor (0..1). Inverse of `projectAnchor`. */
export function unprojectAnchor(
  pt: { x: number; y: number },
  f: PhotoFraming,
  w: number,
  h: number,
): { x: number; y: number } {
  const r = photoRect(f, w, h);
  return { x: (pt.x - r.dx) / r.dw, y: (pt.y - r.dy) / r.dh };
}

/**
 * Re-attach persisted anchors to the current elements.
 *
 * Anchors are stored by index next to the element name they were placed
 * against, because element ids are session-only (see `PosterAnchors`). Reordering
 * elements in the editor must carry the anchors along; renaming or deleting one
 * must drop its anchor rather than silently move a "Shoulder Pads" label onto
 * the eye lenses.
 */
export function reconcileAnchors(
  stored: PosterAnchors,
  storedNames: string[],
  elements: SchemeElement[],
): PosterAnchors {
  const out: PosterAnchors = {};
  const claimed = new Set<number>();

  for (const key of Object.keys(stored)) {
    const i = Number(key);
    const name = storedNames[i];
    if (name === undefined) continue;

    let target = -1;
    if (elements[i]?.name === name && !claimed.has(i)) {
      target = i;
    } else {
      target = elements.findIndex((e, j) => e.name === name && !claimed.has(j));
    }
    if (target < 0) continue;

    claimed.add(target);
    out[target] = stored[i];
  }
  return out;
}

/**
 * Anchors keyed by element **index**, not id — `SchemeElement.id` comes from
 * `./uid` and is regenerated every session, so it cannot survive a reload. The
 * persistence layer stores the element names alongside and drops the whole set
 * if they stop matching, rather than risk labelling the wrong part.
 */
export type PosterAnchors = Record<number, PosterAnchor>;

export interface PosterOptions {
  /** Optional credit, rendered as `@handle`. Blank hides it. */
  handle: string;
  /** Append a small role label ("BASE", "WASH") after each paint name. */
  showRoles: boolean;
  theme: PosterThemeName;
}

export const defaultPosterOptions = (): PosterOptions => ({
  handle: "",
  showRoles: false,
  theme: "dark",
  });

export type PosterThemeName = "dark" | "light";

export interface PosterTheme {
  /** Backdrop behind the photo, and the colour the scrims fade toward. */
  bg: string;
  /** Base ink for scrims: black on dark, white on light. */
  scrim: string;
  name: string;
  paintText: string;
  roleText: string;
  handleText: string;
  creditText: string;
  rule: string;
  /** Inset ring around the ramp strip. */
  stripRing: string;
  /** Hairlines either side of an overlay band, so a dark wash still reads. */
  overlayEdge: string;
  /** Ring around a paint-list dot, so a near-black paint isn't invisible. */
  dotRing: string;
  leader: string;
  leaderShadow: string;
  /** Drop shadow behind all callout text and lines, for legibility over photos. */
  textShadow: string;
}

export const POSTER_THEMES: Record<PosterThemeName, PosterTheme> = {
  dark: {
    bg: "#0c0a09",
    scrim: "0,0,0",
    name: "#ffffff",
    paintText: "rgba(255,255,255,.88)",
    roleText: "rgba(255,255,255,.45)",
    handleText: "rgba(255,255,255,.72)",
    creditText: "rgba(255,255,255,.42)",
    rule: "rgba(255,255,255,.35)",
    stripRing: "rgba(255,255,255,.16)",
    overlayEdge: "rgba(255,255,255,.32)",
    dotRing: "rgba(255,255,255,.38)",
    leader: "rgba(255,255,255,.8)",
    leaderShadow: "rgba(0,0,0,.4)",
    textShadow: "rgba(0,0,0,.6)",
  },
  light: {
    bg: "#fafaf9",
    scrim: "250,250,249",
    name: "#0c0a09",
    paintText: "rgba(12,10,9,.88)",
    roleText: "rgba(12,10,9,.5)",
    handleText: "rgba(12,10,9,.7)",
    creditText: "rgba(12,10,9,.45)",
    rule: "rgba(12,10,9,.3)",
    stripRing: "rgba(12,10,9,.18)",
    overlayEdge: "rgba(12,10,9,.3)",
    dotRing: "rgba(12,10,9,.3)",
    leader: "rgba(12,10,9,.75)",
    leaderShadow: "rgba(255,255,255,.5)",
    textShadow: "rgba(255,255,255,.65)",
  },
};

/** A callout resolved to absolute logical pixels, ready to draw. */
export interface CalloutLayout {
  elementIndex: number;
  name: string;
  side: PosterSide;
  /** Left edge of the column. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Leader target, in absolute logical px. */
  anchor: { x: number; y: number };
  /** Point on the callout the leader leaves from (centre of the ramp strip). */
  origin: { x: number; y: number };
  /** Paints listed, already truncated to the tier that fit. */
  paints: SchemePaint[];
  /** How many paints the list omitted (`+N more`); 0 when everything fits. */
  hiddenCount: number;
  /** Full ramp — always built from *all* the element's paints, never truncated. */
  segs: Seg[];
  overlays: Overlay[];
}

export type PosterOmissionReason = "unplaced" | "no-paints" | "no-space" | "off-frame";

export interface PosterOmission {
  elementIndex: number;
  name: string;
  reason: PosterOmissionReason;
}

export interface PosterLayout {
  width: number;
  height: number;
  callouts: CalloutLayout[];
  /**
   * Every element that is *not* on the poster and why. Nothing is ever dropped
   * silently — the studio surfaces this so the user knows what is missing.
   */
  omitted: PosterOmission[];
  /** Gap actually used, after any tightening. */
  gap: number;
}

/** Height of a callout showing `rows` paint rows. Deterministic — no text metrics. */
export function calloutHeight(rows: number): number {
  return NAME_H + NAME_GAP + STRIP_H + STRIP_GAP + Math.max(1, rows) * ROW_H;
}

interface Candidate {
  elementIndex: number;
  element: SchemeElement;
  side: PosterSide;
  anchor: { x: number; y: number };
}

interface Packed {
  y: number;
  height: number;
  rows: number;
  hiddenCount: number;
  candidate: Candidate;
}

/**
 * Stack one side's callouts inside `[bandTop, bandBottom]`, each as close to its
 * anchor as it can get: a downward sweep that pushes overlapping callouts apart,
 * then an upward sweep that pulls the tail back inside the band. Returns null if
 * the column still overflows, which is the caller's signal to degrade.
 */
function packSide(
  items: Packed[],
  bandTop: number,
  bandBottom: number,
  gap: number,
): Packed[] | null {
  const sorted = items.slice().sort((a, b) => a.candidate.anchor.y - b.candidate.anchor.y);

  let cursor = bandTop;
  for (const it of sorted) {
    const ideal = it.candidate.anchor.y - it.height / 2;
    it.y = Math.max(ideal, cursor);
    cursor = it.y + it.height + gap;
  }

  let limit = bandBottom;
  for (let i = sorted.length - 1; i >= 0; i--) {
    sorted[i].y = Math.min(sorted[i].y, limit - sorted[i].height);
    limit = sorted[i].y - gap;
  }

  // The upward sweep can only have pushed things up, so a single check of the
  // topmost callout tells us whether the whole column fit.
  if (sorted.length && sorted[0].y < bandTop) return null;
  return sorted;
}

/**
 * Resolve elements + anchors into a drawable layout.
 *
 * Degradation, in order, and only as far as needed: relax the gap to
 * `GAP_TIGHT`; then truncate paint lists through `PAINT_TIERS`; then drop
 * callouts, last-in-scheme-order first, recording each in `omitted`.
 */
export function layoutPoster({
  elements,
  anchors,
  photo,
  width = POSTER_SIZE.width,
  height = POSTER_SIZE.height,
}: {
  elements: SchemeElement[];
  anchors: PosterAnchors;
  /** Framing used to project photo-space anchors. Omit to treat them as poster-space. */
  photo?: PhotoFraming | null;
  width?: number;
  height?: number;
}): PosterLayout {
  const omitted: PosterOmission[] = [];
  const candidates: Candidate[] = [];

  elements.forEach((element, elementIndex) => {
    // Paints first: an element with nothing in it can never be labelled, so
    // "add some paints" is the useful thing to say — "not placed yet" would send
    // the user off to click a marker that would be rejected anyway.
    if (element.paints.length === 0) {
      omitted.push({ elementIndex, name: element.name, reason: "no-paints" });
      return;
    }
    const a = anchors[elementIndex];
    if (!a) {
      omitted.push({ elementIndex, name: element.name, reason: "unplaced" });
      return;
    }
    const anchor = photo
      ? projectAnchor(a, photo, width, height)
      : { x: a.x * width, y: a.y * height };
    // Zooming in can push a part of the model off the poster; a leader line to
    // a point outside the frame would just run into the edge.
    if (anchor.x < 0 || anchor.x > width || anchor.y < 0 || anchor.y > height) {
      omitted.push({ elementIndex, name: element.name, reason: "off-frame" });
      return;
    }
    candidates.push({
      elementIndex,
      element,
      side: a.side ?? (anchor.x < width / 2 ? "left" : "right"),
      anchor,
    });
  });

  const bandTop = HEADER_H;
  const bandBottom = height - FOOTER_H;

  // Search the degradation tiers for the first configuration that packs. Each
  // iteration allows one more element to be dropped than the last.
  let best: { gap: number; left: Packed[]; right: Packed[]; dropped: Candidate[] } | null = null;

  outer: for (let dropCount = 0; dropCount <= candidates.length; dropCount++) {
    // Drop from the end of scheme order: elements are ordered by how much of the
    // model they cover, so the last ones matter least.
    const keptIdx = candidates
      .map((_, i) => i)
      .sort((a, b) => candidates[a].elementIndex - candidates[b].elementIndex)
      .slice(0, candidates.length - dropCount);
    const keptSet = new Set(keptIdx);
    const kept = candidates.filter((_, i) => keptSet.has(i));
    const dropped = candidates.filter((_, i) => !keptSet.has(i));

    for (const gap of [GAP, GAP_TIGHT]) {
      for (const tier of PAINT_TIERS) {
        const make = (side: PosterSide) =>
          kept
            .filter((c) => c.side === side)
            .map<Packed>((c) => {
              const total = c.element.paints.length;
              const shown = Math.min(total, tier);
              const hiddenCount = total - shown;
              // The "+N more" line occupies a row of its own.
              const rows = shown + (hiddenCount > 0 ? 1 : 0);
              return { y: 0, height: calloutHeight(rows), rows: shown, hiddenCount, candidate: c };
            });

        const left = packSide(make("left"), bandTop, bandBottom, gap);
        const right = packSide(make("right"), bandTop, bandBottom, gap);
        if (left && right) {
          best = { gap, left, right, dropped };
          break outer;
        }
      }
    }
  }

  if (!best) return { width, height, callouts: [], omitted, gap: GAP };

  for (const c of best.dropped) {
    omitted.push({ elementIndex: c.elementIndex, name: c.element.name, reason: "no-space" });
  }
  omitted.sort((a, b) => a.elementIndex - b.elementIndex);

  const callouts: CalloutLayout[] = [...best.left, ...best.right].map((p) => {
    const { candidate } = p;
    const x = candidate.side === "left" ? MARGIN : width - MARGIN - COLUMN_W;
    const { segs, overlays } = barModel(candidate.element.paints);
    return {
      elementIndex: candidate.elementIndex,
      name: candidate.element.name,
      side: candidate.side,
      x,
      y: p.y,
      width: COLUMN_W,
      height: p.height,
      anchor: candidate.anchor,
      // Leave from whichever edge faces the anchor, not simply the inner one:
      // an anchor that sits behind its own column (a gun barrel at the very edge
      // of the frame, say) would otherwise make the elbow double back across the
      // callout it belongs to.
      origin: {
        x: candidate.anchor.x < x + COLUMN_W / 2 ? x : x + COLUMN_W,
        y: p.y + NAME_H + NAME_GAP + STRIP_H / 2,
      },
      paints: candidate.element.paints.slice(0, p.rows),
      hiddenCount: p.hiddenCount,
      segs,
      overlays,
    };
  });

  callouts.sort((a, b) => a.elementIndex - b.elementIndex);

  return { width, height, callouts, omitted, gap: best.gap };
}
