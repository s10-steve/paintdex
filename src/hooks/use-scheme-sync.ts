"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { createScheme, listSchemes, updateScheme } from "@/lib/data/schemes";
import { importSchemeObject, toExportShape } from "@/lib/scheme/io";
import { planSignInScheme } from "@/lib/scheme/sync";
import { uid } from "@/lib/scheme/uid";
import { emptyScheme, type Scheme } from "@/lib/scheme/types";
import type { SchemeRow } from "@/lib/supabase/types";

export type SyncState = "idle" | "saving" | "saved" | "error" | "limit";

/**
 * True when a Supabase error is the per-account scheme-count cap firing (the
 * `enforce_scheme_quota` trigger in supabase/schema.sql raises a message
 * starting "Scheme limit reached"). Lets the picker show a specific, actionable
 * message rather than the generic "Sync error".
 */
function isSchemeLimitError(err: unknown): boolean {
  const message =
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message ?? "")
      : "";
  return message.toLowerCase().includes("scheme limit reached");
}

export type SchemeSync = {
  /** The signed-in user's schemes, most-recently-updated first. */
  savedSchemes: SchemeRow[];
  /** Which saved scheme the editor is currently bound to, if any. */
  activeSchemeId: string | null;
  /** That row, resolved. */
  activeRow: SchemeRow | null;
  syncState: SyncState;
  setSyncState: Dispatch<SetStateAction<SyncState>>;
  /** Switch the editor to one of the saved schemes. */
  selectScheme: (id: string) => void;
  /** Create a blank scheme on the account and switch to it. */
  newScheme: () => Promise<void>;
  /**
   * Save `next` to the account as a **new** row and switch the editor to it.
   * Nothing already saved is touched — this is how a scheme can be dropped into
   * a signed-in editor without the autosave writing it over the active row.
   */
  adoptScheme: (next: Scheme) => Promise<void>;
  /**
   * False while sign-in reconciliation is still in flight. Anything that wants to
   * *replace* the editor's scheme from outside must wait for this, or it races
   * the reconciliation and the debounced autosave. See `useSchemePreset`.
   */
  ready: boolean;
  /** Apply a partial update to one cached row (used by the share actions). */
  patchRow: (id: string, patch: Partial<SchemeRow>) => void;
};

/**
 * The account layer on top of `useLocalScheme`: loads the signed-in user's
 * schemes, reconciles them with whatever the editor already holds, and keeps the
 * active one autosaved.
 *
 * The reconciliation *decision* is pure and unit-tested — `planSignInScheme` in
 * `src/lib/scheme/sync.ts`. The guarantee it exists to protect: a scheme built
 * while signed out that isn't already saved is adopted as a NEW row, never
 * overwritten by a saved one. `test/scheme-visualiser.test.tsx` covers the
 * wiring here that acts on that decision.
 *
 * Three refs keep the effects from re-firing:
 * - `schemeRef` — a live handle, so the sign-in effect can migrate the current
 *   scheme without depending on `scheme` (which would re-run it on every edit).
 * - `skipSaveRef` — set just before a programmatic `setScheme`, so the debounced
 *   autosave doesn't immediately write back what was just fetched.
 * - `deepLinkedRef` — honours `?scheme=<id>` exactly once.
 */
