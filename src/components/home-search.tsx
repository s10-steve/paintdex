"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { filterPaints } from "@/lib/paints/filter";
import { useBrowseIndex } from "@/hooks/use-browse-index";
import type { BrowsePaint } from "@/lib/paints/types";

/**
 * Homepage search box. Mirrors the live autocomplete dropdown in
 * `paints-browser.tsx` (type → suggestions → keyboard nav → jump to a paint),
 * trimmed down since there's no grid here to debounce filters into. The
 * underlying `<form>` still submits to `/paints?q=...` natively, so pressing
 * Enter with nothing highlighted (or clicking "Search") keeps working exactly
 * as before.
 */
export function HomeSearch() {
  const router = useRouter();

  const { paints, loadError } = useBrowseIndex();

  const [query, setQuery] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);

  const suggestions = useMemo(() => {
    const term = query.trim();
    if (term.length < 2 || !paints) return [];
    return filterPaints(paints, { search: term }).slice(0, 8);
  }, [query, paints]);
  const suggestVisible = suggestOpen && query.trim().length >= 2;

  const gotoPaint = (p: BrowsePaint) => {
    setSuggestOpen(false);
    setActiveSuggestion(-1);
    router.push(`/paints/${p.id}`);
  };

  return (
    <form
      action="/paints"
      method="get"
      className="mx-auto mt-8 flex max-w-xl gap-2"
    >
      <div className="relative flex-1">
        <input
          type="search"
          name="q"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSuggestOpen(true);
            setActiveSuggestion(-1);
          }}
          onFocus={() => setSuggestOpen(true)}
          // Delay the close so a click (mousedown) on a suggestion registers first.
          onBlur={() => setTimeout(() => setSuggestOpen(false), 120)}
          onKeyDown={(e) => {
            if (!suggestVisible || !suggestions.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveSuggestion((a) => Math.min(a + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveSuggestion((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && activeSuggestion >= 0) {
              // Enter with a highlighted suggestion jumps to that paint; Enter
              // with none highlighted falls through to the native form submit.
              e.preventDefault();
              gotoPaint(suggestions[activeSuggestion]);
            } else if (e.key === "Escape") {
              setSuggestOpen(false);
              setActiveSuggestion(-1);
            }
          }}
          placeholder="Search paints — e.g. Mephiston Red, black, teal…"
          aria-label="Search paints"
          role="combobox"
          aria-expanded={Boolean(suggestVisible && (paints?.length || loadError))}
          aria-controls="home-search-suggestions"
          aria-autocomplete="list"
          aria-activedescendant={
            activeSuggestion >= 0 ? `home-suggestion-${activeSuggestion}` : undefined
          }
          className="w-full rounded-lg border border-input bg-card px-4 py-3 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
        />

        {suggestVisible && (paints?.length || loadError) ? (
          <ul
            id="home-search-suggestions"
            role="listbox"
            className="absolute inset-x-0 top-[calc(100%+4px)] z-30 max-h-72 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-xl"
          >
            {suggestions.length === 0 ? (
              <li
                role="presentation"
                className="p-3 text-center text-[12.5px] text-muted-foreground"
              >
                {loadError ? "Paint database unavailable." : "No matching paints."}
              </li>
            ) : (
              suggestions.map((p, i) => (
                // `id` and `role="option"` on one element, and no focusable
                // descendant inside it — see the same fix in `paints-browser`.
                <li
                  key={p.id}
                  id={`home-suggestion-${i}`}
                  role="option"
                  aria-selected={i === activeSuggestion}
                  // onMouseDown (not onClick) so it fires before the input's blur closes the list.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    gotoPaint(p);
                  }}
                  onMouseEnter={() => setActiveSuggestion(i)}
                  className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left ${
                    i === activeSuggestion ? "bg-muted" : "hover:bg-muted"
                  }`}
                >
                    <span
                      className="h-[22px] w-[22px] flex-none rounded-md ring-1 ring-inset ring-black/15"
                      style={{ background: p.hex }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">
                        {p.name}
                      </span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">
                        {p.brand} · {p.range}
                      </span>
                    </span>
                    <span className="ml-auto flex-none font-mono text-[11px] text-muted-foreground">
                      {p.hex}
                    </span>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
      <button
        type="submit"
        className="rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Search
      </button>
    </form>
  );
}
