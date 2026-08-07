"use client";

import { useMemo, useState } from "react";
import { filterPaints } from "@/lib/paints/filter";
import type { BrowsePaint } from "@/lib/paints/types";
import type { SchemePaint, SchemeRole } from "@/lib/scheme/types";

/**
 * The per-element "add a paint" form: a search box over the browse index with
 * keyboard navigation, plus a custom-colour entry for paints not in the
 * database. Added paints inherit `defaultRole` from the element's current stack.
 *
 * `LayerRow` reuses this nested inside a paint row to add a mix component, via
 * `compact`; that caller keeps the four colour fields and discards the `role`,
 * which a mix component has no use for.
 */
export function AddPaint({
  dbPaints,
  loadError,
  defaultRole: role,
  onAdd,
  compact = false,
  placeholder,
  autoFocus = false,
}: {
  dbPaints: BrowsePaint[] | null;
  loadError: boolean;
  defaultRole: SchemeRole;
  onAdd: (p: Omit<SchemePaint, "id">) => void;
  /** Row-sized padding and type, for the nested mix picker. */
  compact?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customHex, setCustomHex] = useState("#6d4aa8");

  const loading = dbPaints === null;
  const results = useMemo(() => {
    const q = query.trim();
    if (q.length < 2 || !dbPaints) return [];
    return filterPaints(dbPaints, { search: q }).slice(0, 60);
  }, [query, dbPaints]);

  const pick = (p: BrowsePaint) => {
    onAdd({ name: p.name, brand: p.brand, range: p.range, hex: p.hex, role });
    setQuery("");
    setOpen(false);
    setActive(-1);
  };

  const addCustom = () => {
    onAdd({
      name: customName.trim() || "Custom colour",
      brand: "custom",
      range: "custom",
      hex: customHex.toUpperCase(),
      role,
      custom: true,
    });
    setCustomName("");
    setShowCustom(false);
  };

  return (
    <div className={`relative ${compact ? "px-0 py-1" : "px-2.5 pb-3 pt-1.5"}`}>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (!results.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              pick(results[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={
            loading
              ? "Loading paint database…"
              : (placeholder ?? "Add a paint — search across 11 brands…")
          }
          aria-label={compact ? "Search paints to mix in" : "Search paints to add"}
          autoFocus={autoFocus}
          className={`min-w-0 flex-1 rounded-lg border border-input bg-background outline-none focus:border-primary focus:ring-2 focus:ring-accent ${
            compact ? "px-2 py-1 text-[12.5px]" : "px-3 py-2 text-base sm:text-[13px]"
          }`}
        />
        <button
          onClick={() => setShowCustom((v) => !v)}
          title="Add a colour that isn't in the database"
          className="flex-none whitespace-nowrap px-0.5 py-1 text-[12.5px] font-semibold text-accent-foreground hover:underline"
        >
          + Custom
        </button>
      </div>

      {open && query.trim().length >= 2 && (
        <div
          className={`absolute ${compact ? "inset-x-0 top-full" : "inset-x-2.5 top-[calc(100%-6px)]"} z-20 max-h-72 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-xl`}
        >
          {results.length === 0 ? (
            <div className="p-3 text-center text-[12.5px] text-muted-foreground">
              {loadError
                ? "Paint database unavailable. Use + Custom to add it by hand."
                : "No match. Use + Custom to add it by hand."}
            </div>
          ) : (
            results.map((p, i) => (
              <button
                key={p.id}
                // onMouseDown (not onClick) so it fires before the input's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left ${i === active ? "bg-accent" : "hover:bg-accent"}`}
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
              </button>
            ))
          )}
        </div>
      )}

      {showCustom && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-input bg-muted p-2.5">
          <input
            type="color"
            value={customHex}
            onChange={(e) => setCustomHex(e.target.value)}
            aria-label="Pick custom colour"
            className="sv-swatch-input h-[34px] w-[34px] flex-none rounded-lg border border-input bg-card"
          />
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustom()}
            placeholder="Colour name (e.g. AK Black Purple)"
            className="min-w-0 flex-1 rounded-md border border-input bg-card px-2.5 py-1.5 text-[13px] outline-none focus:border-primary"
          />
          <button
            onClick={addCustom}
            className="flex-none rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:opacity-90"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
