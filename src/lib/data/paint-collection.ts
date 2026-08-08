/**
 * CRUD wrappers over the `paint_collection` table (see `supabase/schema.sql`).
 *
 * Same shape as `./schemes.ts`: every call runs in the browser, Row-Level
 * Security guarantees a user only ever sees their own rows, and each helper
 * returns typed data or throws so callers decide how to surface errors.
 *
 * Unlike schemes there is no anonymous path at all — a collection is never
 * shared or published, so there is no `security definer` read function and no
 * second SELECT policy. The feature is accounts-only by design; with Supabase
 * unconfigured the UI never calls any of this.
 */
import { getSupabase } from "@/lib/supabase/client";
import type { PaintCollectionRow, PaintStatus } from "@/lib/supabase/types";

function client() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

/** A paint and the list it belongs in — the collection's unit of work. */
export type CollectionEntry = { paintId: string; status: PaintStatus };

/**
 * Every paint in the given user's collection, both lists, oldest first.
 *
 * The `user_id` filter is **not** redundant with RLS, for the reason spelled
 * out on `listSchemes`: permissive SELECT policies are OR-combined, so a policy
 * added later widens access rather than narrowing it. The policy is the
 * security boundary; this is the query actually asking for what we want.
 *
 * Ordered by `created_at` so the two lists render in the order paints were
 * added. `updated_at` would reshuffle a list every time an unrelated paint
 * moved between them.
 */
export async function listCollection(userId: string): Promise<PaintCollectionRow[]> {
  const { data, error } = await client()
    .from("paint_collection")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Put a paint in one of the lists, wherever it was before.
 *
 * An upsert rather than an insert-or-update pair: `paint_collection_user_paint_key`
 * makes "add this paint" and "move it to the other list" the same operation, so
 * a toggle never has to know which one it's performing, and two rapid clicks
 * can't race into a duplicate row.
 *
 * `ignoreDuplicates: false` is the difference between an upsert and "insert if
 * absent" — without it a conflict is skipped rather than updated, and moving a
 * paint between lists would silently do nothing.
 */
export async function setPaintStatus(
  userId: string,
  paintId: string,
  status: PaintStatus,
): Promise<PaintCollectionRow> {
  const { data, error } = await client()
    .from("paint_collection")
    .upsert(
      { user_id: userId, paint_id: paintId, status },
      { onConflict: "user_id,paint_id", ignoreDuplicates: false },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/**
 * Whether a write actually hit a row — see `./schemes.ts` for why this is
 * `.select("id")` and never `.single()`.
 */
export type WriteResult = { matched: boolean };

/**
 * Take a paint out of the collection entirely.
 *
 * `matched: false` means it was already gone, which for a delete is the desired
 * end state rather than a failure — the same reading as `deleteScheme`. Callers
 * use it to avoid reporting an error for a second click.
 */
export async function removePaint(userId: string, paintId: string): Promise<WriteResult> {
  const { data: rows, error } = await client()
    .from("paint_collection")
    .delete()
    .eq("user_id", userId)
    .eq("paint_id", paintId)
    .select("id");
  if (error) throw error;
  return { matched: (rows?.length ?? 0) > 0 };
}

/**
 * How many rows go in one import request.
 *
 * A whole-catalogue import is ~4,900 rows, which is a multi-megabyte request
 * body and a single statement big enough to be worth splitting: a failure part
 * way through leaves the earlier chunks applied, which for an idempotent upsert
 * means re-running the import finishes the job rather than starting over.
 */
const IMPORT_CHUNK = 500;

/**
 * Upsert many entries at once, for an imported file. Returns how many rows were
 * written.
 *
 * Deliberately the same conflict target as `setPaintStatus`, so importing a
 * file over an existing collection *merges* — an entry already present moves to
 * whichever list the file says, and everything absent from the file is left
 * alone. Replacing instead is `clearCollection` followed by this.
 */
export async function importCollection(
  userId: string,
  entries: CollectionEntry[],
): Promise<number> {
  let written = 0;
  for (let i = 0; i < entries.length; i += IMPORT_CHUNK) {
    const chunk = entries.slice(i, i + IMPORT_CHUNK);
    const { data, error } = await client()
      .from("paint_collection")
      .upsert(
        chunk.map(({ paintId, status }) => ({
          user_id: userId,
          paint_id: paintId,
          status,
        })),
        { onConflict: "user_id,paint_id", ignoreDuplicates: false },
      )
      .select("id");
    if (error) throw error;
    written += data?.length ?? 0;
  }
  return written;
}

/**
 * Empty the collection. Only used by a replace-mode import, which is why it
 * isn't offered as a button of its own — "delete everything" wants to be the
 * consequence of a choice the user has already been asked to confirm, not a
 * control sitting next to Remove.
 */
export async function clearCollection(userId: string): Promise<void> {
  const { error } = await client()
    .from("paint_collection")
    .delete()
    .eq("user_id", userId);
  if (error) throw error;
}
