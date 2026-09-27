"use client";

/**
 * The signed-in user's paint collection, held once for the whole app.
 *
 * Every view that can add a paint needs to know what's already in the
 * collection: a toggle on each of the browse grid's cards, the paint detail
 * page, each row of the alternatives list, and `/my-paints` itself. Fetching
 * per component is not an option — the browse grid renders hundreds of cards —
 * and fetching per page would let two mounted views disagree the moment one of
 * them toggled something. So the map is loaded once per session and lives here.
 *
 * It is deliberately a context, where `AlertBanner` deliberately isn't. The
 * distinction is state versus presentation: a banner's owner already has the
 * state, so a provider would buy nothing, whereas this *is* shared state and
 * there's no other place for it to live.
 *
 * Signed out, unconfigured, or still resolving auth, the provider is inert:
 * `enabled` is false, no request is made, and every consumer renders nothing.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { AlertBanner } from "@/components/alert-banner";
import {
  importCollection,
  listCollection,
  removePaint as removePaintRow,
  setPaintStatus as setPaintStatusRow,
} from "@/lib/data/paint-collection";
import type { PaintStatus } from "@/lib/supabase/types";

export type CollectionMap = ReadonlyMap<string, PaintStatus>;
export type CollectionPhase = "off" | "loading" | "ready" | "failed";

export interface CollectionValue {
  /** Whether the collection features should appear at all. */
  enabled: boolean;
  /** Whether the map reflects the server yet. */
  ready: boolean;
  /**
   * Where the load has got to, for the consumers that must tell "still
   * loading" apart from "couldn't load". `ready` alone can't: a failed load
   * leaves it false forever, which read as "Loading…" with nothing to retry.
   * `off` covers unconfigured and settled signed-out; `loading` includes
   * resolving auth, so a signed-in visitor never sees an "off" frame first.
   */
  phase: CollectionPhase;
  /** Which list a paint is in, or null. */
  statusOf: (paintId: string) => PaintStatus | null;
  entries: CollectionMap;
  setStatus: (paintId: string, status: PaintStatus) => Promise<void>;
  remove: (paintId: string) => Promise<void>;
  /**
   * Put many paints in one list at once — the shopping list's "add all to
   * wishlist". One optimistic update and one request; on failure only those
   * paints roll back, and the banner is shown once rather than per paint.
   */
  setStatusMany: (paintIds: readonly string[], status: PaintStatus) => Promise<void>;
  /** Re-read from the server. For after an import, which writes in bulk. */
  reload: () => Promise<void>;
  error: string | null;
  dismissError: () => void;
}

const EMPTY: CollectionMap = new Map();

/**
 * The inert value, used when there is no provider above — the same approach
 * `useAuth` takes. A consumer rendered outside the tree gets a collection that
 * is simply switched off rather than a thrown error, which keeps the toggles
 * safe to drop into a server-rendered page or a test without extra scaffolding.
 */
const INERT: CollectionValue = {
  enabled: false,
  ready: false,
  phase: "off",
  statusOf: () => null,
  entries: EMPTY,
  setStatus: async () => {},
  remove: async () => {},
  setStatusMany: async () => {},
  reload: async () => {},
  error: null,
  dismissError: () => {},
};

const CollectionContext = createContext<CollectionValue>(INERT);

export function useCollection(): CollectionValue {
  return useContext(CollectionContext);
}

