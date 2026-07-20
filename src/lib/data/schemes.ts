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

/** Update an existing scheme's data + title. */
export async function updateScheme(
  id: string,
  data: StoredScheme,
  title: string,
): Promise<void> {
  const { error } = await client()
    .from("schemes")
    .update({ data, title })
    .eq("id", id);
  if (error) throw error;
}

/** Delete a scheme by id. */
export async function deleteScheme(id: string): Promise<void> {
  const { error } = await client().from("schemes").delete().eq("id", id);
  if (error) throw error;
}
