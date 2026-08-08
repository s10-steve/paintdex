import Link from "next/link";
import type { ReactNode } from "react";
import type { Paint } from "@/lib/paints/types";

/** Grid card linking to a paint's detail page. Usable in server or client trees. */
export function PaintCard({
  paint,
  query = "",
  action,
}: {
  paint: Paint;
  /**
   * Query string carrying the browse filters, so they follow the click. Passed in
   * rather than read from `window` here, which keeps this component usable in a
   * server tree.
   */
  query?: string;
  /**
   * An optional control overlaid on the swatch — in practice the
   * add-to-collection toggle.
   *
   * A slot rather than the control itself, for the same reason `query` is a
   * prop: the toggle is a client component, and importing it here would make
   * every server tree that renders a card (`paint-suggestions`,
   * `back-to-browse`) a client tree too. The caller injects it.
   *
   * It renders as a *sibling* of the `<Link>`, not inside it. The whole card is
   * one anchor, and a button nested in an anchor is invalid HTML with genuinely
   * unpredictable behaviour — the click target depends on the browser.
   */
  action?: ReactNode;
}) {
  return (
    <div className="relative flex">
      <Link
        href={`/paints/${paint.id}${query}`}
        className="group flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div
          className="h-24 w-full"
          style={{ backgroundColor: paint.hex }}
          aria-hidden="true"
        />
        <div className="flex flex-1 flex-col gap-1 p-3">
          <div className="flex items-start justify-between gap-2">
            <span className="line-clamp-2 text-sm font-medium leading-tight group-hover:text-primary">
              {paint.name}
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              {paint.metallic ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  metallic
                </span>
              ) : null}
              {paint.discontinued ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  disc.
                </span>
              ) : null}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {paint.brand} · {paint.range}
          </span>
          <span className="mt-auto pt-1 font-mono text-xs text-muted-foreground">
            {paint.hex}
          </span>
        </div>
      </Link>
      {action ? <div className="absolute right-1.5 top-1.5">{action}</div> : null}
    </div>
  );
}
