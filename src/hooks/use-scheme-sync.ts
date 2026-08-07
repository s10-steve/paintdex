"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { createScheme, listSchemes, schemeExists, updateScheme } from "@/lib/data/schemes";
import { importSchemeObject, toExportShape } from "@/lib/scheme/io";
import { clearBinding, clearBoundScheme, patchLocalDoc, readLocalDoc } from "@/lib/scheme/local-store";
import { canonicalScheme, planReload } from "@/lib/scheme/sync";
import { hasLiveSession } from "@/lib/supabase/session";
import { uid } from "@/lib/scheme/uid";
import { emptyScheme, type Scheme } from "@/lib/scheme/types";
import type { SchemeRow } from "@/lib/supabase/types";

// No "limit" member: the scheme cap goes through `notice`, which persists until
// dismissed, rather than a transient indicator state. See `adoptScheme`.
export type SyncState = "idle" | "saving" | "saved" | "error";

/** `?scheme=<uuid>` — open one of the signed-in user's saved rows. */
export const SCHEME_PARAM = "scheme";

/**
 * Whether a query string asks for a specific saved scheme.
 *
 * Mirrors `hasNewParam`. The precedence rule (`?scheme=` > `?new=1` >
 * `?preset=`) was enforced by three separate `"scheme"` string literals in three
 * files, which is a poor way to hold a rule that decides whether a user's work
 * survives a deep link.
 */
export const hasSchemeParam = (search: string): boolean =>
  new URLSearchParams(search).get(SCHEME_PARAM) !== null;

/** Shown when a scheme this browser was holding turns out to be gone. */
const DELETED_NOTICE =
  "That scheme was deleted on another device, so it hasn't been restored here.";

/** Shown when an insert is refused by the per-account scheme cap. */
const SCHEME_LIMIT_NOTICE =
  "You've reached the maximum number of saved schemes. Delete one from My schemes to make room.";

