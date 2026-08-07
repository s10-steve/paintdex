"use client";

import type { Dispatch, SetStateAction } from "react";
import type { ElementHandlers } from "@/components/scheme/element-card";
import { moveItem } from "@/lib/scheme/bars";
import { uid } from "@/lib/scheme/uid";
import {
  MAX_MIX_COMPONENTS,
  MAX_NOTE,
  MAX_PARTS,
  type MixComponent,
  type Scheme,
  type SchemeElement,
  type SchemePaint,
  type SchemeRole,
} from "@/lib/scheme/types";

export type SchemeEditor = {
  setTitle: (title: string) => void;
  addElement: () => void;
  /** The per-element callbacks, as the one object `ElementCard` takes. */
  elementHandlers: ElementHandlers;
};

/**
 * The editor's immutable updates to the scheme document.
 *
 * Seventeen `setScheme` closures that only ever transform the document — no
 * accounts, no URL, no DOM. They lived inline in `scheme-visualiser`, whose own
 * header calls that file "the wiring"; this is the largest block that wasn't.
 *
 * Every updater is passed to `setScheme` as a function, so none of them closes
 * over a stale `scheme` and none needs memoising. `elementHandlers` is
 * deliberately a fresh object each render for the same reason it always was:
 * `ElementCard` isn't memoised either, so this costs exactly what the per-row
 * arrow props cost before.
 */
export function useSchemeEditor(
  setScheme: Dispatch<SetStateAction<Scheme>>,
): SchemeEditor {
  const mutateElement = (eid: string, fn: (e: SchemeElement) => SchemeElement) =>
    setScheme((s) => ({ ...s, elements: s.elements.map((e) => (e.id === eid ? fn(e) : e)) }));
  const mutatePaints = (eid: string, fn: (paints: SchemePaint[]) => SchemePaint[]) =>
    mutateElement(eid, (e) => ({ ...e, paints: fn(e.paints) }));

  const setTitle = (title: string) => setScheme((s) => ({ ...s, title }));
  const renameElement = (eid: string, name: string) => mutateElement(eid, (e) => ({ ...e, name }));
  const removeElement = (eid: string) =>
    setScheme((s) => ({ ...s, elements: s.elements.filter((e) => e.id !== eid) }));
  const moveElement = (eid: string, dir: -1 | 1) =>
    setScheme((s) => ({ ...s, elements: moveItem(s.elements, eid, dir) }));
  const addElement = () =>
    setScheme((s) => ({
      ...s,
      elements: [...s.elements, { id: uid(), name: "New element", paints: [] }],
    }));

  const addPaint = (eid: string, paint: Omit<SchemePaint, "id">) =>
    mutatePaints(eid, (paints) => [...paints, { ...paint, id: uid() }]);
  const removePaint = (eid: string, pid: string) =>
    mutatePaints(eid, (paints) => paints.filter((p) => p.id !== pid));
  const movePaint = (eid: string, pid: string, dir: -1 | 1) =>
    mutatePaints(eid, (paints) => moveItem(paints, pid, dir));
  const setRole = (eid: string, pid: string, role: SchemeRole) =>
    mutatePaints(eid, (paints) => paints.map((p) => (p.id === pid ? { ...p, role } : p)));

  /**
   * Drop keys from a paint. Used rather than assigning `undefined`, because the
   * key has to actually leave the object: `toExportShape` emits on presence, so
   * a lingering `note: undefined` would still be a key that
   * `Object.keys`-ordered serialisation has to account for.
   */
  const omit = (p: SchemePaint, ...keys: Array<keyof SchemePaint>): SchemePaint => {
    const next = { ...p };
    for (const k of keys) delete next[k];
    return next;
  };

  /** Apply `fn` to one paint, leaving the rest of the document alone. */
  const mutatePaint = (eid: string, pid: string, fn: (p: SchemePaint) => SchemePaint) =>
    mutatePaints(eid, (paints) => paints.map((p) => (p.id === pid ? fn(p) : p)));

  /**
   * Set one ingredient's share. Slot 0 is the primary paint, slot `i + 1` is
   * `mix[i]` — one indexed setter rather than two, so the row can render a
   * single uniform list over `components(paint)`.
   */
  const setParts = (eid: string, pid: string, slot: number, parts: number) =>
    mutatePaint(eid, pid, (p) => {
      if (!Number.isFinite(parts) || parts <= 0) return p;
      const capped = Math.min(parts, MAX_PARTS);
      if (slot === 0) return { ...p, parts: capped };
      const mix = (p.mix ?? []).map((c, i) => (i === slot - 1 ? { ...c, parts: capped } : c));
      return { ...p, mix };
    });

  /** Flag an ingredient as a medium/thinner: counted in the ratio, not the blend. */
  const setMedium = (eid: string, pid: string, slot: number, medium: boolean) =>
    mutatePaint(eid, pid, (p) => {
      if (slot === 0) {
        return medium ? { ...p, medium: true } : omit(p, "medium");
      }
      const mix = (p.mix ?? []).map((c, i) => {
        if (i !== slot - 1) return c;
        if (medium) return { ...c, medium: true as const };
        const rest = { ...c };
        delete rest.medium;
        return rest;
      });
      return { ...p, mix };
    });

  /**
   * Add a paint to this entry's mix. The primary's own share is defaulted here,
   * on the first component, so `parts` is never written to a plain paint.
   */
  const addMixComponent = (eid: string, pid: string, c: Omit<MixComponent, "parts">) =>
    mutatePaint(eid, pid, (p) => {
      const mix = p.mix ?? [];
      if (mix.length >= MAX_MIX_COMPONENTS) return p;
      return { ...p, parts: p.parts ?? 1, mix: [...mix, { ...c, parts: 1 }] };
    });

  /**
   * Remove one mix component. Emptying the mix drops `parts` and `medium` too,
   * so the entry serialises back to exactly the bytes a plain paint does —
   * otherwise its document never again equals the `syncedCanon` it was saved
   * with, and every load looks like unflushed edits.
   */
  const removeMixComponent = (eid: string, pid: string, index: number) =>
    mutatePaint(eid, pid, (p) => {
      const mix = (p.mix ?? []).filter((_, i) => i !== index);
      if (mix.length) return { ...p, mix };
      return omit(p, "mix", "parts", "medium");
    });

  /** Set or clear the layer's note. Clearing drops the key, as above. */
  const setNote = (eid: string, pid: string, note: string) =>
    mutatePaint(eid, pid, (p) => {
      const trimmed = note.slice(0, MAX_NOTE);
      if (!trimmed.trim()) return omit(p, "note");
      return { ...p, note: trimmed };
    });

  return {
    setTitle,
    addElement,
    elementHandlers: {
      rename: renameElement,
      move: moveElement,
      remove: removeElement,
      addPaint,
      movePaint,
      removePaint,
      setRole,
      setParts,
      setMedium,
      addMixComponent,
      removeMixComponent,
      setNote,
    },
  };
}
