"use client";

import type { BrowsePaint } from "@/lib/paints/types";
import { CollectionToggle } from "./collection/collection-toggle";

/**
 * The autocomplete listbox shared by the browse search and the homepage search.
 *
 * These were two copies of the same markup, which is why the same ARIA defect
 * lived in both: the `id` that `aria-activedescendant` points at sat on an inner
 * `<button>` while `role="option"` was on the wrapping `<li>`, so arrowing
 * through the suggestions announced nothing. Fixing it twice is what prompted
 * making it one component.
 *
 * The invariants worth keeping:
 * - `id` and `role="option"` are on the *same* element, and that element has no
 *   focusable descendant. The keyboard path is the input's arrows and Enter.
 * - `onMouseDown`, not `onClick`, so selection beats the input's blur.
 * - The empty state is `role="presentation"`: a listbox child with no role is
 *   invalid, and it isn't an option.
 *
 * The collection toggle inside each row is the one exception, and it is shaped
 * to keep the first invariant true rather than to bend it: `tabIndex={-1}` so it
 * is genuinely not focusable, and `aria-hidden` because ARIA makes an option's
 * children presentational anyway — their roles are ignored by assistive tech
 * whatever we mark them, so announcing them would be a claim we can't honour.
 * It is a pointer-only shortcut, and deliberately so: the same paint can be
 * added from the browse grid, its own page, the alternatives list or the
 * visualiser, all fully keyboard-operable. Don't "fix" it by making it a real
 * button here — that breaks the combobox for everyone using a screen reader.
 */
export function PaintSuggestions({
  id,
  optionId,
  suggestions,
  activeIndex,
  loadError,
  onPick,
  onHover,
}: {
  /** Matches the input's `aria-controls`. */
  id: string;
  /** Builds each option's DOM id; must match the input's `aria-activedescendant`. */
  optionId: (index: number) => string;
  suggestions: BrowsePaint[];
  activeIndex: number;
  loadError: boolean;
  onPick: (paint: BrowsePaint) => void;
  onHover: (index: number) => void;
}) {
  return (
    <ul
      id={id}
      role="listbox"
      className="absolute inset-x-0 top-[calc(100%+4px)] z-30 max-h-72 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-xl"
    >
      {suggestions.length === 0 ? (
        <li role="presentation" className="p-3 text-center text-[12.5px] text-muted-foreground">
          {loadError ? "Paint database unavailable." : "No matching paints."}
        </li>
      ) : (
        suggestions.map((p, i) => (
          <li
            key={p.id}
            id={optionId(i)}
            role="option"
            aria-selected={i === activeIndex}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(p);
            }}
            onMouseEnter={() => onHover(i)}
            className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left ${
              i === activeIndex ? "bg-muted" : "hover:bg-muted"
            }`}
          >
            <span
              className="h-[22px] w-[22px] flex-none rounded-md ring-1 ring-inset ring-black/15"
              style={{ background: p.hex }}
            />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">{p.name}</span>
              <span className="block truncate text-[11.5px] text-muted-foreground">
                {p.brand} · {p.range}
              </span>
            </span>
            <span className="ml-auto flex-none font-mono text-[11px] text-muted-foreground">
              {p.hex}
            </span>
            <CollectionToggle paintId={p.id} paintName={p.name} interactive="pointer" />
          </li>
        ))
      )}
    </ul>
  );
}
