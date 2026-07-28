"use client";

import { useId } from "react";
import type { FacetOption } from "@/lib/paints/facet-availability";
import type { MetallicFilter, SharedFacets } from "@/lib/paints/filter-params";
import { FacetGroup } from "./facet-group";

export interface PaintFacetsProps {
  options: {
    brands: FacetOption[];
    ranges: FacetOption[];
    types: FacetOption[];
    families: FacetOption[];
  };
  selected: SharedFacets & { families: Set<string> };
  onToggle: (
    key: "brands" | "ranges" | "types" | "families",
    value: string,
  ) => void;
  onMetallic: (value: MetallicFilter) => void;
  onDiscontinued: (value: boolean) => void;
  /**
   * Groups to hide. Omitted keys default to shown.
   *
   * Stated explicitly rather than inferred from an empty option list: `FacetGroup`
   * renders nothing for zero options, so relying on that would make "this page has
   * no such control" indistinguishable from "the catalogue hasn't loaded yet".
   */
  show?: { family?: boolean; discontinued?: boolean };
}

/**
 * The filter facets shared by the browse grid and a paint page's alternatives
 * panel: the controls that answer *which paints do you want*.
 *
 * One component so the two sidebars can't drift again — they previously disagreed
 * on the heading, on the wording of the metallic option, and on which groups
 * existed at all. Purely presentational: no URL, no `window`, no availability
 * maths. Each page keeps its own heading, Clear-all button, active count and
 * page-specific controls (browse's search and sort; the panel's Minimum match and
 * List/Plot toggle) outside this block.
 */
export function PaintFacets({
  options,
  selected,
  onToggle,
  onMetallic,
  onDiscontinued,
  show,
}: PaintFacetsProps) {
  // Both sidebars are in the DOM at once — the desktop copy is `hidden md:block`,
  // not unmounted — so a hardcoded radio `name` made the two copies a single
  // group, and clicking in the drawer moved the hidden one instead. Same reason
  // the "Minimum match" select needs a generated id.
  const finishName = useId();

  const showFamily = show?.family !== false;
  const showDiscontinued = show?.discontinued !== false;

  return (
    <>
      <FacetGroup
        title="Brand"
        options={options.brands}
        selected={selected.brands}
        onToggle={(v) => onToggle("brands", v)}
      />
      {showFamily ? (
        <FacetGroup
          title="Colour family"
          options={options.families}
          selected={selected.families}
          onToggle={(v) => onToggle("families", v)}
        />
      ) : null}
      <FacetGroup
        title="Type"
        options={options.types}
        selected={selected.types}
        onToggle={(v) => onToggle("types", v)}
      />
      <div className="border-b border-border py-3">
        <span className="text-sm font-semibold">Finish</span>
        <div className="mt-2 flex flex-col gap-1">
          {(
            [
              { value: "", label: "All" },
              { value: "only", label: "Metallic only" },
              { value: "exclude", label: "Non-metallic" },
            ] as const
          ).map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted"
            >
              <input
                type="radio"
                name={finishName}
                className="accent-[var(--primary)]"
                checked={selected.metallic === o.value}
                onChange={() => onMetallic(o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>
      </div>
      <FacetGroup
        title="Range"
        options={options.ranges}
        selected={selected.ranges}
        onToggle={(v) => onToggle("ranges", v)}
        defaultOpen={false}
      />
      {showDiscontinued ? (
        <label className="flex cursor-pointer items-center gap-2 py-3 text-sm">
          <input
            type="checkbox"
            className="accent-[var(--primary)]"
            checked={selected.includeDiscontinued}
            onChange={() => onDiscontinued(!selected.includeDiscontinued)}
          />
          Include discontinued
        </label>
      ) : null}
    </>
  );
}
