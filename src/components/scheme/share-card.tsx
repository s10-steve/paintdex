"use client";

import Link from "next/link";
import type { SchemeRow } from "@/lib/supabase/types";

/**
 * The two share calls to action — a shareable image, and a public link — plus
 * whatever the current scheme's sharing state is.
 *
 * Always rendered, signed in or not: the image studio works entirely in the
 * browser off the `localStorage` scheme, so gating the whole box on an account
 * would hide the feature from exactly the people most likely to try it. The
 * link half is what needs a saved row, and says so.
 */
export function ShareCard({
  activeRow,
  signedIn,
  canMakeImage,
  shareBusy,
  copied,
  onOpenStudio,
  onTogglePublished,
  onCopyLink,
}: {
  activeRow: SchemeRow | null;
  signedIn: boolean;
  /** False for an empty scheme — there'd be nothing on the poster. */
  canMakeImage: boolean;
  shareBusy: boolean;
  copied: boolean;
  onOpenStudio: () => void;
  onTogglePublished: () => void;
  onCopyLink: () => void;
}) {
  return (
    <div className="mb-5 rounded-md border border-border bg-card px-3 py-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpenStudio}
          disabled={!canMakeImage}
          className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Create shareable image
        </button>
        <button
          type="button"
          onClick={onTogglePublished}
          disabled={!activeRow || shareBusy || activeRow.is_public}
          className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Create shareable link
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {!activeRow && (
          <span className="text-muted-foreground">
            A shareable image is made in your browser.{" "}
            {signedIn
              ? "Save this scheme to create a link as well."
              : "Sign in to create a shareable link as well."}
          </span>
        )}
        {activeRow?.is_public && activeRow.share_slug && (
          <>
            <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
              <span aria-hidden>●</span> Public — anyone with the link can view
            </span>
            <button
              type="button"
              onClick={onCopyLink}
              className="rounded-md border border-border px-2 py-1 text-foreground transition-colors hover:bg-muted"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
            <button
              type="button"
              onClick={onTogglePublished}
              disabled={shareBusy}
              className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              Stop sharing
            </button>
          </>
        )}
        {activeRow && !activeRow.is_public && (
          <span className="text-muted-foreground">Private to your account.</span>
        )}
        {activeRow && (
          <Link
            href="/my-schemes"
            className="ml-auto text-primary underline-offset-2 hover:underline"
          >
            Manage in My schemes →
          </Link>
        )}
      </div>
    </div>
  );
}
