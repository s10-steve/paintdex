"use client";

/**
 * The "My schemes" manager (the `/my-schemes` page) — a fuller home for saved
 * schemes than the Visualiser's inline picker. Lists every saved scheme with
 * rename, duplicate, delete, edit (open in the visualiser) and share (publish +
 * copy link).
 *
 * All state is browser-side against Supabase (RLS scopes it to the signed-in
 * user); nothing here runs on the server. It's rendered inside `SignedInGate`,
 * so it can assume there's a signed-in user.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertBanner } from "@/components/alert-banner";
import { useAuth } from "@/components/auth/auth-provider";
import { SignedInGate } from "@/components/profile/signed-in-gate";
import {
  listSchemes,
  renameScheme,
  deleteScheme,
  duplicateScheme,
} from "@/lib/data/schemes";
import { MAX_SCHEME_TITLE } from "@/lib/scheme/types";
import { useShareActions } from "@/hooks/use-share-actions";
import { clearBoundScheme } from "@/lib/scheme/local-store";
import type { SchemeRow } from "@/lib/supabase/types";

export function SchemesManager() {
  return (
    <SignedInGate>
      <SchemesList />
    </SignedInGate>
  );
}

function SchemesList() {
  const { user } = useAuth();
  const [schemes, setSchemes] = useState<SchemeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    // Guarded like every other fetch in this feature. Without it a slow response
    // arriving after sign-out (or after a second load overtook it) still wrote
    // its rows into state — including, on an account switch, someone else's.
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const rows = await listSchemes(userId);
        if (!cancelled) setSchemes(rows);
      } catch {
        if (!cancelled) setError("Couldn't load your schemes. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const patch = (id: string, p: Partial<SchemeRow>) =>
    setSchemes((rows) => rows.map((r) => (r.id === id ? { ...r, ...p } : r)));

  // Guaranteed present inside SignedInGate; guard keeps TypeScript happy.
  if (!user) return null;

  return (
    <section aria-label="Saved schemes">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Saved schemes{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({schemes.length})
          </span>
        </h2>
        {/* `?new=1`, not a bare link: /visualiser opens whatever the editor was
            last holding, so without it "New scheme" reopens your last one. */}
        <Link
          href="/visualiser?new=1"
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          + New scheme
        </Link>
      </div>

      {/* Every failure on this page funnels through one `error` state (the cards
          lift theirs via `onError`), so one banner covers the lot. Pinned to the
          viewport rather than inline: a delete that fails from a card near the
          bottom of a long list used to report itself off-screen at the top. */}
      {error && <AlertBanner message={error} onDismiss={() => setError(null)} />}

      {loading ? (
        <Panel><p className="text-sm text-muted-foreground">Loading your schemes…</p></Panel>
      ) : schemes.length === 0 ? (
        <Panel>
          <p className="text-sm text-muted-foreground">
            You haven&apos;t saved any schemes yet.{" "}
            <Link href="/visualiser" className="text-primary underline-offset-2 hover:underline">
              Build one in the Visualiser
            </Link>{" "}
            and it&apos;ll appear here.
          </p>
        </Panel>
      ) : (
        <ul className="grid gap-3">
          {schemes.map((row) => (
            <SchemeCard
              key={row.id}
              row={row}
              onPatch={patch}
              onRemoved={(id) => setSchemes((rows) => rows.filter((r) => r.id !== id))}
              onDuplicated={(newRow) => setSchemes((rows) => [newRow, ...rows])}
              onError={setError}
              userId={user.id}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SchemeCard({
  row,
  userId,
  onPatch,
  onRemoved,
  onDuplicated,
  onError,
}: {
  row: SchemeRow;
  userId: string;
  onPatch: (id: string, p: Partial<SchemeRow>) => void;
  onRemoved: (id: string) => void;
  onDuplicated: (row: SchemeRow) => void;
  onError: (msg: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.title);
  const [busy, setBusy] = useState(false);
  // Publishing, unpublishing and copying are shared with the visualiser's share
  // card — see `useShareActions`.
  const { shareBusy, copied, togglePublished, copyShareLink } = useShareActions({
    row,
    onPatch,
    onError,
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const startRename = () => {
    setDraft(row.title || "");
    setEditing(true);
    // Focus after the input renders.
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitRename = async () => {
    setEditing(false);
    const title = draft.trim() || "Untitled scheme";
    if (title === row.title) return;
    onError(null);
    try {
      const { matched } = await renameScheme(row.id, title);
      if (!matched) {
        // Deleted on another device between this list loading and the rename.
        // Note this does NOT `clearBoundScheme` the way the delete below does,
        // and the asymmetry is deliberate: "no rows matched" also happens when a
        // session lapses (see `hasLiveSession`), and blanking a live document on
        // a maybe is the destructive direction. Dropping the card is reversible
        // — a reload brings it back if it was really there — and the visualiser
        // confirms properly before touching anything. Delete is different: the
        // user just asked for that one.
        onError("That scheme no longer exists — it was deleted on another device.");
        onRemoved(row.id);
        return;
      }
      onPatch(row.id, { title });
    } catch {
      onError("Couldn't rename that scheme.");
    }
  };

  const duplicate = async () => {
    if (busy) return;
    setBusy(true);
    onError(null);
    try {
      const copy = await duplicateScheme(
        userId,
        row.data,
        `${row.title || "Untitled scheme"} (copy)`,
      );
      onDuplicated(copy);
    } catch {
      onError("Couldn't duplicate that scheme (you may have hit the scheme limit).");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    if (!window.confirm(`Delete "${row.title || "Untitled scheme"}"? This can't be undone.`)) {
      return;
    }
    setBusy(true);
    onError(null);
    try {
      // A delete that matched nothing means it was already gone — for a delete
      // that's the desired end state, so it's still a success.
      await deleteScheme(row.id);
      // If the visualiser in this browser is holding this scheme, forget it:
      // otherwise its localStorage copy is unaccounted for on the next visit and
      // the sign-in path adopts it as a new row — the delete undone.
      clearBoundScheme(row.id);
      onRemoved(row.id);
    } catch {
      onError("Couldn't delete that scheme.");
      setBusy(false);
    }
  };

  const swatches = deriveSwatches(row);

  return (
    <li className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-8 w-14 flex-none overflow-hidden rounded-md ring-1 ring-inset ring-black/10">
          {swatches.map((hex, i) => (
            <i key={i} className="flex-1" style={{ background: hex }} />
          ))}
        </span>

        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void commitRename()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitRename();
                if (e.key === "Escape") setEditing(false);
              }}
              aria-label="Scheme name"
              maxLength={MAX_SCHEME_TITLE}
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-[15px] font-semibold outline-none focus:border-primary"
            />
          ) : (
            <Link
              href={`/visualiser?scheme=${row.id}`}
              title="Open in the designer"
              className="block max-w-full truncate text-left text-[15px] font-semibold tracking-tight hover:underline"
            >
              {row.title || "Untitled scheme"}
            </Link>
          )}
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            {row.is_public ? (
              <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
                <span aria-hidden>●</span> Shared
              </span>
            ) : (
              <span>Private</span>
            )}
            <span aria-hidden>·</span>
            <span>updated {formatDate(row.updated_at)}</span>
          </div>
        </div>

        <div className="flex w-full flex-none flex-wrap items-center gap-1.5 sm:w-auto">
          {/* The scheme name itself opens the designer, so this row's job is the
              one thing that isn't a link. */}
          <button
            type="button"
            onClick={startRename}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            Rename
          </button>
          <button
            type="button"
            onClick={() => void duplicate()}
            disabled={busy}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => void togglePublished()}
            disabled={busy || shareBusy}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {row.is_public ? "Stop sharing" : "Share"}
          </button>
          {row.is_public && row.share_slug && (
            <button
              type="button"
              onClick={() => void copyShareLink()}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
          )}
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs text-red-600 transition-colors hover:bg-muted disabled:opacity-50 dark:text-red-400"
          >
            Delete
          </button>
        </div>
      </div>

      {row.is_public && row.share_slug && (
        <div className="mt-2.5 flex items-center gap-2 rounded-md bg-muted px-2.5 py-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted-foreground">
            {sharePath(row.share_slug)}
          </span>
          <Link
            href={`/scheme/${row.share_slug}`}
            target="_blank"
            className="flex-none text-[11.5px] text-primary underline-offset-2 hover:underline"
          >
            Open ↗
          </Link>
        </div>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------- utils */

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">{children}</div>
  );
}

/** Element swatches for a stored scheme's `data` (best-effort, defensive). */
function deriveSwatches(row: SchemeRow): string[] {
  const els = (row.data as { elements?: Array<{ paints?: Array<{ hex?: string }> }> })?.elements;
  const hexes: string[] = [];
  for (const el of els ?? []) {
    for (const p of el.paints ?? []) {
      if (typeof p.hex === "string") hexes.push(p.hex);
      if (hexes.length >= 6) break;
    }
    if (hexes.length >= 6) break;
  }
  return hexes.length ? hexes : ["var(--muted)"];
}

/** The share URL's path, shown as a hint (origin added when copied). */
function sharePath(slug: string): string {
  return `/scheme/${slug}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}
