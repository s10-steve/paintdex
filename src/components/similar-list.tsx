import Link from "next/link";
import { MatchBadge } from "./match-badge";
import { CollectionToggle } from "./collection/collection-toggle";

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
  return (
    <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
      {items.map((item) => (
        // The toggle is a flex sibling of the anchor, not an overlay on it.
        // Same constraint as `PaintCard` — the whole row is one link and a
        // button can't nest inside it — but the opposite answer, because there
        // is no dead space here to overlay: the card is text edge to edge, and
        // an absolutely-positioned control would sit on top of the paint name.
        //
        // It costs the name no width when signed out, which is almost every
        // visitor: `CollectionToggle` renders `null` then, and a `gap` with
        // nothing on the other side of it takes no space.
        <li key={item.id} className="flex items-center gap-2">
          <Link
            href={`/paints/${item.id}${linkQuery}`}
            className="flex h-full min-w-0 flex-1 items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              className="h-12 w-12 shrink-0 rounded-md border border-border"
              style={{ backgroundColor: item.hex }}
              aria-hidden="true"
            />
            {/* The name gets the whole width beside the swatch, with the badge
                dropped to the second row alongside `brand · range`. Sharing one
                row with the badge left names like "Xb-518 Zashchitniy Zeleno
                (russian Postwar Green)" about 12 characters a line, wrapping to
                six lines against a vertically-centred pill. */}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium [overflow-wrap:anywhere] line-clamp-2">
                {item.name}
              </span>
              <span className="mt-1 flex items-start justify-between gap-2">
                <span className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere] line-clamp-2">
                  {item.brand} · {item.range}
                </span>
                <MatchBadge distance={item.distance} />
              </span>
            </span>
          </Link>
          <CollectionToggle paintId={item.id} paintName={item.name} />
        </li>
      ))}
    </ul>
  );
}

/** Placeholder rows, sized to the list's resting height so nothing jumps. */
export function SimilarListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="h-[72px] animate-pulse rounded-lg border border-border bg-muted"
        />
      ))}
    </ul>
  );
}
