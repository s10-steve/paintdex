"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Observe an element's content-box width in CSS pixels.
 *
 * The alternatives plot lays out in **real** pixels rather than drawing into a
 * scaled `viewBox`, so it needs the measured width: a `viewBox` that squeezes a
 * 640px plot into a 320px phone shrinks the tick text below legibility and turns
 * a 24px tap target into 12px. Measuring instead lets the layout choose a bigger
 * mark radius and fewer ticks on a narrow screen.
 *
 * Returns 0 until the first observation, which is the caller's cue that it has
 * nothing to lay out yet — never guess a width, or the first paint jumps.
 */
export function useElementWidth<T extends HTMLElement>(): [
  React.RefObject<T | null>,
  number,
] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // contentBoxSize is the modern field; contentRect is the fallback that
        // older Safari still needs.
        const next = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
        // Round to whole pixels: sub-pixel jitter from a flex parent would
        // otherwise re-run the whole layout on every scroll-driven reflow.
        setWidth((prev) => {
          const rounded = Math.round(next);
          return rounded === prev ? prev : rounded;
        });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
