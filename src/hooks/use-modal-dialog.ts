"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Modal behaviour for an overlay: lock the background, move focus in, keep Tab
 * inside, close on Escape, and hand focus back to whatever opened it.
 *
 * Extracted from `PosterStudio`, which had the only working implementation.
 * The browse page's filter drawer is the same shape — `fixed inset-0` over the
 * page, with a scrim — but had none of it: Tab walked straight out of the
 * drawer into the grid behind the scrim, Escape did nothing, and closing left
 * focus on `<body>`.
 *
 * Returns the ref to put on the dialog element. Callers still own the
 * `role="dialog"` / `aria-modal` / label attributes, because only they know
 * what the thing is called.
 */
export function useModalDialog({
  onClose,
  initialFocus,
  onEscape,
}: {
  /** Called when the user dismisses the dialog with Escape. */
  onClose: () => void;
  /** Focused on open. Falls back to the first focusable element. */
  initialFocus?: RefObject<HTMLElement | null>;
  /**
   * Intercepts Escape. Return true to say "handled — don't close". Lets a
   * dialog unwind an inner mode first, so Escape isn't a one-way trip out of a
   * half-finished task.
   */
  onEscape?: () => boolean;
}): RefObject<HTMLDivElement | null> {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Latest callbacks without re-running the mount effect — which would re-focus
  // and re-lock every time the parent re-renders, since callers pass inline
  // arrows. Written in an effect rather than during render.
  const handlers = useRef({ onClose, onEscape });
  useEffect(() => {
    handlers.current = { onClose, onEscape };
  }, [onClose, onEscape]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? []),
        // `offsetParent` is null for anything `display: none` — a hidden file
        // input, say. `focus()` on one is a no-op, so if it were first or last
        // the Tab wrap would land nowhere.
      ].filter((el) => el.offsetParent !== null);

    if (initialFocus?.current) initialFocus.current.focus();
    else focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (handlers.current.onEscape?.()) return;
        handlers.current.onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
    // Mount/unmount only: the dialog is mounted when open, so this is its
    // lifetime. `initialFocus` is a ref, stable by construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return dialogRef;
}
