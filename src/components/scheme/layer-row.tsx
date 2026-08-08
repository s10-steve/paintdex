"use client";

import { useRef, useState } from "react";
import type { BrowsePaint } from "@/lib/paints/types";
import { components, displayHex, hasMix, mixName, ratioLabel } from "@/lib/scheme/mix";
import {
  MAX_MIX_COMPONENTS,
  MAX_NOTE,
  ROLES,
  ROLE_KEYS,
  paintMeta,
  roleOf,
  type MixComponent,
  type SchemePaint,
  type SchemeRole,
} from "@/lib/scheme/types";
import type { HoverHandlers } from "../scheme-bars";
import { AddPaint } from "./add-paint";
import { IconBtn } from "./icon-btn";
import { RoleTag } from "./role-tag";

/**
 * One paint within an element: swatch, name/meta, role, row actions — and, when
 * the entry is a mix, the ingredient list with its parts ratio.
 *
 * The swatch shows `displayHex`, the blended colour, rather than being sliced
 * into per-component slivers: 26px across three paints is unreadable, and it
 * would contradict the single colour the bar shows for the same entry.
 */
export function LayerRow({
  paint,
  index,
  count,
  hot,
  hover,
  dbPaints,
  loadError,
  onMove,
  onRemove,
  onSetRole,
  onSetParts,
  onSetMedium,
  onAddMix,
  onRemoveMix,
  onSetNote,
}: {
  paint: SchemePaint;
  index: number;
  count: number;
  hot: boolean;
  hover: HoverHandlers;
  dbPaints: BrowsePaint[] | null;
  loadError: boolean;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onSetRole: (role: SchemeRole) => void;
  /** Slot 0 is the primary paint; slot `i + 1` is its `mix[i]`. */
  onSetParts: (slot: number, parts: number) => void;
  onSetMedium: (slot: number, medium: boolean) => void;
  onAddMix: (component: Omit<MixComponent, "parts">) => void;
  onRemoveMix: (index: number) => void;
  onSetNote: (note: string) => void;
}) {
  const [mixOpen, setMixOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const noteBtnRef = useRef<HTMLButtonElement>(null);

  const role = roleOf(paint);
  const meta = paintMeta(paint);
  const mixed = hasMix(paint);
  const ratio = ratioLabel(paint);
  const hex = displayHex(paint);
  const showCustom = paint.custom && paint.brand && paint.brand !== "custom";
  const mixFull = (paint.mix?.length ?? 0) >= MAX_MIX_COMPONENTS;
  const showNote = noteOpen || Boolean(paint.note);

  return (
    <li
      className={`group grid grid-cols-[auto_1fr_auto] items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${hot ? "bg-muted" : "hover:bg-muted"}`}
      onPointerEnter={() => hover.mark(paint.id)}
      onPointerLeave={hover.unmark}
    >
      <span
        className="mt-0.5 h-[26px] w-[26px] flex-none rounded-md ring-1 ring-inset ring-black/15"
        style={{ background: hex }}
      />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-medium">
          <span className="min-w-0 truncate">{mixName(paint)}</span>
          {ratio && (
            <span className="flex-none rounded bg-muted-foreground/15 px-1 font-mono text-[10px] tabular-nums text-muted-foreground">
              {ratio}
            </span>
          )}
          <RoleTag role={role} />
        </div>
        <div className="truncate text-[11.5px] text-muted-foreground">
          {meta}{" "}
          <span className="font-mono tabular-nums text-muted-foreground/80">
            {hex.toUpperCase()}
          </span>
          {mixed && <span className="text-muted-foreground/70"> · blend</span>}
          {showCustom && <span className="text-muted-foreground/70"> · custom</span>}
        </div>

        {mixed && (
          <ul className="mt-1 space-y-1 border-l border-border pl-2">
            {components(paint).map((c, slot) => (
              <li key={slot} className="flex items-center gap-1.5 text-[11.5px]">
                <span
                  className={`h-3.5 w-3.5 flex-none rounded-sm ring-1 ring-inset ring-black/15 ${c.medium ? "opacity-40" : ""}`}
                  style={{ background: c.hex }}
                />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  inputMode="decimal"
                  value={c.parts}
                  onChange={(e) => {
                    const next = parseFloat(e.target.value);
                    // An emptied number input reads as "", so `parseFloat` gives
                    // NaN — writing that would divide the blend by zero.
                    if (Number.isFinite(next)) onSetParts(slot, next);
                  }}
                  aria-label={`Parts of ${c.name}`}
                  className="w-12 flex-none rounded-md border border-input bg-background px-1 py-0.5 text-[11px] tabular-nums"
                />
                <label className="flex flex-none items-center gap-1 text-[10.5px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={Boolean(c.medium)}
                    onChange={(e) => onSetMedium(slot, e.target.checked)}
                    aria-label={`${c.name} is a medium or thinner — thins without tinting`}
                  />
                  thins
                </label>
                {slot > 0 ? (
                  <IconBtn
                    label={`Remove ${c.name} from the mix`}
                    danger
                    onClick={() => onRemoveMix(slot - 1)}
                  >
                    ✕
                  </IconBtn>
                ) : (
                  // Keeps the parts inputs in one column; the primary is removed
                  // with the row's own "Remove paint".
                  <span className="h-6 w-6 flex-none" />
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <select
            value={paint.role}
            onChange={(e) => onSetRole(e.target.value as SchemeRole)}
            aria-label="Layer role"
            className="rounded-md border border-input bg-muted px-1 py-0.5 text-[11px] text-muted-foreground"
          >
            {ROLE_KEYS.map((k) => (
              <option key={k} value={k}>
                {ROLES[k].label}
              </option>
            ))}
          </select>
          {mixFull ? (
            <span className="text-[11px] text-muted-foreground/70">Mix full</span>
          ) : (
            <button
              onClick={() => setMixOpen((v) => !v)}
              aria-expanded={mixOpen}
              aria-label={`Add a paint to the ${paint.name} mix`}
              className="text-[11.5px] font-semibold text-accent-foreground hover:underline"
            >
              + Mix
            </button>
          )}
          <button
            ref={noteBtnRef}
            onClick={() => setNoteOpen((v) => !v)}
            aria-expanded={showNote}
            aria-label={`${paint.note ? "Edit" : "Add"} a note for ${paint.name}`}
            className="text-[11.5px] font-semibold text-accent-foreground hover:underline"
          >
            {paint.note ? "Note" : "+ Note"}
          </button>
        </div>

        {mixOpen && !mixFull && (
          <AddPaint
            dbPaints={dbPaints}
            loadError={loadError}
            defaultRole={paint.role}
            compact
            autoFocus
            placeholder="Add a paint to the mix…"
            onAdd={(p) => {
              // A mix component has no role of its own — it's part of one entry.
              onAddMix({
                name: p.name,
                brand: p.brand,
                range: p.range,
                hex: p.hex,
                ...(p.custom ? { custom: true as const } : {}),
              });
              setMixOpen(false);
            }}
          />
        )}

        {showNote &&
          (noteOpen ? (
            <textarea
              rows={2}
              value={paint.note ?? ""}
              onChange={(e) => onSetNote(e.target.value)}
              // Collapse on click-away. Skipped when focus is moving to the
              // Note button itself: blur runs before its click, so closing here
              // would let the toggle reopen what the user meant to shut.
              onBlur={(e) => {
                if (e.relatedTarget !== noteBtnRef.current) setNoteOpen(false);
              }}
              // Mirrors the importer's cap, so the browser stops the user at the
              // same number rather than letting the text vanish on reload.
              maxLength={MAX_NOTE}
              aria-label={`Note for ${paint.name}`}
              placeholder="e.g. airbrush over the upper 75%"
              className="mt-1 w-full resize-none rounded-md border border-input bg-background px-2 py-1 text-[12px] outline-none focus:border-primary focus:ring-2 focus:ring-accent"
            />
          ) : (
            <p className="mt-0.5 text-[11.5px] italic text-muted-foreground">{paint.note}</p>
          ))}
      </div>
      <div className="flex flex-none gap-0.5 opacity-40 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <IconBtn label="Move up (towards base)" disabled={index === 0} onClick={() => onMove(-1)}>
          ↑
        </IconBtn>
        <IconBtn
          label="Move down (towards highlight)"
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        >
          ↓
        </IconBtn>
        <IconBtn label="Remove paint" danger onClick={onRemove}>
          ✕
        </IconBtn>
      </div>
    </li>
  );
}
