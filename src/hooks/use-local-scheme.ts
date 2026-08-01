"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { importSchemeObject } from "@/lib/scheme/io";
import { patchLocalDoc, readLocalDoc, SCHEME_STORE_KEY } from "@/lib/scheme/local-store";
import { uid } from "@/lib/scheme/uid";
import { emptyScheme, type Scheme } from "@/lib/scheme/types";

export { SCHEME_STORE_KEY };

export type LocalScheme = {
  /** The scheme being edited. */
  scheme: Scheme;
  setScheme: Dispatch<SetStateAction<Scheme>>;
  /**
   * Bar-blending view preference — persisted locally, but never part of a saved
   * scheme. Defaults off: the banded view shows each paint as a discrete step,
   * which reads as a recipe rather than a gradient.
   */
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
 *
 * Two hooks write the stored document and they own different fields: this one
 * owns `scheme`/`blend`, `useSchemeSync` owns `binding` (which saved row the
 * document belongs to). Hence `patchLocalDoc` rather than a whole-payload write
 * — see `@/lib/scheme/local-store`.
 */
export function useLocalScheme(): LocalScheme {
  const [scheme, setScheme] = useState<Scheme>(() => emptyScheme());
  const [blend, setBlend] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Restore after mount: localStorage is client-only, so reading it during SSR
  // would hydrate-mismatch — hence the mount gate and the state-in-effect.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setMounted(true);
    try {
      const stored = readLocalDoc();
      if (stored.scheme) {
        // Route restored data through the same sanitiser the file-import path
        // uses, so a corrupted shape can't reach `.map(...)` during render and
        // white-screen the page — it throws here and we fall back to the seed.
        const restored = importSchemeObject(stored.scheme, uid);
        if (typeof stored.scheme.title === "string") restored.title = stored.scheme.title;
        setScheme(restored);
      }
      if (typeof stored.blend === "boolean") setBlend(stored.blend);
    } catch {
      /* ignore corrupt storage */
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Autosave. Stays on when signed in, per the note above.
  useEffect(() => {
    if (!mounted) return;
    patchLocalDoc({ scheme, blend });
  }, [scheme, blend, mounted]);

  return { scheme, setScheme, blend, setBlend, mounted };
}
