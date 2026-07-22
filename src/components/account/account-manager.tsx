"use client";

/**
 * The "My account" scheme manager — a fuller home for saved schemes than the
 * Visualiser's inline picker. Lists every saved scheme with rename, duplicate,
 * delete, edit (open in the visualiser) and share (publish + copy link).
 *
 * All state is browser-side against Supabase (RLS scopes it to the signed-in
 * user); nothing here runs on the server. When accounts aren't configured, or
 * the user is signed out, it shows the appropriate prompt instead.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import {
  listSchemes,
  updateScheme,
  deleteScheme,
  duplicateScheme,
  publishScheme,
  unpublishScheme,
} from "@/lib/data/schemes";
import { makeShareSlug, makeShareToken, shareUrl } from "@/lib/scheme/share";
import type { SchemeRow } from "@/lib/supabase/types";

const freshShareToken = () => makeShareToken(crypto.getRandomValues(new Uint8Array(8)));

export function AccountManager() {
  const { configured, user, loading: authLoading } = useAuth();
  const [schemes, setSchemes] = useState<SchemeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSchemes(await listSchemes());
    } catch {
      setError("Couldn't load your schemes. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!user) {
      setSchemes([]);
      setLoading(false);
      return;
    }
    void reload();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [user, reload]);

  const patch = (id: string, p: Partial<SchemeRow>) =>
    setSchemes((rows) => rows.map((r) => (r.id === id ? { ...r, ...p } : r)));

  if (!configured) {
    return (
      <Panel>
        <p className="text-sm text-muted-foreground">
          Accounts aren&apos;t enabled on this deployment. Your schemes save in this
          browser only — use the Visualiser&apos;s Export button to back them up.
        </p>
      </Panel>
    );
  }

  if (authLoading) {
    return <Panel><p className="text-sm text-muted-foreground">Loading…</p></Panel>;
  }

  if (!user) {
    return (
      <Panel>
        <h2 className="text-lg font-semibold">Sign in to manage your schemes</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use the sign-in button at the top right. Once signed in, your saved
          schemes appear here to rename, duplicate, delete and share.
        </p>
      </Panel>
    );
  }

  return (
    <div className="mt-6 space-y-8">
      <section aria-label="Saved schemes">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Saved schemes{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({schemes.length})
            </span>
          </h2>
          <Link
            href="/visualiser"
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            + New scheme
          </Link>
        </div>

        {error && (
          <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}

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

      {/* Signals the page's future role (roadmap: save the paints you own). */}
      <section aria-label="Owned paints" className="opacity-70">
        <h2 className="text-lg font-semibold tracking-tight">Owned paints</h2>
        <Panel>
          <p className="text-sm text-muted-foreground">
            Coming soon — track the paints you own so schemes can suggest colours
            from your collection.
          </p>
        </Panel>
      </section>
    </div>
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
  const [copied, setCopied] = useState(false);
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
      await updateScheme(row.id, row.data, title);
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
      await deleteScheme(row.id);
      onRemoved(row.id);
    } catch {
      onError("Couldn't delete that scheme.");
      setBusy(false);
    }
  };

  const toggleShare = async () => {
    if (busy) return;
    setBusy(true);
    onError(null);
    try {
      if (row.is_public) {
        await unpublishScheme(row.id);
        onPatch(row.id, { is_public: false });
      } else {
        const slug = row.share_slug ?? makeShareSlug(row.title, freshShareToken());
        const stored = await publishScheme(row.id, slug, () =>
          makeShareSlug(row.title, freshShareToken()),
        );
        onPatch(row.id, { is_public: true, share_slug: stored });
      }
    } catch {
      onError("Couldn't update sharing for that scheme.");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!row.share_slug) return;
    try {
      await navigator.clipboard.writeText(shareUrl(window.location.origin, row.share_slug));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — non-fatal */
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
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-[15px] font-semibold outline-none focus:border-primary"
            />
          ) : (
            <button
              type="button"
              onClick={startRename}
              title="Click to rename"
              className="block max-w-full truncate text-left text-[15px] font-semibold tracking-tight hover:underline"
            >
              {row.title || "Untitled scheme"}
            </button>
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

        <div className="flex flex-none flex-wrap items-center gap-1.5">
          <Link
            href={`/visualiser?scheme=${row.id}`}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            Edit
          </Link>
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
            onClick={() => void toggleShare()}
            disabled={busy}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {row.is_public ? "Stop sharing" : "Share"}
          </button>
          {row.is_public && row.share_slug && (
            <button
              type="button"
              onClick={() => void copyLink()}
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
