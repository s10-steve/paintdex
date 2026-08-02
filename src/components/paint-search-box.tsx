"use client";

import { useMemo, useState } from "react";
import { filterPaints } from "@/lib/paints/filter";
import { PaintSuggestions } from "./paint-suggestions";
import type { BrowsePaint } from "@/lib/paints/types";

/** Shortest term worth suggesting on — one letter matches most of the catalogue. */
const MIN_TERM = 2;
const MAX_SUGGESTIONS = 8;

/**
 * The browse page's search input and its autocomplete.
 *
 * Owns only what the dropdown needs — whether it's open, which row is
 * highlighted, and the suggestion list derived from the *live* text rather than
 * the debounced query, so the dropdown keeps pace with typing. The committed
 * value and the debounce stay with the page, because those are URL state.
 *
 * Lifted out of `paints-browser`, where it was ~90 lines of self-contained
 * combobox in the middle of a file that also owns URL transport, the sidebar,
 * the grid, pagination and a modal.
 */
export function PaintSearchBox({
  value,
  onChange,
  onPick,
  paints,
  loadError,
}: {
  value: string;
  onChange: (value: string) => void;
  onPick: (paint: BrowsePaint) => void;
  paints: BrowsePaint[] | null;
  loadError: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const suggestions = useMemo(() => {
    const term = value.trim();
    if (term.length < MIN_TERM || !paints) return [];
    return filterPaints(paints, { search: term }).slice(0, MAX_SUGGESTIONS);
  }, [value, paints]);

  const visible = open && value.trim().length >= MIN_TERM;
  const listboxShown = Boolean(visible && (paints?.length || loadError));

  const pick = (paint: BrowsePaint) => {
    setOpen(false);
    setActive(-1);
    onPick(paint);
  };

  return (
    <div className="relative flex-1">
      <input
        type="search"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        // Delay the close so a click (mousedown) on a suggestion registers first.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!visible || !suggestions.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && active >= 0) {
            // Enter with a highlighted suggestion jumps to that paint; Enter with
            // none highlighted falls through to the normal (debounced)
            // grid-filtering behaviour.
            e.preventDefault();
            pick(suggestions[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
        }}
        placeholder="Search by name, brand, range or code…"
        aria-label="Search paints"
        role="combobox"
        // Matches when the listbox is actually in the DOM, including the "No
        // matching paints" state — it was reporting `false` while a listbox was
        // on screen.
        aria-expanded={listboxShown}
        aria-controls="paint-search-suggestions"
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `paint-suggestion-${active}` : undefined}
        className="w-full rounded-lg border border-input bg-card px-4 py-2.5 pl-10 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
      />
      <svg
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>

      {listboxShown ? (
        <PaintSuggestions
          id="paint-search-suggestions"
          optionId={(i) => `paint-suggestion-${i}`}
          suggestions={suggestions}
          activeIndex={active}
          loadError={loadError}
          onPick={pick}
          onHover={setActive}
        />
      ) : null}
    </div>
  );
}
