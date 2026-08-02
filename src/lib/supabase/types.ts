/**
 * Hand-written types for the Supabase schema (see `supabase/schema.sql`).
 *
 * Kept minimal and manual rather than generated, so there's no build-time
 * dependency on the Supabase CLI. Keep in sync with the SQL if the schema
 * changes.
 */
import type { ExportShape } from "@/lib/scheme/io";

/** A saved scheme's stored `data` column — the versioned export shape. */
export type StoredScheme = ExportShape;

// These are `type` aliases, not interfaces, on purpose: interfaces have no
// implicit index signature, so they aren't assignable to `Record<string,
// unknown>` — which silently fails supabase-js's `GenericSchema` constraint and
// collapses the client's schema (and thus insert/update types) to `never`.
export type ProfileRow = {
  id: string;
  username: string | null;
  created_at: string;
};

export type SchemeRow = {
  id: string;
  user_id: string;
  title: string;
  data: StoredScheme;
  is_public: boolean;
  share_slug: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * What `public.get_public_scheme(p_slug)` returns — the only way an anonymous
 * reader can see someone else's scheme, now that the blanket `is_public = true`
 * SELECT policy is gone.
 *
 * A strict subset of `SchemeRow`: no `user_id` (the viewer never shows an
 * author) and no `is_public` (a returned row is public by definition).
 */
export type PublicSchemeRow = {
  id: string;
  title: string;
  data: StoredScheme;
  share_slug: string | null;
  created_at: string;
  updated_at: string;
};

/** Shape passed to the typed Supabase client's generics. Matches the structure
 * `supabase gen types` would emit (each table needs `Relationships`). */
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        // Insert/Update must list every column (defaults optional): postgrest-js
        // treats any Row column absent from Insert as a forbidden property.
        Insert: {
          id: string;
          username?: string | null;
          created_at?: string;
        };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      schemes: {
        Row: SchemeRow;
        Insert: {
          id?: string;
          user_id: string;
          title?: string;
          data: StoredScheme;
          is_public?: boolean;
          share_slug?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<SchemeRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_public_scheme: {
        Args: { p_slug: string };
        // `returns table (...)` is a set, so postgrest hands back an array even
        // though the body is `limit 1`.
        Returns: PublicSchemeRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
