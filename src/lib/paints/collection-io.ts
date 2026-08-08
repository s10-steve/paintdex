/**
 * Import / export a paint collection as JSON.
 *
 * The collection only ever lives in Supabase, so unlike a scheme this file
 * isn't the save mechanism — it's the way out. A collection is a lot of manual
 * work to build, and an account is a single point of failure for it, so a
 * backup you hold yourself is worth having.
 *
 * Pure — no React, no DOM, no Supabase — so it stays node-testable. The
 * download itself is `@/lib/download`.
 */
import type { PaintStatus } from "@/lib/supabase/types";

/** Current on-disk format version, for forward-compatible imports. */
export const COLLECTION_FORMAT = 1;

/** A paint and the list it's in — the same unit the data layer works in. */
export interface CollectionEntry {
  paintId: string;
  status: PaintStatus;
}

export interface CollectionExportShape {
  format: number;
  app: "paintdex";
  paints: Array<{ id: string; status: PaintStatus }>;
}

/**
 * Cap on how many entries an import will accept.
 *
 * The catalogue is about 4,900 paints and the database caps an account at
 * 5,000, so anything past this could not be stored anyway; stopping here means
 * a hostile or corrupt file is rejected before it becomes ten thousand upsert
 * rows.
 */
export const MAX_IMPORT_ENTRIES = 5000;

const isStatus = (v: unknown): v is PaintStatus => v === "owned" || v === "wishlist";

/** Build the plain export object. */
export function toCollectionExport(entries: CollectionEntry[]): CollectionExportShape {
  return {
    format: COLLECTION_FORMAT,
    app: "paintdex",
    paints: entries.map(({ paintId, status }) => ({ id: paintId, status })),
  };
}

/** Serialise a collection to pretty JSON. */
export function exportCollectionJSON(entries: CollectionEntry[]): string {
  return JSON.stringify(toCollectionExport(entries), null, 2);
}

/** A filesystem-friendly name for the export. */
export const COLLECTION_FILENAME = "my-paints.paintdex.json";

/**
 * Parse and sanitise a collection from JSON text.
 *
 * Lenient in the same way `importScheme` is: an entry with a bad `status` or a
 * non-string id is dropped rather than failing the whole file, because one bad
 * row in a hand-edited backup shouldn't cost the user the other four thousand.
 * It throws only when the input plainly isn't a collection.
 *
 * Ids are deliberately **not** checked against the catalogue. This module must
 * not import the paint data (that would drag ~4,900 records into any bundle
 * that touches it, the `presets.ts` rule), and an unknown id is recoverable
 * anyway — `/my-paints` shows it as "no longer in the catalogue" with a Remove
 * button, which is honest about what happened. Silently dropping them here
 * would make a re-import quietly lossy.
 *
 * Duplicate ids collapse to the last occurrence, matching what the upsert would
 * do with them anyway.
 */
export function parseCollectionJSON(text: string): CollectionEntry[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  return parseCollectionObject(data);
}

/** Sanitise an already-parsed collection object. */
export function parseCollectionObject(data: unknown): CollectionEntry[] {
  if (!data || typeof data !== "object") {
    throw new Error("That doesn't look like a paint collection.");
  }
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.paints)) {
    throw new Error("That doesn't look like a paint collection (no paints found).");
  }

  const byId = new Map<string, PaintStatus>();
  for (const raw of obj.paints.slice(0, MAX_IMPORT_ENTRIES)) {
    const entry = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    // The database caps `paint_id` at 200 characters, so anything longer would
    // be rejected by the insert with a constraint error the user can do nothing
    // about. Drop it here, where it's just one skipped row.
    if (!id || id.length > 200) continue;
    if (!isStatus(entry.status)) continue;
    byId.set(id, entry.status);
  }

  return [...byId].map(([paintId, status]) => ({ paintId, status }));
}
