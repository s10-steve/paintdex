import { ciede2000 } from "@/lib/color";
import type { BrowsePaint, PaintType, PaintWithLab } from "./types";

export interface PaintFilters {
  search?: string;
  brands?: string[];
  ranges?: string[];
  types?: PaintType[];
  families?: string[];
  /** Discontinued paints are hidden unless this is true. */
  includeDiscontinued?: boolean;
  /** Restrict by metallic finish: `only` metallics, or `exclude` them. */
  metallic?: "only" | "exclude";
}

export type SortKey = "name" | "brand" | "lightness";

/**
 * Filter + sort paints. Facets combine with AND across categories and OR within
 * a category (e.g. brand=Citadel OR Vallejo) AND (type=base OR layer).
 * Pure and synchronous — safe to run on every keystroke over the full dataset.
 */
export function filterPaints(
  paints: BrowsePaint[],
  filters: PaintFilters,
  sort: SortKey = "name",
): BrowsePaint[] {
  const q = filters.search?.trim().toLowerCase();
  const brands = new Set(filters.brands ?? []);
  const ranges = new Set(filters.ranges ?? []);
  const types = new Set(filters.types ?? []);
  const families = new Set(filters.families ?? []);

  const result = paints.filter((p) => {
    if (!filters.includeDiscontinued && p.discontinued) return false;
    if (filters.metallic === "only" && !p.metallic) return false;
    if (filters.metallic === "exclude" && p.metallic) return false;
    if (brands.size && !brands.has(p.brand)) return false;
    if (ranges.size && !ranges.has(p.range)) return false;
    if (types.size && !types.has(p.type)) return false;
    if (families.size && !families.has(p.family)) return false;
    if (q) {
      const hay = `${p.name} ${p.brand} ${p.range} ${p.code ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  result.sort((a, b) => {
    switch (sort) {
      case "brand":
        return a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name);
      case "lightness":
        return a.l - b.l || a.name.localeCompare(b.name);
      default:
        return a.name.localeCompare(b.name);
    }
  });

  return result;
}

export interface SimilarPaint {
  paint: PaintWithLab;
  /** CIEDE2000 distance from the target (0 = identical). */
  distance: number;
}

export interface SimilarOptions {
  limit?: number;
  excludeSameBrand?: boolean;
  /** Exclude discontinued paints from suggestions (default true). */
  excludeDiscontinued?: boolean;
}

/**
 * Rank all paints by perceptual (CIEDE2000) closeness to a target paint.
 * The target itself is always excluded.
 */
export function findSimilar(
  paints: PaintWithLab[],
  target: PaintWithLab,
  { limit = 12, excludeSameBrand = false, excludeDiscontinued = true }: SimilarOptions = {},
): SimilarPaint[] {
  const scored: SimilarPaint[] = [];
  for (const p of paints) {
    if (p.id === target.id) continue;
    if (excludeSameBrand && p.brand === target.brand) continue;
    if (excludeDiscontinued && p.discontinued) continue;
    scored.push({ paint: p, distance: ciede2000(target.lab, p.lab) });
  }
  scored.sort((a, b) => a.distance - b.distance);
  return scored.slice(0, limit);
}

/**
 * Human-friendly label for a CIEDE2000 distance, for a "how close" badge.
 */
export function matchLabel(distance: number): string {
  if (distance < 1) return "Identical";
  if (distance < 2) return "Near-perfect";
  if (distance < 5) return "Very close";
  if (distance < 10) return "Close";
  if (distance < 20) return "Similar";
  return "Loose";
}
