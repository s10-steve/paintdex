"use client";

import { useState } from "react";
import Link from "next/link";
import type { Paint } from "@/lib/paints/types";
import { MatchBadge } from "./match-badge";

export interface SimilarItem {
  paint: Paint;
  distance: number;
}

interface SimilarColoursProps {
  /** Closest matches across all brands. */
  all: SimilarItem[];
  /** Closest matches excluding the target's own brand. */
  crossBrand: SimilarItem[];
}

export function SimilarColours({ all, crossBrand }: SimilarColoursProps) {
  const [excludeSameBrand, setExcludeSameBrand] = useState(false);
  const items = excludeSameBrand ? crossBrand : all;

  return (
    <section aria-labelledby="similar-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="similar-heading" className="text-lg font-semibold">
          Similar colours
        </h2>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="accent-[var(--primary)]"
            checked={excludeSameBrand}
            onChange={(e) => setExcludeSameBrand(e.target.checked)}
          />
          Other brands only
        </label>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Ranked by perceptual colour distance (CIEDE2000). Lower ΔE = closer match.
      </p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map(({ paint, distance }) => (
          <li key={paint.id}>
            <Link
              href={`/paints/${paint.id}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className="h-10 w-10 shrink-0 rounded-md border border-border"
                style={{ backgroundColor: paint.hex }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {paint.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {paint.brand} · {paint.range}
                </span>
              </span>
              <MatchBadge distance={distance} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
