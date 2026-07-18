import Link from "next/link";
import type { Paint } from "@/lib/paints/types";

/** Grid card linking to a paint's detail page. Usable in server or client trees. */
export function PaintCard({ paint }: { paint: Paint }) {
  return (
    <Link
      href={`/paints/${paint.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  );
}
