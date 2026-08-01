import type { ActiveFilterChip } from "@/lib/paints/active-filters";

/**
 * The applied-filter summary: one removable chip per active filter.
 *
 * Presentational, like `paint-facets.tsx` — the chips come from
 * `describeBrowseFilters` / `describeSimilarFilters` and removal goes back
 * through whichever writer the page already owns, so this adds no state and no
 * second path to the URL.
 */
export function ActiveFilters({
  chips,
  onRemove,
  className = "",
}: {
  chips: ActiveFilterChip[];
  onRemove: (chip: ActiveFilterChip) => void;
  className?: string;
}) {
  if (!chips.length) return null;
  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`}>
      {chips.map((c) => (
        <li key={c.key}>
          <button
            type="button"
            onClick={() => onRemove(c)}
            // The label has to name the filter: "Remove" repeated a dozen times
            // down a screen reader's list of controls identifies nothing.
            aria-label={`Remove filter: ${c.label}`}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* No CSS casing: the label arrives display-ready from
                `active-filters.ts`, so this text and the `aria-label` above are
                the same string. `capitalize` would also have rewritten the
                sentences — "Metallic Only" — and mangled a user's search text. */}
            <span className="truncate">{c.label}</span>
            <span aria-hidden className="text-muted-foreground">
              ×
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
