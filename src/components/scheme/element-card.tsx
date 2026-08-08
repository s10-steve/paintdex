"use client";

import type { BrowsePaint } from "@/lib/paints/types";
import {
  roleOf,
  type MixComponent,
  type SchemeElement,
  type SchemePaint,
  type SchemeRole,
} from "@/lib/scheme/types";
import type { HoverHandlers } from "../scheme-bars";
import { AddPaint } from "./add-paint";
import { IconBtn } from "./icon-btn";
import { displayHex } from "@/lib/scheme/mix";
import { LayerRow } from "./layer-row";

/**
 * The editor's mutations, grouped into one object so `ElementCard` takes a
 * handful of props rather than eight separate callbacks. Every handler is keyed
 * by element id (and paint id where relevant), which is also how the
 * visualiser's own state updaters are shaped — so it can pass them straight
 * through without per-row closures.
 */
export type ElementHandlers = {
  rename: (elementId: string, name: string) => void;
  move: (elementId: string, dir: -1 | 1) => void;
  remove: (elementId: string) => void;
  addPaint: (elementId: string, paint: Omit<SchemePaint, "id">) => void;
  movePaint: (elementId: string, paintId: string, dir: -1 | 1) => void;
  removePaint: (elementId: string, paintId: string) => void;
  setRole: (elementId: string, paintId: string, role: SchemeRole) => void;
  /** Slot 0 is the primary paint; slot `i + 1` is its `mix[i]`. */
  setParts: (elementId: string, paintId: string, slot: number, parts: number) => void;
  setMedium: (elementId: string, paintId: string, slot: number, medium: boolean) => void;
  addMixComponent: (
    elementId: string,
    paintId: string,
    component: Omit<MixComponent, "parts">,
  ) => void;
  removeMixComponent: (elementId: string, paintId: string, index: number) => void;
  setNote: (elementId: string, paintId: string, note: string) => void;
};

/** First paint in an element is a base; subsequent additions default to layer. */
function defaultRole(element: SchemeElement): SchemeRole {
  return element.paints.some((p) => roleOf(p).solid) ? "layer" : "base";
}

/** One element (armour, robes, lenses…): its name, its paint stack, its actions. */
export function ElementCard({
  element,
  index,
  count,
  dbPaints,
  loadError,
  hovered,
  hover,
  handlers,
}: {
  element: SchemeElement;
  index: number;
  count: number;
  dbPaints: BrowsePaint[] | null;
  loadError: boolean;
  hovered: string | null;
  hover: HoverHandlers;
  handlers: ElementHandlers;
}) {
  const id = element.id;
  const swatches = element.paints.length ? element.paints.map(displayHex) : ["var(--muted)"];
  return (
    <div className="relative rounded-xl border border-border bg-card shadow-sm focus-within:z-10">
      <div className="flex items-center gap-2.5 rounded-t-xl border-b border-border bg-muted px-3 py-3">
        <span className="flex h-[22px] w-10 flex-none overflow-hidden rounded-md ring-1 ring-inset ring-black/10">
          {swatches.map((hex, i) => (
            <i key={i} className="flex-1" style={{ background: hex }} />
          ))}
        </span>
        <input
          value={element.name}
          onChange={(e) => handlers.rename(id, e.target.value)}
          aria-label="Element name"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1 text-[15px] font-semibold tracking-tight outline-none hover:bg-card focus:bg-card focus:ring-1 focus:ring-inset focus:ring-input"
        />
        <div className="flex flex-none items-center gap-0.5">
          <IconBtn
            label="Move element earlier (larger area)"
            disabled={index === 0}
            onClick={() => handlers.move(id, -1)}
          >
            ↑
          </IconBtn>
          <IconBtn
            label="Move element later (smaller area)"
            disabled={index === count - 1}
            onClick={() => handlers.move(id, 1)}
          >
            ↓
          </IconBtn>
          <IconBtn label="Remove element" danger onClick={() => handlers.remove(id)}>
            ✕
          </IconBtn>
        </div>
      </div>

      {/* No per-card "▲ base / highlight ▼" or paint count: the ordering is
          stated once beside the "Elements & paints" heading, and the count is
          already on every bar's caption. Repeating either on each card is noise
          that scales with the number of elements. */}
      <ul className="flex flex-col gap-0.5 p-2">
        {element.paints.map((paint, i) => (
          <LayerRow
            key={paint.id}
            paint={paint}
            index={i}
            count={element.paints.length}
            hot={hovered === paint.id}
            hover={hover}
            dbPaints={dbPaints}
            loadError={loadError}
            onMove={(dir) => handlers.movePaint(id, paint.id, dir)}
            onRemove={() => handlers.removePaint(id, paint.id)}
            onSetRole={(role) => handlers.setRole(id, paint.id, role)}
            onSetParts={(slot, parts) => handlers.setParts(id, paint.id, slot, parts)}
            onSetMedium={(slot, medium) => handlers.setMedium(id, paint.id, slot, medium)}
            onAddMix={(c) => handlers.addMixComponent(id, paint.id, c)}
            onRemoveMix={(i) => handlers.removeMixComponent(id, paint.id, i)}
            onSetNote={(note) => handlers.setNote(id, paint.id, note)}
          />
        ))}
      </ul>

      <AddPaint
        dbPaints={dbPaints}
        loadError={loadError}
        defaultRole={defaultRole(element)}
        onAdd={(p) => handlers.addPaint(id, p)}
      />
    </div>
  );
}
