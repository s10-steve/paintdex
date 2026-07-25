"use client";

import { useState } from "react";
import { publishScheme, unpublishScheme } from "@/lib/data/schemes";
import { makeShareSlug, makeShareToken, shareUrl } from "@/lib/scheme/share";
import type { SchemeRow } from "@/lib/supabase/types";

/** A fresh, unguessable share token from browser randomness. */
const freshShareToken = () => makeShareToken(crypto.getRandomValues(new Uint8Array(8)));

export type SchemeShare = {
  /** True while a publish/unpublish request is in flight. */
  shareBusy: boolean;
  /** True for a moment after the link is copied, for the button's feedback. */
  copied: boolean;
  togglePublished: () => Promise<void>;
  copyShareLink: () => Promise<void>;
};

/**
 * Publishing the active scheme under an unguessable link, and copying that link.
 *
 * The row cache is owned by `useSchemeSync`, so this takes its `patchRow` to
 * reflect the new state and `onError` to surface a failure in the same sync
 * indicator the rest of the account layer uses.
 */
export function useSchemeShare({
  activeRow,
  patchRow,
  onError,
}: {
  activeRow: SchemeRow | null;
  patchRow: (id: string, patch: Partial<SchemeRow>) => void;
  onError: () => void;
}): SchemeShare {
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const togglePublished = async () => {
    if (!activeRow || shareBusy) return;
    setShareBusy(true);
    try {
      if (activeRow.is_public) {
        await unpublishScheme(activeRow.id);
        patchRow(activeRow.id, { is_public: false });
      } else {
        const slug = activeRow.share_slug ?? makeShareSlug(activeRow.title, freshShareToken());
        const stored = await publishScheme(activeRow.id, slug, () =>
          makeShareSlug(activeRow.title, freshShareToken()),
        );
        patchRow(activeRow.id, { is_public: true, share_slug: stored });
      }
    } catch {
      onError();
    } finally {
      setShareBusy(false);
    }
  };

  const copyShareLink = async () => {
    if (!activeRow?.share_slug) return;
    try {
      await navigator.clipboard.writeText(shareUrl(window.location.origin, activeRow.share_slug));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — non-fatal */
    }
  };

  return { shareBusy, copied, togglePublished, copyShareLink };
}
