"use client";

/**
 * The visualiser's share card, over `useShareActions`.
 *
 * This used to be a second implementation of publish/unpublish/copy, alongside
 * the one in `schemes-manager` — two definitions of the token helper, two copies
 * of the slug-reuse rule, two copies of the 1500ms `copied` flag. It is now a
 * thin adapter: the visualiser reports failures through the sync indicator, so
 * it takes a no-argument `onError` and drops the message.
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
  onError: () => void;
}): SchemeShare {
  const report = useCallback(
    (message: string | null) => {
      // Null means "an attempt is starting"; the sync indicator has nothing to
      // clear, so only a real failure is passed on.
      if (message !== null) onError();
    },
    [onError],
  );

  return useShareActions({ row: activeRow, onPatch: patchRow, onError: report });
}
