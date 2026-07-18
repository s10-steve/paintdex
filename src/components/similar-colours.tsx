"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { hexToLab } from "@/lib/color";
import { findSimilar } from "@/lib/paints/filter";
import type {
  BrowsePaint,
  Paint,
  PaintType,
  PaintWithLab,
} from "@/lib/paints/types";
import { MatchBadge } from "./match-badge";

export interface SimilarItem {
  paint: Paint;
  distance: number;
}

interface SimilarColoursProps {
  /** The paint these matches are for (used to re-rank when filtering). */
  target: Paint;
  /** Closest matches across all brands (precomputed, unfiltered default view). */
  all: SimilarItem[];
  /** Closest matches excluding the target's own brand (precomputed). */
  crossBrand: SimilarItem[];
  /** Brands available to filter by (whole catalogue). */
  brands: string[];
  /** Paint types present in the catalogue. */
  types: PaintType[];
}

/** The dataset the browse page already ships; reused here to re-rank on filter. */
const BROWSE_INDEX_URL = "/browse-index.json";

/** "Other brands only" — a sentinel brand value distinct from any real brand. */
const CROSS = "__cross__";

/** Minimal shape the list renders from (shared by precomputed + recomputed). */
type RenderItem = {
  id: string;
  hex: string;
  name: string;
  brand: string;
  range: string;
  distance: number;
};

const toRenderItems = (items: SimilarItem[]): RenderItem[] =>
  items.map(({ paint, distance }) => ({
    id: paint.id,
    hex: paint.hex,
    name: paint.name,
    brand: paint.brand,
    range: paint.range,
    distance,
  }));

export function SimilarColours({
  target,
  all,
  crossBrand,
  brands,
  types,
}: SimilarColoursProps) {
  // Filter state. brand === "" means all; CROSS means other-brands-only.
  const [brand, setBrand] = useState("");
  const [type, setType] = useState<"" | PaintType>("");
  const [finish, setFinish] = useState<"" | "only" | "exclude">("");

  const specificBrand = brand !== "" && brand !== CROSS;
  // The precomputed lists cover the two no-filter cases (all / cross-brand)
  // instantly. Anything narrower has to re-rank the whole catalogue, because the
  // precomputed lists only hold each paint's top matches — filtering those would
  // usually come back empty.
  const needsCompute = specificBrand || type !== "" || finish !== "";

  // The full catalogue (with Lab), fetched lazily the first time a filter that
  // needs re-ranking is applied, then reused.
  const [dataset, setDataset] = useState<PaintWithLab[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const fetchStarted = useRef(false);

  useEffect(() => {
    if (!needsCompute || fetchStarted.current) return;
    fetchStarted.current = true;
    setLoading(true);
    fetch(BROWSE_INDEX_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<BrowsePaint[]>;
      })
      .then((data) => {
        // Recover the Lab triple (kept out of the shipped index) from hex.
        setDataset(data.map((p) => ({ ...p, lab: hexToLab(p.hex) })));
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [needsCompute]);

  const computed = useMemo<RenderItem[] | null>(() => {
    if (!needsCompute || !dataset) return null;
    const candidates = dataset.filter((p) => {
      if (specificBrand && p.brand !== brand) return false;
      if (type && p.type !== type) return false;
      if (finish === "only" && !p.metallic) return false;
      if (finish === "exclude" && p.metallic) return false;
      return true;
    });
    const targetWithLab: PaintWithLab = {
      ...target,
      lab: hexToLab(target.hex),
      // family isn't needed by findSimilar; a placeholder keeps the type honest.
      family: "neutral",
    };
    return findSimilar(candidates, targetWithLab, {
      limit: 16,
      excludeSameBrand: brand === CROSS,
    }).map(({ paint, distance }) => ({
      id: paint.id,
      hex: paint.hex,
      name: paint.name,
      brand: paint.brand,
      range: paint.range,
      distance,
    }));
  }, [needsCompute, dataset, specificBrand, brand, type, finish, target]);

  const items: RenderItem[] = needsCompute
    ? (computed ?? [])
    : toRenderItems(brand === CROSS ? crossBrand : all);

  const filtersActive = brand !== "" || type !== "" || finish !== "";
  const clearFilters = () => {
    setBrand("");
    setType("");
    setFinish("");
  };

  const selectClass =
    "rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <section aria-labelledby="similar-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="similar-heading" className="text-lg font-semibold">
          Similar colours
        </h2>
        {filtersActive ? (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-primary hover:underline"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <p className="mb-3 text-sm text-muted-foreground">
        Ranked by perceptual colour distance (CIEDE2000). Lower ΔE = closer match.
      </p>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="similar-brand">
          Filter by brand
        </label>
        <select
          id="similar-brand"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className={selectClass}
        >
          <option value="">All brands</option>
          <option value={CROSS}>Other brands only</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="similar-type">
          Filter by type
        </label>
        <select
          id="similar-type"
          value={type}
          onChange={(e) => setType(e.target.value as "" | PaintType)}
          className={`${selectClass} capitalize`}
        >
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="similar-finish">
          Filter by finish
        </label>
        <select
          id="similar-finish"
          value={finish}
          onChange={(e) =>
            setFinish(e.target.value as "" | "only" | "exclude")
          }
          className={selectClass}
        >
          <option value="">Any finish</option>
          <option value="only">Metallic</option>
          <option value="exclude">Non-metallic</option>
        </select>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Couldn’t load the paint database to filter. Try refreshing the page.
        </div>
      ) : needsCompute && (loading || !dataset) ? (
        <ul
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          aria-hidden="true"
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <li
              key={i}
              className="h-[60px] animate-pulse rounded-lg border border-border bg-muted"
            />
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No similar colours match these filters. Try widening them.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/paints/${item.id}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className="h-10 w-10 shrink-0 rounded-md border border-border"
                  style={{ backgroundColor: item.hex }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {item.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.brand} · {item.range}
                  </span>
                </span>
                <MatchBadge distance={item.distance} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
