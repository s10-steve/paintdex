"use client";

import { useState } from "react";

export interface FacetOption {
  value: string;
  label: string;
  /** Greyed out and non-interactive — no results with the current selection. */
  disabled?: boolean;
}

interface FacetGroupProps {
  title: string;
  options: FacetOption[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  /** Collapse the list behind a scroll area beyond this many options. */
  scrollAfter?: number;
  defaultOpen?: boolean;
}

/** A collapsible group of checkbox filters for one facet. */
export function FacetGroup({
  title,
  options,
  selected,
  onToggle,
  scrollAfter = 8,
  defaultOpen = true,
}: FacetGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (options.length === 0) return null;
  const scroll = options.length > scrollAfter;
  const activeCount = options.filter((o) => selected.has(o.value)).length;

  return (
    <div className="border-b border-border py-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-sm font-semibold"
        aria-expanded={open}
      >
        <span>
          {title}
          {activeCount > 0 ? (
            <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
              {activeCount}
            </span>
          ) : null}
        </span>
        <span className="text-muted-foreground">{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <ul
          className={`mt-2 space-y-1 ${scroll ? "max-h-56 overflow-y-auto pr-1" : ""}`}
        >
          {options.map((o) => (
            <li key={o.value}>
              <label
                className={`flex items-center gap-2 rounded px-1 py-0.5 text-sm ${
                  o.disabled
                    ? "cursor-not-allowed text-muted-foreground/50"
                    : "cursor-pointer hover:bg-muted"
                }`}
              >
                <input
                  type="checkbox"
                  className="accent-[var(--primary)]"
                  checked={selected.has(o.value)}
                  disabled={o.disabled}
                  onChange={() => onToggle(o.value)}
                />
                <span className="capitalize">{o.label}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
