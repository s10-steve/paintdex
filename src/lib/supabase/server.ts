/**
 * Server-side Supabase read for the one deliberately server-rendered route:
 * the public share viewer (`/scheme/[slug]`) and its OpenGraph image. Every
 * other page stays static and talks to Supabase from the browser (see
 * `./client`).
 *
 * This client has **no user session** — it reads as the anonymous role, so RLS
 * on `schemes` matches none of its rows. The one thing it can reach is the
 * `get_public_scheme` RPC, which is `security definer` and takes an exact share
 * slug. The `NEXT_PUBLIC_*` env vars are readable server-side too, and shipping
 * the anon key is safe precisely because the database does the gatekeeping.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, PublicSchemeRow } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when Supabase is configured (mirrors the browser client). */
export const isSupabaseConfigured = Boolean(url && anonKey);

/** A fresh anon Supabase client for server use, or null when unconfigured. */
export function getServerSupabase(): SupabaseClient<Database> | null {
  if (!url || !anonKey) return null;
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Fetch a single published scheme by its share slug, or null when it doesn't
 * exist, isn't public, or Supabase isn't configured.
 *
 * Goes through the `get_public_scheme` RPC rather than selecting the table.
 * There is deliberately no policy that would let this client read `schemes`
 * directly: the old one (`using (is_public = true)`) made every published
 * scheme readable by anyone who asked, slug or no slug, which is not what a
 * share link means. The function's body — an equality match on `share_slug`
 * plus `is_public` — is now the whole of the anonymous read surface.
 */
export async function getPublicSchemeBySlug(
  slug: string,
): Promise<PublicSchemeRow | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  // A blank slug can't match `share_slug` (it's null on unpublished rows and a
  // real token otherwise), but there's no reason to ask.
  if (!slug) return null;
  const { data, error } = await supabase.rpc("get_public_scheme", { p_slug: slug });
  if (error) {
    // Logged, not swallowed. Returning null is right — the page shows its
    // "not available" fallback and must not throw — but with no log, a missing
    // RPC, a permission denial and a genuinely unknown slug were the same
    // silent outcome, and the page tells the visitor the same thing for all
    // three. That is exactly what happened when this shipped: the migration had
    // rolled back, `get_public_scheme` did not exist, and every share link on
    // the site returned "Scheme not available" with nothing anywhere saying why.
    // This line is the difference between reading the answer off the Vercel
    // logs and guessing at it.
    console.error("[scheme] get_public_scheme failed", {
      slug,
      code: error.code,
      message: error.message,
    });
    return null;
  }
  return data?.[0] ?? null;
}
