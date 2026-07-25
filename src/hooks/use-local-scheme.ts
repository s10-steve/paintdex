"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { importSchemeObject } from "@/lib/scheme/io";
import { uid } from "@/lib/scheme/uid";
import { emptyScheme, type Scheme } from "@/lib/scheme/types";

/** localStorage key holding the visualiser's working scheme. */
export const SCHEME_STORE_KEY = "paintdex-scheme-v1";

export type LocalScheme = {
  /** The scheme being edited. */
  scheme: Scheme;
  setScheme: Dispatch<SetStateAction<Scheme>>;
  /** Bar-blending view preference — persisted locally, but never part of a saved scheme. */
  blend: boolean;
  setBlend: Dispatch<SetStateAction<boolean>>;
  /** False during SSR and the first render; gates everything client-only. */
  mounted: boolean;
};

/**
 * The visualiser's working scheme, backed by `localStorage`.
 *
 * This layer is *always* on, even for signed-in users: it's the anonymous
 * fallback and the source the account sync migrates from on first login. The
 * account layer lives in `useSchemeSync`, which shares this `scheme`/`setScheme`
 * pair rather than keeping a second copy.
 */
export function useLocalScheme(): LocalScheme {
  const [scheme, setScheme] = useState<Scheme>(() => emptyScheme());
  const [blend, setBlend] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Restore after mount: localStorage is client-only, so reading it during SSR
  // would hydrate-mismatch — hence the mount gate and the state-in-effect.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setMounted(true);
    try {
      const raw = localStorage.getItem(SCHEME_STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { scheme?: Scheme; blend?: boolean };
        if (parsed?.scheme) {
          // Route restored data through the same sanitiser the file-import path
          // uses, so a corrupted shape can't reach `.map(...)` during render and
          // white-screen the page — it throws here and we fall back to the seed.
          const restored = importSchemeObject(parsed.scheme, uid);
          if (typeof parsed.scheme.title === "string") restored.title = parsed.scheme.title;
          setScheme(restored);
        }
        if (typeof parsed?.blend === "boolean") setBlend(parsed.blend);
      }
    } catch {
      /* ignore corrupt storage */
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Autosave. Stays on when signed in, per the note above.
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(SCHEME_STORE_KEY, JSON.stringify({ scheme, blend }));
    } catch {
      /* quota / private mode — non-fatal */
    }
  }, [scheme, blend, mounted]);

  return { scheme, setScheme, blend, setBlend, mounted };
}
