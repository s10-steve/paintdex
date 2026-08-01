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
  // Runs on the first commit, which is before any deep-link effect *acts* — they
  // all wait on `mounted`/`ready`, and those arrive in a later commit. Note the
  // guarantee is that timing, NOT hook order: `useSchemeSync` is called before
  // `useSchemeNew` in `scheme-visualiser.tsx`, so its effects run first. A future
  // hook that consumed the URL on its very first commit would need to capture
  // the query string itself rather than rely on this.
  useEffect(() => {
    if (ref.current === null) ref.current = window.location.search;
  }, []);
  return () =>
    ref.current ?? (typeof window === "undefined" ? "" : window.location.search);
}
