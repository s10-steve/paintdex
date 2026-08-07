"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { publishScheme, unpublishScheme, SchemeShareError } from "@/lib/data/schemes";
import { makeShareSlug, makeShareToken, shareUrl } from "@/lib/scheme/share";
import type { SchemeRow } from "@/lib/supabase/types";

/**
 * A fresh, unguessable share token from browser randomness.
 *
 * Five bytes, not eight: `makeShareToken` maps each byte to two base-36 chars
 * and slices to `SHARE_TOKEN_LENGTH` (10), so only the first five were ever
 * used. The call site and the "~40 bits" in `share.ts` now agree about what is
 * being asked for.
 */
const freshShareToken = () => makeShareToken(crypto.getRandomValues(new Uint8Array(5)));

export type ShareActions = {
  /** True while a publish/unpublish request is in flight. */
  shareBusy: boolean;
  /** True for a moment after the link is copied, for the button's feedback. */
  copied: boolean;
  togglePublished: () => Promise<void>;
  copyShareLink: () => Promise<void>;
};

/**
 * Publishing a scheme under an unguessable link, and copying that link.
 *
 * One implementation for both callers. The visualiser's share card and the
 * `/my-schemes` card had the same code twice — two definitions of
 * `freshShareToken`, two copies of the reuse-the-existing-slug rule, two copies
 * of the 1500 ms `copied` flag — differing only in where the error went. They
 * are now the same behaviour by construction, which matters because the rule
 * they share is a security-adjacent one.
 *
 * The row cache belongs to the caller, so this takes `onPatch` to reflect the
 * new state and `onError` to report a failure wherever that caller shows things.
 */
export function useShareActions({
  row,
  onPatch,
  onError,
}: {
  row: Pick<SchemeRow, "id" | "title" | "is_public" | "share_slug"> | null;
  onPatch: (id: string, patch: Partial<SchemeRow>) => void;
  /** Called with a message on failure, and with null when an attempt starts. */
  onError: (message: string | null) => void;
}): ShareActions {
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Cleared on unmount: copy the link and navigate away inside 1.5s and this
  // would otherwise set state on a component that is gone.
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const togglePublished = useCallback(async () => {
    if (!row || shareBusy) return;
    setShareBusy(true);
    onError(null);
    try {
      if (row.is_public) {
        await unpublishScheme(row.id);
        onPatch(row.id, { is_public: false });
      } else {
        // Reuse the slug if there is one, so unpublishing and republishing
        // doesn't break links already shared.
        const slug = row.share_slug ?? makeShareSlug(row.title, freshShareToken());
        const stored = await publishScheme(row.id, slug, () =>
          makeShareSlug(row.title, freshShareToken()),
        );
        onPatch(row.id, { is_public: true, share_slug: stored });
      }
    } catch (err) {
      // A `SchemeShareError` was written for the user — "deleted on another
      // device", "your session may have expired" — and saying so is the point of
      // the data layer distinguishing them. This `catch` used to flatten all of
      // it to the generic line. Anything else is a raw PostgREST/network error,
      // whose own message tells the user nothing.
      onError(
        err instanceof SchemeShareError
          ? err.message
          : "Couldn't update sharing for that scheme.",
      );
    } finally {
      setShareBusy(false);
    }
  }, [row, shareBusy, onPatch, onError]);

  const copyShareLink = useCallback(async () => {
    if (!row?.share_slug) return;
    try {
      await navigator.clipboard.writeText(shareUrl(window.location.origin, row.share_slug));
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — non-fatal */
    }
  }, [row]);

  return { shareBusy, copied, togglePublished, copyShareLink };
}
