"use client";

import type { Dispatch, SetStateAction } from "react";
import type { ElementHandlers } from "@/components/scheme/element-card";
import { moveItem } from "@/lib/scheme/bars";
import { uid } from "@/lib/scheme/uid";
import type { Scheme, SchemeElement, SchemePaint, SchemeRole } from "@/lib/scheme/types";

export type SchemeEditor = {
  setTitle: (title: string) => void;
  addElement: () => void;
  /** The per-element callbacks, as the one object `ElementCard` takes. */
  elementHandlers: ElementHandlers;
};

/**
 * The editor's immutable updates to the scheme document.
 *
 * Twelve `setScheme` closures that only ever transform the document — no
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
    },
  };
}
