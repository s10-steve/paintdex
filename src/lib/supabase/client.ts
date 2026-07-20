/**
 * Browser Supabase client (singleton).
 *
 * Paintdex is a static site — there is no server runtime — so all Supabase
 * access happens from the browser. `createBrowserClient` persists the session
 * and refreshes tokens for us. Access is protected by Row-Level Security (see
 * `supabase/schema.sql`), which is why shipping the public anon key is safe.
 *
 * If the env vars are absent (e.g. a fork without a Supabase project), we don't
 * throw — `isSupabaseConfigured` lets the UI hide account features and fall
 * back to the localStorage-only experience.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when both Supabase env vars are set, so account features can be shown. */
export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient<Database> | null = null;

/**
 * Returns the shared browser client, or `null` when Supabase isn't configured.
 * Callers should treat `null` as "accounts are unavailable".
 */
export function getSupabase(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createBrowserClient<Database>(url!, anonKey!);
  }
  return client;
}