export function CollectionProvider({ children }: { children: ReactNode }) {
  const { configured, user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const [entries, setEntries] = useState<CollectionMap>(EMPTY);
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `enabled` requires auth to have *settled*. `!user` is "unknown" while
  // `authLoading`, exactly as in `use-scheme-sync`, and treating it as
  // signed-out would flash the toggles out of existence on every cold load.
  const enabled = configured && !authLoading && userId !== null;

  const phase: CollectionPhase = !configured
    ? "off"
    : authLoading
      ? "loading"
      : userId === null
        ? "off"
        : loadFailed
          ? "failed"
          : ready
            ? "ready"
            : "loading";

  /**
   * The load. Keyed on `userId`, never on `user` — a token refresh hands back a
   * fresh object roughly every hour, and keying on the object would refetch the
   * whole collection each time.
   */
  useEffect(() => {
    if (!configured || authLoading) return;

    /* eslint-disable react-hooks/set-state-in-effect */
    if (!userId) {
      // Settled signed-out. Drop the map so a second account on a shared
      // browser can't see the first one's paints between renders.
      setEntries(EMPTY);
      setReady(false);
      setLoadFailed(false);
      return;
    }

    // Guarded like every other fetch in this codebase. Without it a slow
    // response arriving after sign-out — or after an account switch overtook it
    // — still writes its rows into state, including someone else's.
    let cancelled = false;
    setReady(false);
    setLoadFailed(false);
    void (async () => {
      try {
        const rows = await listCollection(userId);
        if (cancelled) return;
        setEntries(new Map(rows.map((r) => [r.paint_id, r.status])));
        setReady(true);
      } catch {
        if (cancelled) return;
        setLoadFailed(true);
        setError("Couldn't load your paints. Please try again.");
      }
    })();
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      cancelled = true;
    };
  }, [configured, authLoading, userId]);

  /**
   * Apply a change locally, call the server, and put the old value back if it
   * fails.
   *
   * Optimistic because the alternative is a spinner on a control the size of a
   * checkbox. The rollback is the part that matters: a toggle that flipped,
   * failed silently and then reverted on the next page load is the failure mode
   * this feature can least afford, since the whole point is that the list is
   * trustworthy.
   *
   * It closes over `entries` rather than reading a ref, and that costs nothing:
   * the context value already changes identity whenever the map does, so every
   * consumer re-renders on a toggle regardless of how stable these callbacks
   * are. The rollback applies to whatever the map holds *at that moment*, via
   * the functional update, so a second toggle landing while the first request
   * is still out doesn't get clobbered.
   */
  const mutate = useCallback(
    async (paintId: string, next: PaintStatus | null, run: () => Promise<unknown>) => {
      const previous = entries.get(paintId) ?? null;
      if (previous === next) return;

      const write = (map: CollectionMap, value: PaintStatus | null) => {
        const copy = new Map(map);
        if (value === null) copy.delete(paintId);
        else copy.set(paintId, value);
        return copy;
      };

      setEntries((current) => write(current, next));

      try {
        await run();
      } catch {
        setEntries((current) => write(current, previous));
        setError("Couldn't save that change. Please try again.");
      }
    },
    [entries],
  );

  const setStatus = useCallback(
    async (paintId: string, status: PaintStatus) => {
      if (!userId) return;
      await mutate(paintId, status, () => setPaintStatusRow(userId, paintId, status));
    },
    [mutate, userId],
  );

  const remove = useCallback(
    async (paintId: string) => {
      if (!userId) return;
      // A `matched: false` here means it was already gone, which for a delete is
      // the desired end state — so it deliberately isn't treated as a failure.
      await mutate(paintId, null, () => removePaintRow(userId, paintId));
    },
    [mutate, userId],
  );

  const setStatusMany = useCallback(
    async (paintIds: readonly string[], status: PaintStatus) => {
      if (!userId) return;
      // Only what would actually change, so a paint already in that list isn't
      // re-written and can't be "rolled back" to where it already was.
      const changing = [...new Set(paintIds)].filter((id) => entries.get(id) !== status);
      if (changing.length === 0) return;
      const previous = new Map(changing.map((id) => [id, entries.get(id) ?? null]));

      setEntries((current) => {
        const copy = new Map(current);
        for (const id of changing) copy.set(id, status);
        return copy;
      });

      try {
        // The import's upsert: the same conflict target as a single toggle, so
        // this merges rather than replacing anything.
        await importCollection(
          userId,
          changing.map((paintId) => ({ paintId, status })),
        );
      } catch {
        // Only these ids, via the functional update, so a toggle made while this
        // was in flight isn't clobbered. `importCollection` writes in chunks of
        // 500, so past that a failure can leave earlier chunks written — a
        // scheme can't realistically get there, and the next load corrects it.
        setEntries((current) => {
          const copy = new Map(current);
          for (const [id, was] of previous) {
            if (copy.get(id) !== status) continue;
            if (was === null) copy.delete(id);
            else copy.set(id, was);
          }
          return copy;
        });
        setError("Couldn't save that change. Please try again.");
      }
    },
    [entries, userId],
  );

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const rows = await listCollection(userId);
      setEntries(new Map(rows.map((r) => [r.paint_id, r.status])));
      setReady(true);
      setLoadFailed(false);
    } catch {
      setError("Couldn't reload your paints. Please try again.");
    }
  }, [userId]);

  const statusOf = useCallback(
    (paintId: string) => entries.get(paintId) ?? null,
    [entries],
  );

  const value = useMemo<CollectionValue>(
    () => ({
      enabled,
      ready,
      phase,
      statusOf,
      entries,
      setStatus,
      remove,
      setStatusMany,
      reload,
      error,
      dismissError: () => setError(null),
    }),
    [enabled, ready, phase, statusOf, entries, setStatus, remove, setStatusMany, reload, error],
  );

  return (
    <CollectionContext.Provider value={value}>
      {children}
      {/* Rendered here rather than by each consumer, so a failed toggle is
          announced once no matter which of the four views triggered it, and on
          screen wherever the user has scrolled to. */}
      {error ? (
        <AlertBanner message={error} onDismiss={() => setError(null)} />
      ) : null}
    </CollectionContext.Provider>
  );
}
