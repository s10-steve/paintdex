/**
 * CRUD wrappers over the `schemes` table (see `supabase/schema.sql`).
 *
 * All calls run in the browser against Supabase; Row-Level Security guarantees
 * a user only ever sees/edits their own rows. Each helper returns typed data or
 * throws — callers decide how to surface errors. When Supabase isn't configured
 * these are effectively unreachable (the UI never calls them).
 */
import { getSupabase } from "@/lib/supabase/client";
import type { SchemeRow, StoredScheme } from "@/lib/supabase/types";

function client() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

/** All of the signed-in user's schemes, most recently updated first. */
export async function listSchemes(): Promise<SchemeRow[]> {
  const { data, error } = await client()
    .from("schemes")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Create a new scheme owned by the given user; returns the inserted row. */
export async function createScheme(
  userId: string,
  data: StoredScheme,
  title: string,
): Promise<SchemeRow> {
  const { data: row, error } = await client()
    .from("schemes")
    .insert({ user_id: userId, data, title })
    .select("*")
    .single();
  if (error) throw error;
  return row;
}

/**
 * Whether a write actually hit a row.
 *
 * `update`/`delete` with a `where` that matches nothing is a success in
 * Postgres, so without asking for the affected rows back a write to a scheme
 * deleted on another device is indistinguishable from a real save — the editor
 * said "Saved" for the rest of the session and the scheme reappeared on the next
 * reload. `.select("id")` is what makes "no such row (for me)" observable.
 *
 * Deliberately `.select("id")` and **not** `.single()`: `single()` turns zero
 * rows into a PGRST116 *error*, which callers would report as a generic sync
 * failure rather than the specific, actionable "this was deleted elsewhere".
 */
export type WriteResult = { matched: boolean };

/** Update an existing scheme's data + title. */
export async function updateScheme(
  id: string,
  data: StoredScheme,
  title: string,
): Promise<WriteResult> {
  const { data: rows, error } = await client()
    .from("schemes")
    .update({ data, title })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return { matched: (rows?.length ?? 0) > 0 };
}

/**
 * Rename a scheme, touching the title only. Deliberately separate from
 * `updateScheme`: a renamer holds whatever `data` it last read, which can be
 * stale (the visualiser autosaves the same row on a debounce), so writing it
 * back would quietly revert edits made elsewhere.
 */
export async function renameScheme(id: string, title: string): Promise<WriteResult> {
  const { data: rows, error } = await client()
    .from("schemes")
    .update({ title })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return { matched: (rows?.length ?? 0) > 0 };
}

/**
 * Delete a scheme by id. `matched: false` means it was already gone — for a
 * delete that's the desired end state, not a failure.
 */
export async function deleteScheme(id: string): Promise<WriteResult> {
  const { data: rows, error } = await client()
    .from("schemes")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return { matched: (rows?.length ?? 0) > 0 };
}

/**
 * Whether a scheme is still readable by the current session.
 *
 * Used to disambiguate a `matched: false` write. Zero affected rows means
 * "no such row" *or* "RLS no longer matches me" — and the second happens
 * whenever the session quietly lapses to the anon key, where `auth.uid()` is
 * null and every row of ours becomes invisible. Announcing a deletion on that
 * basis would blank a scheme that is alive and well, so the caller confirms
 * here first and only treats an empty, error-free answer as gone.
 */
export async function schemeExists(id: string): Promise<boolean> {
  const { data, error } = await client()
    .from("schemes")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/**
 * Duplicate a scheme into a new row for the same user. Thin wrapper over
 * `createScheme` — the caller passes the source scheme's stored data and a
 * title (typically "<title> (copy)"). Returns the inserted row.
 */
export async function duplicateScheme(
  userId: string,
  data: StoredScheme,
  title: string,
): Promise<SchemeRow> {
  return createScheme(userId, data, title);
}

/**
 * Publish a scheme under a share slug (making it readable via its public link;
 * RLS policy "schemes select public" then serves it to anyone). Returns the
 * slug actually stored — on the rare chance the generated slug collides with
 * the table's unique constraint, `regenerate` is called once for a fresh token
 * and we retry, so callers get back the value that stuck.
 */
export async function publishScheme(
  id: string,
  slug: string,
  regenerate: () => string,
): Promise<string> {
  const first = await trySetSlug(id, slug);
  if (first) return slug;
  // Unique-violation: try once more with a new token.
  const retry = regenerate();
  const second = await trySetSlug(id, retry);
  if (second) return retry;
  throw new Error("Couldn't create a share link. Please try again.");
}

/** Set is_public + share_slug; returns false on a unique-violation, throws otherwise. */
async function trySetSlug(id: string, slug: string): Promise<boolean> {
  const { error } = await client()
    .from("schemes")
    .update({ is_public: true, share_slug: slug })
    .eq("id", id);
  if (!error) return true;
  // 23505 = unique_violation (share_slug already taken).
  if ((error as { code?: string }).code === "23505") return false;
  throw error;
}

/**
 * Stop sharing a scheme. We keep `share_slug` set so re-publishing restores the
 * same link; flipping `is_public` off is enough to block access (RLS no longer
 * matches the row for anonymous readers).
 */
export async function unpublishScheme(id: string): Promise<void> {
  const { error } = await client()
    .from("schemes")
    .update({ is_public: false })
    .eq("id", id);
  if (error) throw error;
}
