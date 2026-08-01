"use client";

import { useEffect, useRef } from "react";

/**
 * The query string as it was when the page mounted.
 *
 * Three deep links can ask the visualiser to replace its document — `?scheme=`,
 * `?new=1` and `?preset=` — and each one strips its own param with
 * `history.replaceState` once handled. That makes the live URL useless for
 * deciding precedence: whichever hook runs first has already erased the evidence
 * the next one needs, so `?new=1&preset=x` loaded the preset and
 * `?new=1&scheme=y` created a stray blank row.
 *
 * Captured per mount rather than memoised at module scope: arriving from
 * `/my-schemes` is a client-side navigation, so a module-level snapshot would be
 * the *previous* page's query string.
 */
export function useInitialSearch(): () => string {
  const ref = useRef<string | null>(null);
  // Runs on the first commit, before any of the deep-link effects act (they all
  // wait for `mounted`/`ready`, which arrive in a later commit).
  useEffect(() => {
    if (ref.current === null) ref.current = window.location.search;
  }, []);
  return () =>
    ref.current ?? (typeof window === "undefined" ? "" : window.location.search);
}
