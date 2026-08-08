"use client";

/**
 * The add-to-collection controls: two buttons, "own" and "want".
 *
 * Two presentations of one behaviour. `CollectionToggle` is the compact pair
 * overlaid on a browse card or an alternatives row; `CollectionButtons` is the
 * labelled version for a paint's own page, where there's room to say what the
 * current state is in words.
 *
 * Both render nothing at all when the collection is switched off — signed out,
 * unconfigured, or auth still resolving. That's deliberate over a disabled or
 * sign-in-prompting control: these appear hundreds at a time in the browse
 * grid, and hundreds of prompts to sign in would be the loudest thing on the
 * page.
 */
import { useCollection } from "./collection-provider";
import type { PaintStatus } from "@/lib/supabase/types";

/**
 * The one place each list is named.
 *
 * Visible text and accessible name are built from the same strings, which is
 * the `facetLabel` lesson: a CSS `capitalize` or a separate `aria-label` string
 * lets the two drift, and a control that announces something other than what it
 * shows is worse than either alone.
 */
const LISTS: Record<PaintStatus, { short: string; long: string; icon: string }> = {
  owned: { short: "Own", long: "paints you own", icon: "✓" },
  wishlist: { short: "Want", long: "your wishlist", icon: "☆" },
};

/** What clicking a button will do, said as an action. */
function actionLabel(list: PaintStatus, active: boolean, paintName?: string): string {
  const subject = paintName ? `${paintName} ` : "";
  return active
    ? `Remove ${subject}from ${LISTS[list].long}`
    : `Add ${subject}to ${LISTS[list].long}`;
}

function useToggleHandlers(paintId: string) {
  const { statusOf, setStatus, remove } = useCollection();
  const status = statusOf(paintId);
  // Clicking the list a paint is already in takes it out — one control does add,
  // move and remove, so the compact version needs no third button.
  const press = (list: PaintStatus) =>
    status === list ? void remove(paintId) : void setStatus(paintId, list);
  return { status, press };
}

/**
 * How the compact toggle participates in the page.
 *
 * `focusable` is the normal control: a real tab stop with an accessible name.
 *
 * `pointer` exists for one caller — the search suggestions — where the row is a
 * `role="option"` inside a combobox listbox. ARIA forbids focusable descendants
 * there, *and* makes an option's children presentational, so an assistive
 * technology ignores these buttons' roles whatever we do. Rather than pretend
 * otherwise, that variant takes itself out of the tab order and marks itself
 * `aria-hidden`: a deliberate pointer-only shortcut, in the same spirit as the
 * bar tooltip in `scheme-bars`. Nothing is lost — the same paint can be added
 * from the browse grid, its own page, the alternatives list or the visualiser,
 * all fully keyboard-operable.
 */
export type ToggleInteraction = "focusable" | "pointer";

/**
 * The compact pair, for a browse card, an alternatives row or a suggestion.
 *
 * `stopPropagation` isn't decoration. On a card these sit *beside* the anchor,
 * so a click never reaches the link — but in the suggestions dropdown the row
 * itself has an `onMouseDown` that picks the paint and closes the list, and
 * without stopping propagation clicking ✓ would add the paint *and* navigate
 * away from the search.
 */
export function CollectionToggle({
  paintId,
  paintName,
  interactive = "focusable",
}: {
  paintId: string;
  /** Included in the accessible name, so a screen reader hears which paint. */
  paintName?: string;
  interactive?: ToggleInteraction;
}) {
  const { enabled } = useCollection();
  const { status, press } = useToggleHandlers(paintId);

  if (!enabled) return null;

  const pointerOnly = interactive === "pointer";

  return (
    <span
      className="flex gap-1 rounded-md bg-card/90 p-0.5 shadow-sm ring-1 ring-border backdrop-blur-sm"
      aria-hidden={pointerOnly || undefined}
    >
      {(Object.keys(LISTS) as PaintStatus[]).map((list) => {
        const active = status === list;
        // One string for the tooltip and the accessible name. Building them
        // separately is how they drift, and a control that announces something
        // other than what it shows is worse than either alone — the same reason
        // `facetLabel` exists.
        const label = actionLabel(list, active, paintName);
        const act = (e: { preventDefault: () => void; stopPropagation: () => void }) => {
          e.preventDefault();
          e.stopPropagation();
          press(list);
        };
        return (
          <button
            key={list}
            type="button"
            aria-pressed={active}
            aria-label={label}
            title={label}
            tabIndex={pointerOnly ? -1 : undefined}
            // In the dropdown the surrounding row acts on mousedown, and the
            // input's blur closes the list 120ms later — a click handler would
            // fire too late, on an element that has already gone.
            {...(pointerOnly ? { onMouseDown: act } : { onClick: act })}
            className={`flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <span aria-hidden>{LISTS[list].icon}</span>
          </button>
        );
      })}
    </span>
  );
}

/**
 * The labelled version for `/paints/[id]`, where there is room for the buttons
 * to carry text and for the current state to be stated rather than implied by a
 * highlight.
 */
export function CollectionButtons({ paintId }: { paintId: string }) {
  const { enabled } = useCollection();
  const { status, press } = useToggleHandlers(paintId);

  if (!enabled) return null;

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        {(Object.keys(LISTS) as PaintStatus[]).map((list) => {
          const active = status === list;
          const label = actionLabel(list, active);
          return (
            <button
              key={list}
              type="button"
              aria-pressed={active}
              aria-label={label}
              title={label}
              onClick={() => press(list)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-foreground hover:bg-muted"
              }`}
            >
              <span aria-hidden>{LISTS[list].icon} </span>
              {LISTS[list].short}
            </button>
          );
        })}
      </div>
      {/* `role="status"` rather than a bare span: the buttons' own accessible
          names change on press, so this is a summary, not the only signal. */}
      <p role="status" className="mt-1.5 text-xs text-muted-foreground">
        {status === "owned"
          ? "In the paints you own."
          : status === "wishlist"
            ? "On your wishlist."
            : "Not in your collection."}
      </p>
    </div>
  );
}