export function useSchemeSync({
  scheme,
  setScheme,
  mounted,
}: {
  scheme: Scheme;
  setScheme: Dispatch<SetStateAction<Scheme>>;
  mounted: boolean;
}): SchemeSync {
  const { user, loading: authLoading } = useAuth();
  const [savedSchemes, setSavedSchemes] = useState<SchemeRow[]>([]);
  const [activeSchemeId, setActiveSchemeId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [ready, setReady] = useState(false);

  const deepLinkedRef = useRef(false);
  const schemeRef = useRef(scheme);
  useEffect(() => {
    schemeRef.current = scheme;
  }, [scheme]);
  const skipSaveRef = useRef(false);

  // On sign-in: load the user's schemes (migrating the local one the first
  // time). On sign-out: drop server state; the localStorage path takes over
  // again, exactly as before accounts existed.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!mounted) return;
    if (!user) {
      setSavedSchemes([]);
      setActiveSchemeId(null);
      setSyncState("idle");
      // Signed out there's nothing to reconcile against, so the editor's scheme is
      // settled — but ONLY once the initial session check has finished. While
      // `authLoading` is true, `user` is null because we don't know yet, not
      // because nobody is signed in (`user` derives from `session` in
      // AuthProvider, and `loading` starts true). Calling that "settled" lets an
      // outside writer take the signed-out path for a visitor who is actually
      // signed in — which for `useSchemePreset` means prompting and then
      // destroying unsaved work that `adoptScheme` exists to protect.
      // With Supabase unconfigured, `loading` is false from the start, so this
      // still resolves immediately.
      setReady(!authLoading);
      return;
    }
    // A new session's schemes are about to load; hold off outside writers until
    // we know whether the local scheme is being adopted or replaced.
    setReady(false);
    let cancelled = false;
    (async () => {
      try {
        const rows = await listSchemes();
        if (cancelled) return;
        const local = schemeRef.current;
        // Decide what to do with the scheme currently in the editor. Crucially,
        // if the user built something while signed out that isn't already
        // saved, we adopt it as a NEW scheme rather than overwriting it with a
        // saved one — otherwise that work would be silently lost on sign-in.
        if (planSignInScheme(rows.map((r) => r.data), local) === "adopt-local") {
          const row = await createScheme(
            user.id,
            toExportShape(local),
            local.title || "Untitled scheme",
          );
          if (cancelled) return;
          // The editor already shows `local`, so don't touch `scheme`; just
          // make the new row the active, top-of-list saved scheme.
          skipSaveRef.current = true;
          setSavedSchemes([row, ...rows]);
          setActiveSchemeId(row.id);
        } else {
          setSavedSchemes(rows);
          // Safe: planSignInScheme only returns "load-latest" when `rows` is
          // non-empty (it returns "adopt-local" for an empty `savedData`).
          const first = rows[0];
          const restored = importSchemeObject(first.data, uid);
          restored.title = first.title;
          skipSaveRef.current = true;
          setScheme(restored);
          setActiveSchemeId(first.id);
        }
        setSyncState("idle");
      } catch {
        if (!cancelled) setSyncState("error");
      } finally {
        // Settled either way — a failed load must not wedge the editor shut.
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
    // Deliberately keyed on the user's identity (plus the auth-loading flag, so
    // the signed-out branch re-settles once the session check resolves):
    // `setScheme` is stable, and depending on `scheme` would re-run this on every
    // edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, mounted, authLoading]);

  // Debounced autosave to the account for the active scheme. Blend is a view
  // preference and isn't part of the stored scheme, so it's excluded here.
  useEffect(() => {
    if (!mounted || !user || !activeSchemeId) return;
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    setSyncState("saving");
    const title = scheme.title || "Untitled scheme";
    const timer = setTimeout(async () => {
      try {
        await updateScheme(activeSchemeId, toExportShape(scheme), title);
        setSyncState("saved");
        // Reflect the new title and bump updated_at so the picker keeps the
        // same most-recently-updated-first order a reload would show.
        setSavedSchemes((rows) => {
          const now = new Date().toISOString();
          return rows
            .map((r) => (r.id === activeSchemeId ? { ...r, title, updated_at: now } : r))
            .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
        });
      } catch {
        setSyncState("error");
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [scheme, user, activeSchemeId, mounted]);

  /* ---- saved-scheme picker handlers ---- */
  const loadSchemeRow = (row: SchemeRow) => {
    try {
      const restored = importSchemeObject(row.data, uid);
      restored.title = row.title;
      skipSaveRef.current = true;
      setScheme(restored);
      setActiveSchemeId(row.id);
      setSyncState("idle");
    } catch {
      setSyncState("error");
    }
  };

  const selectScheme = (id: string) => {
    if (id === activeSchemeId) return;
    const row = savedSchemes.find((r) => r.id === id);
    if (row) loadSchemeRow(row);
  };

  /**
   * Save `next` as a new row and switch the editor to it. Used both for the
   * "New" button (a blank scheme) and for dropping an example scheme into a
   * signed-in editor — going through a *new* row is what keeps the debounced
   * autosave from writing it over whatever was already active.
   */
  const adoptScheme = async (next: Scheme) => {
    if (!user) return;
    try {
      const row = await createScheme(
        user.id,
        toExportShape(next),
        next.title || "Untitled scheme",
      );
      skipSaveRef.current = true;
      setSavedSchemes((rows) => [row, ...rows]);
      setActiveSchemeId(row.id);
      setScheme(next);
      setSyncState("idle");
    } catch (e) {
      setSyncState(isSchemeLimitError(e) ? "limit" : "error");
    }
  };

  const newScheme = () => adoptScheme(emptyScheme());

  // Honour a `?scheme=<id>` deep link once the user's schemes are loaded, so the
  // account page's "Edit" and the viewer's "Save a copy" open the right scheme.
  // Read from window.location (client-only) to avoid a Suspense boundary.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!user || deepLinkedRef.current || savedSchemes.length === 0) return;
    const wanted = new URLSearchParams(window.location.search).get("scheme");
    if (!wanted) {
      deepLinkedRef.current = true;
      return;
    }
    const row = savedSchemes.find((r) => r.id === wanted);
    if (row && row.id !== activeSchemeId) loadSchemeRow(row);
    deepLinkedRef.current = true;
    // Drop the param so a later reload doesn't force-reselect over the user's
    // subsequent picks.
    const url = new URL(window.location.href);
    url.searchParams.delete("scheme");
    window.history.replaceState(null, "", url.pathname + url.search);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, savedSchemes]);

  const patchRow = (id: string, patch: Partial<SchemeRow>) =>
    setSavedSchemes((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return {
    savedSchemes,
    activeSchemeId,
    activeRow: savedSchemes.find((r) => r.id === activeSchemeId) ?? null,
    syncState,
    setSyncState,
    selectScheme,
    newScheme,
    adoptScheme,
    ready,
    patchRow,
  };
}
