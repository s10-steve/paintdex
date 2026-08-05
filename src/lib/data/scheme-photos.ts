/**
 * The `scheme-photos` bucket: one model photo per saved scheme, for the
 * share-image studio (see `@/lib/scheme/poster`).
 *
 * Thin on purpose, like the rest of `@/lib/data` — these are the only calls
 * that touch the network, and everything they need to decide is decided by the
 * database. The bucket is **private**; access is a `storage.objects` policy in
 * `supabase/schema.sql`, not a URL that happens to be hard to guess.
 *
 * Two ways in, because there are two kinds of reader:
 *
 * - The **owner**, in the editor, is authenticated, so `download()` sends their
 *   session and the "read own" policy passes. The bytes become a `blob:` URL —
 *   already allowed by the CSP, and nothing new for `img-src` to permit.
 * - An **anonymous visitor** on `/scheme/<slug>` can't send a session, so the
 *   server mints a short-lived signed URL. Signing is itself gated on the
 *   "read published" policy, so it succeeds only while the scheme is published.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

export const SCHEME_PHOTO_BUCKET = "scheme-photos";

/**
 * How long a share page's signed URL is good for.
 *
 * Comfortably longer than the page's own `revalidate`, so a cached page never
 * serves a URL that has already expired, and short enough that a link copied
 * out of the page's HTML stops working long before the share link itself would.
 */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

function client() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

/**
 * Where a scheme's photo lives.
 *
 * Deterministic, which matters twice: the first segment must be the owner's id
 * or the "own folder" policies reject the write, and a replacement must land on
 * the same object or every re-upload would orphan the last one.
 */
export function schemePhotoPath(userId: string, schemeId: string): string {
  return `${userId}/${schemeId}.jpg`;
}

/** Upload (or replace) a scheme's photo. Returns the stored object name. */
export async function uploadSchemePhoto(
  userId: string,
  schemeId: string,
  blob: Blob,
): Promise<string> {
  const path = schemePhotoPath(userId, schemeId);
  const { error } = await client()
    .storage.from(SCHEME_PHOTO_BUCKET)
    // `upsert` because the path is deterministic — a second photo for the same
    // scheme is a replacement, not a conflict.
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  return path;
}

/**
 * Read a scheme's photo as the signed-in owner, or null if it isn't there.
 *
 * A missing object is a normal outcome, not an error: the row can point at a
 * path whose object was removed out from under it, and the studio should open
 * empty rather than broken.
 */
export async function downloadSchemePhoto(path: string): Promise<Blob | null> {
  const { data, error } = await client().storage.from(SCHEME_PHOTO_BUCKET).download(path);
  if (error) return null;
  return data ?? null;
}

/** Remove a scheme's photo. Already-gone is success. */
export async function deleteSchemePhoto(path: string): Promise<void> {
  const { error } = await client().storage.from(SCHEME_PHOTO_BUCKET).remove([path]);
  if (error) throw error;
}

/**
 * A time-limited URL an anonymous visitor can load, or null.
 *
 * Takes the client rather than reaching for one, because the only caller is the
 * server component and its client is the anon one from `@/lib/supabase/server`.
 * Null on any failure — an unpublished scheme, a deleted object, Supabase being
 * down — because the share page must render without the photo rather than 500.
 */
export async function signSchemePhoto(
  supabase: SupabaseClient<Database>,
  path: string,
  expiresIn: number = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(SCHEME_PHOTO_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) {
    console.error("[scheme] createSignedUrl failed", { path, message: error.message });
    return null;
  }
  return data?.signedUrl ?? null;
}
