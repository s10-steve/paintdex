"use client";

/**
 * The scheme visualisation — vertical colour bars, one per element — shared by
 * the interactive editor (`scheme-visualiser`) and the read-only public viewer
 * (`scheme-view`).
 *
 * `Bar` is presentational; hover wiring is optional so the editor can pass its
 * own shared handlers (it links bar hover ↔ editor rows two ways) while the
 * viewer uses the self-contained `SchemeBars` wrapper, which manages hover and
 * the tooltip via `useBarHover`. All the maths lives in the pure
 * `@/lib/scheme/bars` module.
 */
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { roleOf, weightOf, type SchemeElement, type SchemePaint } from "@/lib/scheme/types";
import { barModel, rampGradient, overlayCenter, clamp, elementSize } from "@/lib/scheme/bars";

export type HoverHandlers = {
  /** Bar segment: show the tooltip and highlight the matching row. */
  enter: (paint: SchemePaint, e: ReactPointerEvent) => void;
  move: (e: ReactPointerEvent) => void;
  leave: () => void;
  /** Editor row: highlight the matching bar band (no tooltip). */
  mark: (pid: string) => void;
  unmark: () => void;
};

/** Accessible label for a bar band, e.g. "Base: Deck Tan (#ABA390)". */
export function paintLabel(p: SchemePaint): string {
  return `${roleOf(p).label}: ${p.name} (${p.hex.toUpperCase()})`;
}

/**
 * Height of an overlay band in the banded (unblended) view, in px. Every overlay
 * role gets the same band — the role is told apart by colour and opacity, not
 * thickness — and this is the default view, so it needs to read clearly.
 */
const BANDED_OVERLAY_PX = 14;

export const EMPTY_BAR_STYLE: CSSProperties = {
  background:
    "repeating-linear-gradient(-45deg, var(--muted), var(--muted) 7px, var(--border) 7px, var(--border) 14px)",
};

/**
 * Hover + tooltip state for a row of bars. Position and visibility are set
 * imperatively (via a ref) so mousemove never re-renders the tree; only the
 * hovered id and the tooltip's paint come from React state. Returns the
 * `hovered` id, the `hover` handlers to wire onto bars/rows, and the `tooltip`
 * element to render once at the root of the consumer.
 */
export function useBarHover() {
  const [hovered, setHovered] = useState<string | null>(null);
  const [tipPaint, setTipPaint] = useState<SchemePaint | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const hover: HoverHandlers = useMemo(
    () => ({
      enter(paint, e) {
        setHovered(paint.id);
        setTipPaint(paint);
        const tip = tipRef.current;
        if (!tip) return;
        tip.style.left = `${e.clientX}px`;
        tip.style.top = `${e.clientY - 14}px`;
        tip.style.opacity = "1";
      },
      move(e) {
        const tip = tipRef.current;
        if (!tip) return;
        tip.style.left = `${e.clientX}px`;
        tip.style.top = `${e.clientY - 14}px`;
      },
      leave() {
        setHovered(null);
        setTipPaint(null);
        if (tipRef.current) tipRef.current.style.opacity = "0";
      },
      mark(pid) {
        setHovered(pid);
      },
      unmark() {
        setHovered(null);
      },
    }),
    [],
  );

  // Content from React (no innerHTML); position/opacity set imperatively in
  // hover.* so mousemove never re-renders. No inline left/top here, or a
  // re-render would clobber the imperative position.
  const tooltip = (
    <div
      ref={tipRef}
      className="pointer-events-none fixed left-0 top-0 z-50 -translate-x-1/2 -translate-y-2 whitespace-nowrap rounded-md bg-foreground px-2 py-1.5 text-xs text-background opacity-0 shadow-xl transition-opacity"
    >
      {tipPaint && (
        <>
          <span
            className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-baseline ring-1 ring-white/30"
            style={{ background: tipPaint.hex }}
          />
          <span
            className="mr-1.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ color: roleOf(tipPaint).cssVar }}
          >
            {roleOf(tipPaint).label}
          </span>
          {tipPaint.name}
          <span className="ml-1.5 font-mono opacity-70">{tipPaint.hex.toUpperCase()}</span>
        </>
      )}
    </div>
  );

  return { hovered, hover, tooltip };
}