/** How long to leave between tab-focus refetches. */
const REFETCH_INTERVAL_MS = 10_000;

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
  /**
   * A one-off message about something that happened to the user's data
   * elsewhere (currently: a scheme deleted on another device). Deliberately not
   * a `SyncState`: that one is overwritten by "Saving…" a second after the next
   * keystroke, and this needs to stay until it's read.
   */
  notice: string | null;
  dismissNotice: () => void;
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
 * The reconciliation *decision* is pure and unit-tested — `planReload` (and the
 * `planSignInScheme` it defers to) in `src/lib/scheme/sync.ts`. Two guarantees
 * it exists to protect:
 *
 * 1. A scheme built while signed out that isn't already saved is adopted as a
 *    NEW row, never overwritten by a saved one.
 * 2. A scheme is **never re-created**. The local document carries a *binding* —
 *    which row it came from, and the canonical form of what we last successfully
 *    wrote (see `@/lib/scheme/local-store`) — so identity is a fact rather than
 *    something inferred by comparing content. Inferring it is what used to
 *    duplicate a scheme renamed on another device and undo a delete made on
 *    another device: any divergence looked like "unsaved work" and was inserted
 *    as a new row.
 *
 * `test/scheme-visualiser.test.tsx` pins both.
 *
 * Refs, and why each exists:
 * - `schemeRef` — a live handle, so the reconcile paths can read the current
 *   scheme without depending on `scheme` (which would re-run them on every edit).
 * - `skipSaveRef` — set just before a programmatic `setScheme`, so the debounced
 *   autosave doesn't immediately write back what was just fetched. Note the
 *   autosave's guards run *before* the flag is consumed, so anything that leaves
 *   the editor unbound must clear it too, or it swallows a later real save.
 * - `deepLinkedRef` — honours `?scheme=<id>` exactly once.
 * - `reqRef` / `inflightRef` / `lastFetchRef` — ordering, mutual exclusion and
 *   throttling for the tab-focus refetch.
 * - `saveSeqRef` — "the cache is ahead of any fetch that started before now".
 *   Bumped by the autosave *and* by `patchRow`; the invariant is that **any
 *   writer of a `schemes` column reports through `patchRow`**, or the refetch
 *   reverts it. See that function for what it cost when it didn't.
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
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const deepLinkedRef = useRef(false);
  const schemeRef = useRef(scheme);
  useEffect(() => {
    schemeRef.current = scheme;
  }, [scheme]);
  const skipSaveRef = useRef(false);
  const readyRef = useRef(false);
  const reqRef = useRef(0);
  /**
   * How many autosave writes are currently out. A count rather than a flag: the
   * effect's cleanup clears the pending *timer*, not a request already away, so
   * a second save can start while the first is still in flight — and with a
   * boolean the first one's `finally` would clear it while the second was still
   * running, reopening the refetch guard this exists to close.
   */
  const inflightRef = useRef(0);
  const lastFetchRef = useRef(0);
  /** Bumped by every completed save, so a refetch can tell its rows went stale. */
  const saveSeqRef = useRef(0);
  /** True while a row insert is out, so a double-click can't create two. */
  const creatingRef = useRef(false);
  /** The live active id, for async work that must not act on a stale one. */
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeIdRef.current = activeSchemeId;
  }, [activeSchemeId]);

  /* ---- binding helpers ------------------------------------------------- */

  /**
   * Record which row the document belongs to, and what we last had in sync with
   * it. `syncedCanon` is taken from the editor's scheme rather than the row's
   * `data`, because a rename from `/my-schemes` writes the `title` column only —
   * so a freshly-loaded row can legitimately hold a stale `data.title`, and
   * canonicalising the column would make every load look like unsaved work.
   */
  const bind = (id: string, userId: string, synced: Scheme) => {
    setActiveSchemeId(id);
    patchLocalDoc({ binding: { id, userId, syncedCanon: canonicalScheme(synced) } });
  };

  const unbind = () => {
    setActiveSchemeId(null);
    // The guard above the flag's consumption means an armed flag would otherwise
    // sit here and eat the next genuine save.
    skipSaveRef.current = false;
  };

  const loadRow = (row: SchemeRow, userId: string) => {
    const restored = importSchemeObject(row.data, uid);
    restored.title = row.title;
    skipSaveRef.current = true;
    setScheme(restored);
    bind(row.id, userId, restored);
    setSyncState("idle");
  };

  /**
   * The bound row is gone. Open the most recent survivor (or a blank scheme) and
   * say so — never re-create it, which is exactly what used to undo the delete.
   */
  const openAfterDeletion = (deletedId: string, rows: SchemeRow[], userId: string) => {
    // Clears the binding *and* the stored document: leaving the deleted scheme's
    // content behind would let the unbound content path adopt it right back.
    clearBoundScheme(deletedId);
    unbind();
    setNotice(DELETED_NOTICE);
    setSyncState("idle");
    if (rows[0]) loadRow(rows[0], userId);
    else setScheme(emptyScheme());
  };

  /* ---- reconcile a fresh row list against the editor ------------------- */

  const applyRows = (rows: SchemeRow[], userId: string, initial: boolean) => {
    const plan = planReload({
      rows,
      binding: readLocalDoc().binding,
      local: schemeRef.current,
      userId,
    });
    setSavedSchemes(rows);
    switch (plan.kind) {
      case "load-row":
        loadRow(plan.row, userId);
        break;
      case "keep-local":
        // Unflushed local edits. Leave the editor alone and make sure it's bound,
        // so the autosave pushes them to the same row — still no new row.
        setActiveSchemeId(plan.row.id);
        break;
      case "deleted-elsewhere":
        openAfterDeletion(plan.id, rows, userId);
        break;
      case "adopt-local":
      case "load-latest":
        // The unbound paths only make sense the first time: on a refetch the
        // document is already bound, and running "adopt-local" again would
        // insert a copy on every tab focus.
        if (!initial) break;
        if (plan.kind === "adopt-local") return "adopt" as const;
        // Safe: planSignInScheme only returns "load-latest" when `rows` is
        // non-empty (it returns "adopt-local" for an empty list).
        loadRow(rows[0], userId);
        break;
    }
    return "done" as const;
  };

  // On sign-in: load the user's schemes (migrating the local one the first
  // time). On sign-out: drop server state; the localStorage path takes over
  // again, exactly as before accounts existed.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!mounted) return;
    if (!user) {
      setSavedSchemes([]);
      unbind();
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
      // The same distinction decides the binding: dropping it here whenever
      // `user` is null would drop it on every cold load, before the session
      // resolves, and take every signed-in visitor back to guessing identity
      // from content. Only a settled "nobody is signed in" clears it. (The
      // document itself stays, so signed-out editing still works; the trade-off
      // is that sign out → edit → sign back in adopts a new row rather than
      // clobbering the old one, which is the safe direction.)
      if (!authLoading) clearBinding();
      setReady(!authLoading);
      readyRef.current = !authLoading;
      return;
    }
    // A new session's schemes are about to load; hold off outside writers until
    // we know whether the local scheme is being adopted or replaced.
    setReady(false);
    readyRef.current = false;
    const userId = user.id;
    const req = ++reqRef.current;
    let cancelled = false;
    (async () => {
      try {
        const rows = await listSchemes(userId);
        if (cancelled || req !== reqRef.current) return;
        lastFetchRef.current = Date.now();
        if (applyRows(rows, userId, true) === "adopt") {
          // Work built while signed out that isn't saved anywhere: adopt it as a
          // NEW scheme rather than overwriting it with a saved one.
          const local = schemeRef.current;
          const row = await createScheme(
            userId,
            toExportShape(local),
            local.title || "Untitled scheme",
          );
          if (cancelled) return;
          // The editor already shows `local`, so don't touch `scheme`; just
          // make the new row the active, top-of-list saved scheme.
          skipSaveRef.current = true;
          setSavedSchemes([row, ...rows]);
          bind(row.id, userId, local);
        }
        setSyncState("idle");
      } catch {
        if (!cancelled) setSyncState("error");
      } finally {
        // Settled either way — a failed load must not wedge the editor shut.
        if (!cancelled) {
          setReady(true);
          readyRef.current = true;
        }
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

  // Pick up other devices' changes when the tab comes back to the foreground —
  // without this, a delete or rename made on a phone only lands on the laptop
  // after a manual reload.
  useEffect(() => {
    if (!mounted || !user) return;
    const userId = user.id;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!readyRef.current || inflightRef.current > 0) return;
      // `visibilitychange` fires constantly on mobile, and each refetch is a
      // select over every row.
      if (Date.now() - lastFetchRef.current < REFETCH_INTERVAL_MS) return;
      lastFetchRef.current = Date.now();
      const req = ++reqRef.current;
      const seq = saveSeqRef.current;
      void (async () => {
        let rows: SchemeRow[];
        try {
          rows = await listSchemes(userId);
        } catch {
          /* a failed background refresh is not worth an error state */
          return;
        }
        // Fast tab switching can leave two of these in flight; only the newest
        // may touch the editor.
        if (req !== reqRef.current) return;
        // A save that started *after* this fetch did, and landed before it
        // came back, makes these rows older than what the server now holds —
        // and it moved `syncedCanon` forward, so the document would look clean
        // and the pre-save copy would quietly replace the visible edits.
        if (seq !== saveSeqRef.current || inflightRef.current > 0) return;
        // Deliberately outside the catch above: `applyRows` reaches
        // `importSchemeObject`, which throws on a malformed row. Swallowing that
        // here made one bad row silently disable tab-focus refresh for good.
        applyRows(rows, userId, false);
      })();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, mounted]);

  // Debounced autosave to the account for the active scheme. Blend is a view
  // preference and isn't part of the stored scheme, so it's excluded here.
  useEffect(() => {
    if (!mounted || !user || !activeSchemeId) return;
    // Never write before reconciliation has decided what this document is: an
    // early save would push a stale copy over a rename made elsewhere.
    if (!ready) return;
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    const userId = user.id;
    const id = activeSchemeId;
    setSyncState("saving");
    const title = scheme.title || "Untitled scheme";
    const saved = scheme;
    let cancelled = false;
    const timer = setTimeout(async () => {
      inflightRef.current++;
      try {
        const { matched } = await updateScheme(id, toExportShape(saved), title);
        if (!matched) {
          // Either the row is gone, or this session quietly lost its identity —
          // an anon-key request has `auth.uid() = null`, so RLS matches none of
          // our rows and a live scheme looks exactly like a deleted one. Reading
          // the row back can't separate those (same policies), so ask about the
          // session first and only then treat "unreadable" as "deleted".
          const live = await hasLiveSession();
          const gone =
            live &&
            (await schemeExists(id).then(
              (exists) => !exists,
              () => false,
            ));
          // Only the destructive branch is gated: by now the user may have
          // switched schemes or signed out, and replacing what they're looking
          // at on the strength of a stale in-flight write is its own bug.
          if (gone) {
            if (!cancelled && activeIdRef.current === id) {
              const rows = await listSchemes(userId).catch(() => [] as SchemeRow[]);
              openAfterDeletion(id, rows, userId);
              setSavedSchemes(rows);
            } else {
              // The row is gone but the editor has moved on, so there is nothing
              // to say about it — just don't leave the indicator stuck on
              // "Saving…", which nothing else would reset until the next edit.
              setSyncState("idle");
            }
          } else {
            setSyncState("error");
          }
          return;
        }
        saveSeqRef.current++;
        setSyncState("saved");
        // We and the server now agree; record that, so a later reload knows the
        // editor holds nothing unflushed and can safely take the server's copy.
        //
        // Gated on the editor still being on this row, like the destructive
        // branch above. Ungated, a save of scheme A completing after the user
        // switched to B re-pointed the binding at A while the document held B —
        // so the next `planReload` saw "unflushed edits to A", kept B, and
        // pushed B's content over row A.
        if (!cancelled && activeIdRef.current === id) {
          patchLocalDoc({
            binding: { id, userId, syncedCanon: canonicalScheme(saved) },
          });
        }
        // Reflect the new title and bump updated_at so the picker keeps the
        // same most-recently-updated-first order a reload would show.
        setSavedSchemes((rows) => {
          const now = new Date().toISOString();
          return rows
            .map((r) => (r.id === id ? { ...r, title, updated_at: now } : r))
            .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
        });
      } catch {
        setSyncState("error");
      } finally {
        inflightRef.current--;
      }
    }, 1000);
    return () => {
      clearTimeout(timer);
      // Clearing the timer only helps while it's still pending; once the write
      // is away, `cancelled` is what stops its completion acting on an editor
      // that has moved on. Deliberately narrow — a completed write's
      // `syncedCanon` is still a fact worth recording.
      cancelled = true;
    };
    // Keyed on `user?.id`, not `user`, like every other effect here.
    // `AuthProvider` calls `setSession` on every `onAuthStateChange` event, so a
    // token refresh (roughly hourly) hands us a fresh `user` object with the
    // same id. Depending on the object re-ran this on each one: a redundant
    // write, a spurious "Saving…", and — worse — a chance to consume
    // `skipSaveRef` on a run it was never armed for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheme, user?.id, activeSchemeId, mounted, ready]);

  /* ---- saved-scheme picker handlers ---- */
  const selectScheme = (id: string) => {
    if (id === activeSchemeId || !user) return;
    const row = savedSchemes.find((r) => r.id === id);
    if (!row) return;
    try {
      loadRow(row, user.id);
    } catch {
      setSyncState("error");
    }
  };

  /**
   * Save `next` as a new row and switch the editor to it. Used both for the
   * "New" button (a blank scheme) and for dropping an example scheme into a
   * signed-in editor — going through a *new* row is what keeps the debounced
   * autosave from writing it over whatever was already active.
   */
  const adoptScheme = async (next: Scheme) => {
    if (!user) return;
    // Double-clicking "New" created two rows. `useShareActions` guards with
    // `shareBusy` and `SchemeCard` with `busy`; this was the one that didn't.
    if (creatingRef.current) return;
    creatingRef.current = true;
    try {
      const row = await createScheme(
        user.id,
        toExportShape(next),
        next.title || "Untitled scheme",
      );
      skipSaveRef.current = true;
      setSavedSchemes((rows) => [row, ...rows]);
      setScheme(next);
      bind(row.id, user.id, next);
      setSyncState("idle");
    } catch (e) {
      if (isSchemeLimitError(e)) {
        // Through `notice`, not `syncState`. The state lives in a small
        // aria-live span that the very next scheme change overwrites with
        // "Saving…" — so a capped user clicking "Open in the designer" on the
        // homepage carousel saw the only explanation flash past, with the
        // `?preset=` param already stripped and no example loaded. `notice` is
        // the field that exists for exactly this: it stays until it's read.
        setNotice(SCHEME_LIMIT_NOTICE);
        setSyncState("idle");
      } else {
        setSyncState("error");
      }
    } finally {
      creatingRef.current = false;
    }
  };

  const newScheme = () => adoptScheme(emptyScheme());

  // Honour a `?scheme=<id>` deep link once the user's schemes are loaded, so the
  // account page's "Edit" and the viewer's "Save a copy" open the right scheme.
  // Read from window.location (client-only) to avoid a Suspense boundary.
  //
  // Gated on `ready` — which is what "reconciliation has finished" actually
  // means. The old proxy for it, `savedSchemes.length > 0`, never terminated for
  // a user with no rows (so `?scheme=` stayed in the URL), and the tab-focus
  // refetch replaces `savedSchemes` often enough to make that matter.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!user || !ready || deepLinkedRef.current) return;
    deepLinkedRef.current = true;
    const wanted = new URLSearchParams(window.location.search).get(SCHEME_PARAM);
    if (!wanted) return;
    const row = savedSchemes.find((r) => r.id === wanted);
    if (row && row.id !== activeSchemeId) loadRow(row, user.id);
    // Drop the param so a later reload doesn't force-reselect over the user's
    // subsequent picks.
    const url = new URL(window.location.href);
    url.searchParams.delete(SCHEME_PARAM);
    window.history.replaceState(null, "", url.pathname + url.search);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, ready, savedSchemes]);

  /**
   * Reflect a server write into the cached row list.
   *
   * **Every writer of a `schemes` column must report through here**, and here
   * must move `saveSeqRef`, or the tab-focus refetch will quietly undo it. That
   * refetch guards itself by capturing `saveSeqRef` before it fetches and
   * bailing if it moved — but only the autosave was bumping it, so the writers
   * that go through this function (`renameScheme`, `publishScheme` /
   * `unpublishScheme`, `setSchemePhotoPath`) were invisible to it. A refetch
   * already in flight when one of those landed returned pre-write rows and
   * reverted the column.
   *
   * For `photo_path` that is cosmetic until the next refetch. For publishing it
   * is not: a reverted `share_slug` re-enables the publish control, and
   * `useShareActions` reads `row.share_slug ?? makeShareSlug(…)` — so the next
   * click mints a *new* slug and overwrites the old one, killing a link the user
   * has already copied and sent. The `??` exists precisely so republishing keeps
   * the link, which a stale cache defeats.
   *
   * The cost of the bump is that an in-flight refetch is discarded and retried
   * on the next focus. That is the right trade: "our cache is ahead of any fetch
   * that started before now" is exactly what `saveSeqRef` already means.
   */
  const patchRow = (id: string, patch: Partial<SchemeRow>) => {
    saveSeqRef.current++;
    setSavedSchemes((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  return {
    savedSchemes,
    activeSchemeId,
    activeRow: savedSchemes.find((r) => r.id === activeSchemeId) ?? null,
    syncState,
    setSyncState,
    notice,
    dismissNotice: () => setNotice(null),
    selectScheme,
    newScheme,
    adoptScheme,
    ready,
    patchRow,
  };
}
