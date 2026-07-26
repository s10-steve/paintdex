"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { findPreset, resolvePreset, type PresetPaintData } from "@/lib/scheme/presets";
import { schemeHasContent } from "@/lib/scheme/sync";
import type { Scheme } from "@/lib/scheme/types";
import type { BrowsePaint } from "@/lib/paints/types";

/** Query parameter carrying an example scheme's slug, e.g. `?preset=necrons`. */
export const PRESET_PARAM = "preset";

/**
 * Loads an example scheme into the editor from `/visualiser?preset=<slug>` — the
 * homepage carousel's "Open in the designer" link.
 *
 * This replaces the document the user is looking at, so it's the one place on the
 * page that can destroy work. Three hazards, and how each is handled:
 *
 * 1. `useLocalScheme` restores `localStorage` in a mount effect. Seeding before
 *    that lands would simply be overwritten — hence the `mounted` gate.
 * 2. Signed out, `localStorage` is the only copy of the visitor's work, so loading
 *    an example really does destroy it. Hence the `window.confirm` whenever
 *    `schemeHasContent`.
 * 3. Worst: for a signed-in user, a non-blank local scheme makes
 *    `planSignInScheme` choose "adopt-local", and the account autosave can write
 *    it over an existing saved row depending on which effect settles first. Hence
 *    waiting for `ready` (reconciliation finished) and then going through
 *    `adoptScheme`, which creates a *new* row rather than touching the active one.
 *
 * Note the confirm is deliberately **signed-out only**: because `adoptScheme`
 * saves the example as a new row, a signed-in user loses nothing, so a "this can't
 * be undone" prompt would be both unnecessary and untrue.
 *
 * Read from `window.location` rather than `useSearchParams` so `/visualiser` stays
 * static and needs no Suspense boundary — the same approach as the `?scheme=<id>`
 * deep link in `useSchemeSync`.
 */
export function useSchemePreset({
  scheme,
  setScheme,
  paints,
  mounted,
  ready,
  signedIn,
  adoptScheme,
}: {
  scheme: Scheme;
  setScheme: Dispatch<SetStateAction<Scheme>>;
  /** The catalogue, already loaded for the paint picker — the hex source. */
  paints: BrowsePaint[] | null;
  mounted: boolean;
  /** Sign-in reconciliation has settled (see `useSchemeSync`). */
  ready: boolean;
  signedIn: boolean;
  adoptScheme: (next: Scheme) => Promise<void>;
}): void {
  const seededRef = useRef(false);
  // Live handles, so the seeding effect isn't keyed on the scheme (which would
  // re-run it on every keystroke) — same trick as `schemeRef` in `useSchemeSync`.
  const schemeRef = useRef(scheme);
  const adoptRef = useRef(adoptScheme);
  useEffect(() => {
    schemeRef.current = scheme;
    adoptRef.current = adoptScheme;
  }, [scheme, adoptScheme]);

  useEffect(() => {
    if (seededRef.current || !mounted || !ready) return;

    const slug = new URLSearchParams(window.location.search).get(PRESET_PARAM);
    if (!slug) {
      // Nothing asked for; don't re-check on later renders.
      seededRef.current = true;
      return;
    }
    // Wait for the catalogue: resolving early would produce fallback hexes.
    if (!paints || paints.length === 0) return;

    seededRef.current = true;
    const spec = findPreset(slug);
    if (spec) {
      const byId = new Map<string, PresetPaintData>(paints.map((p) => [p.id, p]));
      // `resolvePreset` returns the scheme plus a `slug`, which is metadata about
      // where it came from rather than part of the document. Drop it here so the
      // extra key never reaches editor state or `localStorage` — `toExportShape`
      // would strip it on save anyway, but the in-memory shape should be a
      // plain `Scheme`.
      const { title, elements } = resolvePreset(spec, (id) => byId.get(id));
      const preset: Scheme = { title, elements };
      if (signedIn) {
        // Nothing to warn about: `adoptScheme` saves the example as a NEW row and
        // switches to it, so the scheme they were on is still in the picker,
        // still saved. Prompting here would be asking permission for something
        // that isn't happening.
        void adoptRef.current(preset);
      } else {
        // Signed out, `localStorage` is the only copy, so loading the example
        // really does destroy whatever is in the editor. Ask first — same guard
        // as the Reset button.
        const ok =
          !schemeHasContent(schemeRef.current) ||
          window.confirm(
            `Replace the scheme you're working on with the “${preset.title}” example? This can't be undone.\n\nSign in first and the example is added alongside your work instead.`,
          );
        if (ok) setScheme(preset);
      }
    }

    // Drop the param either way, so a reload doesn't re-prompt or re-seed over
    // edits made since.
    const url = new URL(window.location.href);
    url.searchParams.delete(PRESET_PARAM);
    window.history.replaceState(null, "", url.pathname + url.search);
    // `setScheme` is stable; the refs above cover the rest. Keyed on the gates
    // only, so this can't re-run mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, ready, signedIn, paints?.length]);
}
