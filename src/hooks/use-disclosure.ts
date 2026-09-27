"use client";

/**
 * The header's two drop-downs — the phone nav and the account menu — as
 * *disclosures*: a button that shows and hides a panel of ordinary links and
 * buttons, which Tab walks like anything else on the page.
 *
 * They used to claim `role="menu"`, which promises the menu keyboard model —
 * arrow keys between items, focus moved into the menu on open, Escape back to
 * the button — and implemented none of it, so a screen reader announced a menu
 * that then didn't behave like one. They also held a heading and a divider,
 * which aren't valid menu children. A disclosure is what they actually are, and
 * it needs only three behaviours, all here:
 *
 * - outside click closes;
 * - Escape closes **and returns focus to the button**, so a keyboard user isn't
 *   dropped at the top of the document;
 * - focus leaving the whole widget (Tab past the last link) closes, so an open
 *   panel isn't left floating over the page behind the user.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";

export function useDisclosure() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onFocusIn = (e: FocusEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open]);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

  return {
    open,
    close,
    rootRef,
    /** Spread onto the toggle button. */
    buttonProps: {
      ref: buttonRef,
      type: "button" as const,
      "aria-expanded": open,
      "aria-controls": panelId,
      onClick: toggle,
    },
    /** Spread onto the panel. */
    panelProps: { id: panelId },
  };
}
