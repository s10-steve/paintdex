"use client";

/**
 * The interactive poster preview.
 *
 * Draws the real poster via the shared `drawPoster`, then paints editor-only
 * affordances (grab handles, the armed-placement crosshair target) *on top*.
 * The export re-runs `drawPoster` alone into an offscreen canvas, so what you
 * download is exactly what this shows minus the handles — the affordances can
 * never leak into the PNG, and the two can never drift apart.
 */
import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import {
  POSTER_SIZE,
  unprojectAnchor,
  type PhotoFraming,
  type PosterAnchor,
  type PosterAnchors,
  type PosterLayout,
  type PosterOptions,
} from "@/lib/scheme/poster";
import { drawPoster, resolveFontFamily, type PosterPhoto } from "@/lib/scheme/poster-draw";

/** Grab radius for an anchor handle, in logical poster px. */
const HIT_RADIUS = 26;

export interface PosterCanvasProps {
  layout: PosterLayout;
  options: PosterOptions;
  photo: PosterPhoto | null;
  framing: PhotoFraming | null;
  anchors: PosterAnchors;
  /** Element index waiting for a click to place its anchor, if any. */
  armed: number | null;
  highlight: number | null;
  onPlace: (index: number, anchor: PosterAnchor) => void;
  onPan: (dx: number, dy: number) => void;
  onHighlight: (index: number | null) => void;
  /** Called once an armed placement has been consumed. */
  onPlaced: () => void;
}

type Drag =
  | { kind: "anchor"; index: number }
  | { kind: "pan"; lastX: number; lastY: number }
  | null;

export function PosterCanvas({
  layout,
  options,
  photo,
  framing,
  anchors,
  armed,
  highlight,
  onPlace,
  onPan,
  onHighlight,
  onPlaced,
}: PosterCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let cancelled = false;
    const paint = () => {
      if (cancelled) return;
      // Cap the device ratio: a 3x preview of a 1080x1350 poster is 12 MP of
      // canvas redrawn on every pointer move for no visible gain.
      const dpr = Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, 2);
      canvas.width = POSTER_SIZE.width * dpr;
      canvas.height = POSTER_SIZE.height * dpr;

      drawPoster(ctx, {
        layout,
        options,
        photo,
        fontFamily: resolveFontFamily(),
        scale: dpr,
        highlight,
      });
      drawHandles(ctx, layout, dpr, armed, highlight);
    };

    paint();
    // Geist arrives asynchronously; without the second pass the first render
    // measures and draws in the fallback face.
    void document.fonts.ready.then(paint);
    return () => {
      cancelled = true;
    };
  }, [layout, options, photo, armed, highlight]);

  /** Client coordinates → logical poster pixels. */
  const toLogical = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * POSTER_SIZE.width,
      y: ((e.clientY - rect.top) / rect.height) * POSTER_SIZE.height,
    };
  }, []);

  const anchorAt = useCallback(
    (pt: { x: number; y: number }) => {
      let best = -1;
      let bestD = HIT_RADIUS;
      for (const c of layout.callouts) {
        const d = Math.hypot(c.anchor.x - pt.x, c.anchor.y - pt.y);
        if (d <= bestD) {
          bestD = d;
          best = c.elementIndex;
        }
      }
      return best;
    },
    [layout],
  );

  const place = useCallback(
    (index: number, pt: { x: number; y: number }) => {
      if (!framing) return;
      const a = unprojectAnchor(pt, framing, POSTER_SIZE.width, POSTER_SIZE.height);
      // Clamp to the photo: dragging a marker past the edge would otherwise put
      // it out of frame, where `layoutPoster` drops the callout entirely and the
      // label just disappears mid-drag.
      onPlace(index, {
        x: Math.max(0, Math.min(1, a.x)),
        y: Math.max(0, Math.min(1, a.y)),
        // Keep the existing side override, if the user set one.
        side: anchors[index]?.side,
      });
    },
    [framing, anchors, onPlace],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const pt = toLogical(e);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (armed !== null) {
      place(armed, pt);
      onPlaced();
      drag.current = { kind: "anchor", index: armed };
      return;
    }
    const hit = anchorAt(pt);
    if (hit >= 0) {
      drag.current = { kind: "anchor", index: hit };
      onHighlight(hit);
      return;
    }
    drag.current = { kind: "pan", lastX: pt.x, lastY: pt.y };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const pt = toLogical(e);
    const d = drag.current;
    if (!d) {
      // Hover feedback only — cheap enough, and it makes the handles findable.
      const hit = anchorAt(pt);
      onHighlight(hit >= 0 ? hit : null);
      return;
    }
    if (d.kind === "anchor") {
      place(d.index, pt);
      return;
    }
    onPan(pt.x - d.lastX, pt.y - d.lastY);
    d.lastX = pt.x;
    d.lastY = pt.y;
  };

  const endDrag = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="Poster preview"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => onHighlight(null)}
      className={`block w-full touch-none rounded-lg ring-1 ring-border ${
        armed !== null ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
      }`}
      style={{ aspectRatio: `${POSTER_SIZE.width} / ${POSTER_SIZE.height}` }}
    />
  );
}

/**
 * Editor-only chrome, drawn after the poster and never exported: a soft halo
 * around each anchor so it can be found and grabbed, brighter on the one being
 * hovered or dragged.
 */
function drawHandles(
  ctx: CanvasRenderingContext2D,
  layout: PosterLayout,
  scale: number,
  armed: number | null,
  highlight: number | null,
) {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  for (const c of layout.callouts) {
    const on = highlight === c.elementIndex || armed === c.elementIndex;
    ctx.beginPath();
    ctx.arc(c.anchor.x, c.anchor.y, on ? 18 : 13, 0, Math.PI * 2);
    ctx.fillStyle = on ? "rgba(56,189,248,.34)" : "rgba(255,255,255,.14)";
    ctx.fill();
  }
  ctx.restore();
}
