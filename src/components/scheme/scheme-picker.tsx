"use client";

import type { SyncState } from "@/hooks/use-scheme-sync";
import type { SchemeRow } from "@/lib/supabase/types";

/**
 * The signed-in scheme picker: which saved scheme the editor is on, a "New"
 * button, and the autosave indicator.
 *
 * Presentational — every piece of state and every action belongs to
 * `useSchemeSync`, which the visualiser wires in. Lifted out of
 * `scheme-visualiser` because that file's own header describes it as "the
 * wiring", and two self-contained account cards sitting in the middle of the
 * JSX were the largest thing making that untrue.
 */
export function SchemePicker({
  savedSchemes,
  activeSchemeId,
  syncState,
  onSelect,
  onNew,
}: {
  savedSchemes: SchemeRow[];
  activeSchemeId: string | null;
  syncState: SyncState;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    // Wider bottom margin than the rest of the column: this is what holds the
    // share calls to action apart from the scheme picker, so they read as their
    // own thing rather than part of "My schemes".
    <div className="mb-6 rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <label htmlFor="saved-schemes" className="text-xs font-medium text-muted-foreground">
          My schemes
        </label>
        <select
          id="saved-schemes"
          value={activeSchemeId ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          disabled={savedSchemes.length === 0}
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {savedSchemes.length === 0 && <option value="">No saved schemes</option>}
          {savedSchemes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title || "Untitled scheme"}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onNew}
          className="rounded-md border border-border px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted"
        >
          New
        </button>
        <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {syncState === "saving" && "Saving…"}
          {syncState === "saved" && "Saved"}
          {syncState === "error" && (
            <span className="text-red-600 dark:text-red-400">Sync error</span>
          )}
          {/* The scheme cap is reported through `notice` (the alert banner), not
              here: this span is overwritten by "Saving…" one second after the
              next keystroke, so the message the user most needs to act on was
              the one most likely to be missed. */}
        </span>
      </div>
    </div>
  );
}
