/**
 * CRUD wrappers over the `schemes` table (see `supabase/schema.sql`).
 *
 * All calls run in the browser against Supabase; Row-Level Security guarantees
 * a user only ever sees/edits their own rows. Each helper returns typed data or
 * throws — callers decide how to surface errors. When Supabase isn't configured
 * these are effectively unreachable (the UI never calls them).
 */
import { getSupabase } from "@/lib/supabase/client";
import { hasLiveSession } from "@/lib/supabase/session";
import type { SchemeRow, StoredScheme } from "@/lib/supabase/types";

function client() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

/**
 * All of the given user's schemes, most recently updated first.
 *
 * The `user_id` filter is **not** redundant with RLS. Multiple permissive SELECT
 * policies are OR-combined, so a second one widens access rather than narrowing
 * it. `schemes` had exactly that — "select own" *and* `using (is_public = true)`
 * — and an unfiltered `select("*")` returned the caller's rows **plus every
 * public scheme in the database**: they showed up in the picker and in
 * `/my-schemes`, and the sync layer reconciled against them, so a stranger's row
 * could be the one opened after a deletion. That policy is gone (v0.12.0), but
 * the filter stays: the policy is the security boundary, and this is the query
 * actually asking for what we want.
 */
export async function listSchemes(userId: string): Promise<SchemeRow[]> {
  const { data, error } = await client()
    .from("schemes")
    .select("*")
    .eq("user_id", userId)
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
 * Point a scheme at its photo in Storage, or clear the pointer.
 *
 * Separate from `updateScheme` for the same reason `renameScheme` is: the
 * studio holds no `data`, and the visualiser is autosaving the same row on a
 * debounce. It works the other way round too — `updateScheme` writes only
 * `{ data, title }`, so an autosave can never blank a photo the studio just set.
 */
export async function setSchemePhotoPath(
  id: string,
  photoPath: string | null,
): Promise<WriteResult> {
  const { data: rows, error } = await client()
    .from("schemes")
    .update({ photo_path: photoPath })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return { matched: (rows?.length ?? 0) > 0 };
}

/**
 * Delete a scheme by id. `matched: false` means it was already gone — for a
 * delete that's the desired end state, not a failure.
 *
 * The photo object goes with it, via the `schemes_delete_photo` trigger — the
 * client can't be responsible for that, since a delete from another device
 * never runs this code.
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
 * Used as the *second* half of disambiguating a `matched: false` write. Note
 * what this can and cannot tell you: it runs under the same RLS policies as the
 * write, so a lapsed session gets an empty, error-free answer here too, exactly
 * like a deleted row. On its own it therefore proves nothing about deletion.
 *
 * The caller must establish the session is good first — `hasLiveSession()` in
 * `@/lib/supabase/session` — and only then read an empty result as "gone".
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
 * Publish a scheme under a share slug, making it readable through the
 * slug-scoped `get_public_scheme` RPC. Returns the slug actually stored — on the
 * rare chance the generated slug collides with the table's unique constraint,
 * `regenerate` is called once for a fresh token and we retry, so callers get
 * back the value that stuck.
 *
 * Throws if the write matched no row: like `updateScheme`, "success" on a
 * `where` that hit nothing is indistinguishable from a real publish, and the
 * caller would go on to show a copyable link that resolves to nothing.
 */
export async function publishScheme(
  id: string,
  slug: string,
  regenerate: () => string,
): Promise<string> {
  const first = await trySetSlug(id, slug);
  if (first === "ok") return slug;
  if (first === "gone") throw await shareGoneError();
  // Unique-violation: try once more with a new token.
  const retry = regenerate();
  const second = await trySetSlug(id, retry);
  if (second === "ok") return retry;
  if (second === "gone") throw await shareGoneError();
  throw new SchemeShareError("Couldn't create a share link. Please try again.");
}

/**
 * An error whose message is written *for the user*, so a caller may show it
 * verbatim.
 *
 * The type is the permission. Publishing's failures are specific and actionable
 * — which is the whole reason `trySetSlug` reports `gone` separately from
 * `taken` — but `useShareActions` could only ever replace them with one generic
 * line, because a bare `catch` can't tell them from a raw PostgREST error whose
 * message is no use to anybody. Marking ours makes the distinction survive.
 */
export class SchemeShareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemeShareError";
  }
}

/** What a caller is told when a share write finds no row of theirs to write to. */
const GONE_MESSAGE =
  "That scheme is no longer available — it may have been deleted on another device.";

/** …and when it turns out we simply weren't asking as anybody. */
const SESSION_MESSAGE =
  "Couldn't share that scheme — your session may have expired. Please sign in again.";

/**
 * Which of the two things a `gone` from `trySetSlug` actually was.
 *
 * "Matched no row" is ambiguous: the row may be gone, or this session may have
 * lapsed to the anon key, where `auth.uid()` is null and RLS hides every row we
 * own. Reading the row back can't separate them — that select runs under the
 * same policies (see `schemeExists`) — so only asking about the *session* can.
 * This is the two-step the autosave already does; without it, un-swallowing
 * `GONE_MESSAGE` would tell users with a merely-expired session that their
 * scheme had been deleted on another device, which is worse than the generic
 * message it replaces because it is confidently wrong.
 */
async function shareGoneError(): Promise<SchemeShareError> {
  return new SchemeShareError((await hasLiveSession()) ? GONE_MESSAGE : SESSION_MESSAGE);
}

/**
 * Set is_public + share_slug. `taken` on a unique-violation (retryable with a
 * fresh token), `gone` when the update matched no row, `ok` otherwise.
 */
async function trySetSlug(id: string, slug: string): Promise<"ok" | "taken" | "gone"> {
  const { data: rows, error } = await client()
    .from("schemes")
    .update({ is_public: true, share_slug: slug })
    .eq("id", id)
    .select("id");
  if (error) {
    // 23505 = unique_violation (share_slug already taken).
    if ((error as { code?: string }).code === "23505") return "taken";
    throw error;
  }
  return (rows?.length ?? 0) > 0 ? "ok" : "gone";
}

/**
 * Stop sharing a scheme. We keep `share_slug` set so re-publishing restores the
 * same link; flipping `is_public` off is enough to block access (the RPC only
 * returns rows with `is_public = true`).
 *
 * Reports whether it matched a row, like the other writes. Unlike publishing
 * this doesn't throw: a row that can't be found is already not shared, which is
 * the end state the caller asked for.
 */
export async function unpublishScheme(id: string): Promise<WriteResult> {
  const { data: rows, error } = await client()
    .from("schemes")
    .update({ is_public: false })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return { matched: (rows?.length ?? 0) > 0 };
}
