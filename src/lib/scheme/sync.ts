/**
 * Pure decision logic for reconciling the editor's current (localStorage)
 * scheme with a user's saved schemes at sign-in. Kept out of the React
 * component so it can be unit-tested (see `test/scheme.test.ts`).
 */
import { importSchemeObject, toExportShape } from "./io";
import type { SchemeBinding } from "./local-store";
import type { Scheme } from "./types";
import type { SchemeRow } from "@/lib/supabase/types";

/**
 * A stable, order-independent JSON string for a scheme or a stored export
 * shape. Postgres `jsonb` does not preserve key order, so we can't compare raw
 * `JSON.stringify` output; routing both sides through `importSchemeObject` →
 * `toExportShape` normalises structure, key order and runtime ids away.
 */
export function canonicalScheme(data: unknown): string {
  return JSON.stringify(toExportShape(importSchemeObject(data, () => "x")));
}

/** True when a scheme is more than the blank seed (has elements or a title). */
export function schemeHasContent(s: Scheme): boolean {
  return s.elements.length > 0 || s.title.trim() !== "";
}

/**
 * What to do with the editor's current scheme when the user signs in, given the
 * `data` of their already-saved schemes (most-recent first):
 *
 * - `"adopt-local"` — save the current scheme as a new row. Used for a
 *   brand-new user, and (the important case) for a returning user who built
 *   something while signed out that isn't already saved — so that work is
 *   preserved instead of being silently overwritten.
 * - `"load-latest"` — the current scheme is blank or already saved, so just
 *   load the most-recently-updated saved scheme into the editor.
 */
export function planSignInScheme(
  savedData: unknown[],
  local: Scheme,
): "adopt-local" | "load-latest" {
  if (savedData.length === 0) return "adopt-local";
  if (!schemeHasContent(local)) return "load-latest";
  const localCanon = canonicalScheme(local);
  const alreadySaved = savedData.some((d) => {
    try {
      return canonicalScheme(d) === localCanon;
    } catch {
      return false;
    }
  });
  return alreadySaved ? "load-latest" : "adopt-local";
}

/**
 * What to do with the editor's document when the user's saved schemes arrive —
 * on sign-in, on a reload, and on the tab-focus refetch.
 *
 * This supersedes `planSignInScheme` *when there's a binding* (see
 * `./local-store.ts`). With one, identity is known, so the answer never depends
 * on comparing content to every saved row — which is what used to duplicate a
 * scheme renamed on another device and resurrect one deleted on another device.
 *
 * Without a usable binding it defers to `planSignInScheme` unchanged. That's the
 * signed-out case, and the guarantee it protects (work built signed out is
 * adopted as a NEW row, never overwritten) is unaffected by any of this.
 */
export type ReloadPlan =
  /** The bound row exists and we have nothing unflushed: take the server's copy. */
  | { kind: "load-row"; row: SchemeRow }
  /**
   * The bound row exists but the editor holds edits that never reached the
   * server. Keep them — the autosave will push them to the same row, so this
   * still can't duplicate anything.
   */
  | { kind: "keep-local"; row: SchemeRow }
  /**
   * The bound row is gone (deleted on another device). `next` is the row to open
   * instead, or null if the account has none left. Never "adopt-local": that is
   * precisely the branch that used to undo the delete.
   */
  | { kind: "deleted-elsewhere"; next: SchemeRow | null }
  /** No usable binding — `planSignInScheme`'s answer, unchanged. */
  | { kind: "adopt-local" }
  | { kind: "load-latest" };

export function planReload({
  rows,
  binding,
  local,
  userId,
}: {
  /** The user's saved schemes, most-recently-updated first. */
  rows: SchemeRow[];
  binding: SchemeBinding | null;
  local: Scheme;
  userId: string;
}): ReloadPlan {
  // A binding from a different account (a shared browser) says nothing about
  // this user's rows — treating its id as missing would announce a deletion
  // that never happened.
  if (!binding || binding.userId !== userId) {
    return { kind: planSignInScheme(rows.map((r) => r.data), local) };
  }
  const row = rows.find((r) => r.id === binding.id);
  if (!row) return { kind: "deleted-elsewhere", next: rows[0] ?? null };
  // Nothing unflushed → the server's copy is at least as new as ours, so a
  // rename or an edit made elsewhere lands here rather than being clobbered.
  const clean = (() => {
    try {
      return canonicalScheme(local) === binding.syncedCanon;
    } catch {
      return false;
    }
  })();
  return clean ? { kind: "load-row", row } : { kind: "keep-local", row };
}