/** A single element's colour bar. Hover props are optional (read-only when omitted). */
export function Bar({
  element,
  index,
  blend,
  hovered,
  hover,
}: {
  element: SchemeElement;
  index: number;
  blend: boolean;
  hovered?: string | null;
  hover?: HoverHandlers;
}) {
  const { segs, overlays } = useMemo(() => barModel(element.paints), [element.paints]);
  const empty = element.paints.length === 0;

  // Bars share the row's fixed width in proportion to their position — earlier
  // (larger-area) elements read wider, later ones narrower — so the ordering
  // does the sizing. A min-width keeps the thinnest bars usable.
  return (
    <div
      className="flex min-w-[46px] flex-col items-center gap-2.5"
      style={{ flexGrow: elementSize(index), flexBasis: 0 }}
    >
      <div
        className="relative flex h-[340px] w-full flex-col-reverse overflow-hidden rounded-[9px] shadow-sm ring-1 ring-inset ring-black/10 [isolation:isolate]"
        style={empty ? EMPTY_BAR_STYLE : { background: rampGradient(segs, blend) }}
      >
        {segs.map((s) => (
          <div
            key={s.paint.id}
            role="img"
            aria-label={paintLabel(s.paint)}
            className="relative min-h-0"
            style={{
              flexGrow: s.frac,
              flexBasis: 0,
              boxShadow: hovered === s.paint.id ? "inset 0 0 0 2px rgba(255,255,255,.7)" : undefined,
            }}
            onPointerEnter={hover ? (e) => hover.enter(s.paint, e) : undefined}
            onPointerMove={hover?.move}
            onPointerLeave={hover?.leave}
          />
        ))}
        {overlays.map((ov) => {
          const center = overlayCenter(ov, segs);
          // Blended → a soft, feathered translucent band. Banded → the overlay
          // collapses to a thin crisp line at its boundary, matching the ramp's
          // hard steps when blending is off.
          let placement: CSSProperties;
          if (blend) {
            const thick = clamp(weightOf(ov.paint) * 0.15, 0.08, 0.4);
            const bottom = clamp(center - thick / 2, 0, 1 - thick);
            placement = {
              bottom: `${(bottom * 100).toFixed(2)}%`,
              height: `${(thick * 100).toFixed(2)}%`,
              background: `linear-gradient(to top, transparent, ${ov.paint.hex} 50%, transparent)`,
            };
          } else {
            // A crisp band matching the ramp's hard steps. `max`/`min` keep it
            // inside the bar, so an overlay landing at the very top or bottom
            // isn't half-clipped by the rounded edge.
            const half = BANDED_OVERLAY_PX / 2;
            placement = {
              bottom: `max(0px, min(calc(100% - ${BANDED_OVERLAY_PX}px), calc(${(center * 100).toFixed(2)}% - ${half}px)))`,
              height: `${BANDED_OVERLAY_PX}px`,
              background: ov.paint.hex,
            };
          }
          return (
            <div
              key={ov.paint.id}
              role="img"
              aria-label={paintLabel(ov.paint)}
              className={`absolute inset-x-0 ${
                roleOf(ov.paint).blendMode === "normal" ? "" : "mix-blend-multiply"
              }`}
              style={{
                ...placement,
                opacity: roleOf(ov.paint).opacity,
                boxShadow: hovered === ov.paint.id ? "inset 0 0 0 2px rgba(255,255,255,.7)" : undefined,
              }}
              onPointerEnter={hover ? (e) => hover.enter(ov.paint, e) : undefined}
              onPointerMove={hover?.move}
              onPointerLeave={hover?.leave}
            />
          );
        })}
      </div>
      <div className="w-full break-words text-center text-xs font-medium leading-tight [text-wrap:balance]">
        {element.name}
        <span className="mt-0.5 block text-[10.5px] font-normal text-muted-foreground">
          {element.paints.length} {element.paints.length === 1 ? "paint" : "paints"}
        </span>
      </div>
    </div>
  );
}

/**
 * Self-contained row of bars with its own hover/tooltip, for read-only use
 * (the public share viewer). The editor renders `Bar` directly with its own
 * shared hover state instead, so bar hover and editor rows stay linked.
 */
export function SchemeBars({
  elements,
  blend,
}: {
  elements: SchemeElement[];
  blend: boolean;
}) {
  const { hovered, hover, tooltip } = useBarHover();
  return (
    <>
      <div className="overflow-x-auto px-4 pb-2 pt-5">
        <div className="flex min-h-[360px] items-start gap-3">
          <div className="flex h-[340px] flex-none flex-col items-end justify-between pr-1">
            <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] uppercase tracking-widest text-muted-foreground">
              highlight → base
            </span>
          </div>
          {elements.map((element, i) => (
            <Bar
              key={element.id}
              element={element}
              index={i}
              blend={blend}
              hovered={hovered}
              hover={hover}
            />
          ))}
        </div>
      </div>
      {tooltip}
    </>
  );
}
