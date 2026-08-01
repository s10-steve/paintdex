"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { useInitialSearch } from "@/hooks/use-initial-search";
import { emptyScheme, type Scheme } from "@/lib/scheme/types";

/** Query parameter asking the visualiser to start a blank scheme. */
export const NEW_PARAM = "new";

/**
 * Starts a blank scheme from `/visualiser?new=1` — the "+ New scheme" button on
 * `/my-schemes`.
 *
 * That button used to be a bare link to `/visualiser`, which lands on whatever
 * the editor was last holding: nothing in the load path ever asks for a blank
 * document, so sign-in reconciliation loads the most recently updated scheme and
 * "New scheme" reopens your last one.
 *
 * The gates mirror `useSchemePreset`, for the same reasons — `mounted` so the
 * `localStorage` restore has landed, `ready` so this can't race sign-in
 * reconciliation or the debounced autosave. Signed in, `newScheme()` creates the
 * blank row and binds the editor to it, so nothing already saved is touched and
 * there's nothing to warn about. Signed out, `localStorage` is the only copy of
 * whatever is in the editor, so ask first.
 *
 * Three params can now ask to replace the document, so precedence is explicit:
 * `?scheme=` (a specific saved row) beats `?new=1` beats `?preset=`. Each bails
 * when a higher-precedence one is present.
 */
export function useSchemeNew({
  setScheme,
  mounted,
  ready,
  signedIn,
  newScheme,
  hasContent,
}: {
  setScheme: Dispatch<SetStateAction<Scheme>>;
  mounted: boolean;
  /** Sign-in reconciliation has settled (see `useSchemeSync`). */
  ready: boolean;
  signedIn: boolean;
  newScheme: () => Promise<void>;
  /** The editor's current scheme, for the signed-out "are you sure". */
  hasContent: () => boolean;
}): void {
  const handledRef = useRef(false);
  // The URL as it arrived: `useSchemeSync` strips `?scheme=` before this runs.
  const initialSearch = useInitialSearch();
  const newSchemeRef = useRef(newScheme);
  const hasContentRef = useRef(hasContent);
  useEffect(() => {
    newSchemeRef.current = newScheme;
    hasContentRef.current = hasContent;
  }, [newScheme, hasContent]);

  useEffect(() => {
    if (handledRef.current || !mounted || !ready) return;

    const params = new URLSearchParams(initialSearch());
    if (params.get(NEW_PARAM) === null) {
      handledRef.current = true;
      return;
    }
    handledRef.current = true;

    // `?scheme=` names a specific row and wins; `useSchemeSync` handles it.
    const deferring = params.get("scheme") !== null;
    if (!deferring) {
      if (signedIn) {
        void newSchemeRef.current();
      } else {
        const ok =
          !hasContentRef.current() ||
          window.confirm(
            "Start a new scheme? The one you're working on will be cleared.\n\nSign in first and your schemes are kept on your account instead.",
          );
        if (ok) setScheme(emptyScheme());
      }
    }

    // Strip the param either way, so a reload doesn't blank the editor again.
    const url = new URL(window.location.href);
    url.searchParams.delete(NEW_PARAM);
    window.history.replaceState(null, "", url.pathname + url.search);
    // `setScheme` is stable; the refs above cover the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, ready, signedIn]);
}

/** Whether a query string asks for a blank scheme (the precedence check). */
export const hasNewParam = (search: string): boolean =>
  new URLSearchParams(search).get(NEW_PARAM) !== null;
