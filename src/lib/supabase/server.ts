/**
 * Server-side Supabase read for the one deliberately server-rendered route:
 * the public share viewer (`/scheme/[slug]`) and its OpenGraph image. Every
 * other page stays static and talks to Supabase from the browser (see
 * `./client`).
 *
 * This client has **no user session** — it reads as the anonymous role, so it
 * can only ever see rows the RLS policy "schemes select public" exposes
 * (`is_public = true`). That's exactly what a share link should surface. The
 * `NEXT_PUBLIC_*` env vars are readable server-side too, and shipping the anon
 * key is safe precisely because RLS does the gatekeeping.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, SchemeRow } from "./types";

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
 * Fetch a single public scheme by its share slug, or null when it doesn't
 * exist, isn't public, or Supabase isn't configured. RLS guarantees a private
 * or unknown slug returns no row rather than leaking anything.
 */
export async function getPublicSchemeBySlug(
  slug: string,
): Promise<SchemeRow | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("schemes")
    .select("*")
    .eq("share_slug", slug)
    .eq("is_public", true)
    .maybeSingle();
  if (error) return null;
  return data ?? null;
}
