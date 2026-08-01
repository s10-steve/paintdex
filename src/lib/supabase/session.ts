/**
 * "Is this browser's session still real?"
 *
 * Exists for one job: disambiguating a write that matched no rows. Under RLS a
 * request whose session has quietly lapsed carries the anon key, `auth.uid()` is
 * null, and every one of the user's rows becomes invisible — so `update … where
 * id = …` affects nothing, exactly as it would if the row had been deleted on
 * another device. Reading the row back can't tell those apart (it's filtered by
 * the same policy); only asking about the *session* can.
 *
 * `getUser()` rather than `getSession()`: the latter reads persisted storage and
 * will happily hand back a token the server has stopped accepting, which is the
 * failure we're trying to detect. This is a network round trip, so call it only
 * on the rare path that needs it.
 */
import { getSupabase } from "./client";

export async function hasLiveSession(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.auth.getUser();
    return !error && data.user !== null;
  } catch {
    // Offline or otherwise unreachable: not evidence that anything is gone.
    return false;
  }
}
