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
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
