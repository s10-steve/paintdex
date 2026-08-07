"use client";

/**
 * The visualiser's share card, over `useShareActions`.
 *
 * This used to be a second implementation of publish/unpublish/copy, alongside
 * the one in `schemes-manager` — two definitions of the token helper, two copies
 * of the slug-reuse rule, two copies of the 1500ms `copied` flag. It is now a
 * thin adapter over the one implementation.
 *
 * It passes the failure message on. It used to drop it, on the grounds that the
 * visualiser reports through the sync indicator — but publishing can fail with
 * "it may have been deleted on another device" or "your session may have
 * expired", and an `aria-live` span the next keystroke overwrites with "Saving…"
 * is no place for either. The caller decides where it goes; the visualiser sends
 * it to `notice`.
 */
import { useCallback } from "react";
import { useShareActions, type ShareActions } from "./use-share-actions";
import type { SchemeRow } from "@/lib/supabase/types";

export type SchemeShare = ShareActions;

export function useSchemeShare({
  activeRow,
  patchRow,
  onError,
}: {
  activeRow: SchemeRow | null;
  patchRow: (id: string, patch: Partial<SchemeRow>) => void;
  onError: (message: string) => void;
}): SchemeShare {
  const report = useCallback(
    (message: string | null) => {
      // Null means "an attempt is starting"; there is nothing to clear yet, so
      // only a real failure is passed on.
      if (message !== null) onError(message);
    },
    [onError],
  );

  return useShareActions({ row: activeRow, onPatch: patchRow, onError: report });
}
