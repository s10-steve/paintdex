"use client";

import Link from "next/link";
import { MatchBadge } from "./match-badge";
import { CollectionToggle } from "./collection/collection-toggle";
import { useCollection } from "./collection/collection-provider";

/** The minimal shape the list renders from (shared by precomputed + recomputed). */
export interface RenderItem {
  id: string;
  hex: string;
  name: string;
  brand: string;
  range: string;
  distance: number;
}

/**
 * The ΔE-ranked list of alternatives — the default view on a paint page.
 *
 * Two columns only from `lg` up. The page container is `max-w-4xl` and the facet
 * sidebar takes 224px of it, so `sm:grid-cols-2` left each card about 300px and
 * the name about 140px — roughly 17 characters. Paint names run to 22 at p90 and
 * 37 at p99 ("Dunkelgelb Ausgabe 44 – Dark Yellow RAL 7028 Ver. '44"), and a
 * brand · range like "Army Painter · D&D Nolzur's Marvelous Pigments Primer" is
 * 53, so both lines truncated on well over a quarter of the catalogue. One
 * full-width card fits ~50 characters and the two-line clamp absorbs the tail.
 */
export function SimilarList({
  items,
  linkQuery,
}: {
  items: RenderItem[];
  /**
   * Query string carrying the panel's filters, so they survive the click. Built
   * by `similarLinkQuery`; `""` when nothing is filtered.
   */
  linkQuery: string;
}) {
  // Only for the name's padding, below. The toggle hides itself independently.
  const { enabled } = useCollection();

  return (
    <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
      {items.map((item) => (
        // The toggle overlays the card rather than sitting beside it. As a flex
        // sibling it took its ~64px, plus the gap, out of the card's own width
        // — enough to wrap "Blood For The Blood God" onto two lines and truncate
        // its brand to "Cit…". Overlaying puts it inside the card's bounds, so
        // only the name pays, and only by its own padding. It's a sibling of the
        // anchor rather than inside it for `PaintCard`'s reason: the whole card
        // is one link, and a button can't nest in it.
        //
        // **The positioning context is the inner `<div>`, never the `<li>`.**
        // `position: relative` on the list item is what broke this in Safari:
        // WebKit didn't treat it as the containing block, so every toggle fell
        // back to its static position — bottom-left, after the anchor — and each
        // card painted over the one above it, leaving exactly one visible per
        // column. Chromium renders the `<li>` version correctly, which is why
        // checking it there proved nothing.
        //
        // `PaintCard` has always wrapped this same overlay in a plain `relative`
        // div and has never had the problem. Keep the two the same shape.
        //
        // Heights stretch through flex rather than `h-full` for the neighbouring
        // reason: no percentage resolved against a track sized by its own
        // content. The floor sits on the `<li>`, in step with
        // `SimilarListSkeleton`.
        <li key={item.id} className="flex min-h-[76px]">
          <div className="relative flex flex-1">
            <Link
              href={`/paints/${item.id}${linkQuery}`}
              className="flex flex-1 items-stretch gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className="h-12 w-12 shrink-0 rounded-md border border-border"
                style={{ backgroundColor: item.hex }}
                aria-hidden="true"
              />
              {/* The name gets the whole width beside the swatch, with the badge
                dropped to the bottom row alongside `brand · range`. Sharing one
                row with the badge left names like "Xb-518 Zashchitniy Zeleno
                (russian Postwar Green)" about 12 characters a line, wrapping to
                six lines against a vertically-centred pill. */}
              <span className="flex min-w-0 flex-1 flex-col">
                {/* Only the name clears the toggle horizontally: the buttons sit
                  roughly 8–40px down inside a `p-3` card, over the clamp's two
                  lines. The `brand · range` row keeps its full width, which is
                  the line that was truncating to "Cit…". */}
                <span
                  className={`block text-sm font-medium [overflow-wrap:anywhere] line-clamp-2 ${
                    enabled ? "pr-16" : ""
                  }`}
                >
                  {item.name}
                </span>
                {/* `mt-auto` pins this to the bottom rather than letting it sit
                  straight under the name. A one-line name ("Pale Tan") otherwise
                  pulled the row up to ~36px, where the badge caught the bottom
                  of the buttons; pinned, it starts below them at every name
                  length.

                  The `min-h-[76px]` on the `<li>` is what makes that true
                  rather than merely usual — it's what puts this row's top at
                  ~44px against buttons ending at 40. At the old 72px resting
                  height the two met exactly, with no clearance at all. */}
                <span className="mt-auto flex items-end justify-between gap-2 pt-1">
                  <span className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere] line-clamp-2">
                    {item.brand} · {item.range}
                  </span>
                  <MatchBadge distance={item.distance} />
                </span>
              </span>
            </Link>
            {/* `z-10` so paint order between adjacent positioned siblings can
                never hide it, which is the shape the Safari failure took. */}
            <div className="absolute right-2 top-2 z-10">
              <CollectionToggle paintId={item.id} paintName={item.name} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Placeholder rows, sized to the list's resting height so nothing jumps.
 *
 * Keep this in step with the card's `min-h-[76px]` above — that height is load
 * bearing there (it's what keeps the match badge clear of the collection
 * buttons), so it's the one that moves first and this one that follows.
 */
export function SimilarListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="h-[76px] animate-pulse rounded-lg border border-border bg-muted"
        />
      ))}
    </ul>
  );
}
