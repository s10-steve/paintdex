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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  POSTER_SIZE,
  projectAnchor,
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

/** Arrow-key directions, in logical poster px per step. */
const NUDGE: Record<string, { x: number; y: number } | undefined> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};
const NUDGE_FINE = 4;
/** With Shift held — enough to cross the poster in a sensible number of presses. */
const NUDGE_COARSE = 24;

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
  /**
   * Lets the studio focus the canvas when an element is armed, so the keyboard
   * placement path starts on the surface it happens on.
   */
  canvasRef?: RefObject<HTMLCanvasElement | null>;
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
  canvasRef,
}: PosterCanvasProps) {
  const ownRef = useRef<HTMLCanvasElement>(null);
  const ref = canvasRef ?? ownRef;
  const drag = useRef<Drag>(null);

  /**
   * Every placed anchor's position on the poster — not just the ones that got a
   * callout.
   *
   * `layout.callouts` omits an element whose label wouldn't fit (`no-space`) or
   * whose anchor sits outside the current framing (`off-frame`). Hit-testing
   * that list alone meant such an anchor had no handle and no grab target, so
   * zooming until a label was pushed off-frame stranded it: the only way back
   * was to clear it and start again.
   */
  const handles = useMemo(() => {
    if (!framing) return [];
    return Object.entries(anchors).map(([index, a]) => ({
      index: Number(index),
      point: projectAnchor(a, framing, POSTER_SIZE.width, POSTER_SIZE.height),
      // Laid out = has a callout; the rest are drawn dimmer, as "still here,
      // just not shown".
      placed: layout.callouts.some((c) => c.elementIndex === Number(index)),
    }));
  }, [anchors, framing, layout]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let cancelled = false;
    let frame = 0;
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
      drawHandles(ctx, dpr, armed, highlight, handles);
    };

    // Coalesced into a frame. Dragging an anchor and panning the photo both
    // fire `pointermove` faster than the display refreshes, and each one
    // changes `layout`, so without this a fast drag queues several full
    // redraws — photo, scrims and every callout — between two painted frames.
    frame = requestAnimationFrame(paint);
    // Geist arrives asynchronously; without the second pass the first render
    // measures and draws in the fallback face.
    void document.fonts.ready.then(paint);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
    // `ref` is either this component's own ref or the studio's, and neither
    // identity changes for the life of the mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, options, photo, armed, highlight, handles]);

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
      for (const h of handles) {
        const d = Math.hypot(h.point.x - pt.x, h.point.y - pt.y);
        if (d <= bestD) {
          bestD = d;
          best = h.index;
        }
      }
      return best;
    },
    [handles],
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

  /**
   * The keyboard route to placing and moving an anchor.
   *
   * Placement used to be pointer-only: arming an element was reachable from the
   * keyboard, but "now click the model" had no equivalent, and neither did
   * nudging one already placed — a WCAG 2.1.1 failure on the feature's central
   * interaction. Enter places the armed element's anchor in the middle of the
   * frame; the arrows walk it from there.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!framing) return;

    if (armed !== null && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      place(armed, { x: POSTER_SIZE.width / 2, y: POSTER_SIZE.height / 2 });
      onHighlight(armed);
      onPlaced();
      return;
    }

    const step = NUDGE[e.key];
    if (!step) return;
    // The armed element if there is one, else whatever is highlighted — which
    // is what Enter above leaves behind, so place-then-nudge flows in one go.
    const target = armed ?? highlight;
    if (target === null) return;
    const current = anchors[target];
    if (!current) return;

    e.preventDefault();
    const scale = e.shiftKey ? NUDGE_COARSE : NUDGE_FINE;
    const at = projectAnchor(current, framing, POSTER_SIZE.width, POSTER_SIZE.height);
    place(target, { x: at.x + step.x * scale, y: at.y + step.y * scale });
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
      // Focusable, and deliberately not `role="img"` — this is an editing
      // surface, not a picture. The label carries the keyboard contract, since
      // there's nothing on the canvas a screen reader can read.
      tabIndex={0}
      aria-label={
        armed !== null
          ? "Poster preview. Press Enter to place the marker in the middle of the photo, then use the arrow keys to move it."
          : "Poster preview. Arrow keys move the selected marker; hold Shift to move further."
      }
      onKeyDown={onKeyDown}
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
 *
 * Drawn for every placed anchor, including those whose callout the layout
 * dropped — a dashed ring rather than a filled one, so it reads as "placed, but
 * not on the poster right now" and can still be dragged back into frame.
 */
function drawHandles(
  ctx: CanvasRenderingContext2D,
  scale: number,
  armed: number | null,
  highlight: number | null,
  handles: { index: number; point: { x: number; y: number }; placed: boolean }[],
) {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  for (const h of handles) {
    const on = highlight === h.index || armed === h.index;
    ctx.beginPath();
    ctx.arc(h.point.x, h.point.y, on ? 18 : 13, 0, Math.PI * 2);
    if (h.placed) {
      ctx.fillStyle = on ? "rgba(56,189,248,.34)" : "rgba(255,255,255,.14)";
      ctx.fill();
    } else {
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = on ? "rgba(56,189,248,.8)" : "rgba(255,255,255,.5)";
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
}
