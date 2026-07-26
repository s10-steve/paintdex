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
 * Split a search box's contents into lowercased words. Every token has to match
 * for a paint to qualify, which is what lets a half-remembered product name find
 * its paint: "panel line dark brown" reaches "Panel Line Accent Color: Dark
 * Brown", where a single contiguous substring test would not.
 */
export function searchTokens(search?: string): string[] {
  const q = search?.trim().toLowerCase();
  if (!q) return [];
  return q.split(/\s+/);
}

/**
 * How well a paint answers the query, for ordering matches. Higher is better;
 * the weights only have to be self-consistent, so the tests assert the resulting
 * order rather than the numbers.
 */
function scoreMatch(paint: BrowsePaint, tokens: string[], query: string): number {
  const name = paint.name.toLowerCase();
  let score = 0;

  // The whole query typed out as it appears in the name is the strongest signal,
  // and keeps the pre-token behaviour ("mephiston red" → Mephiston Red) on top.
  if (name.includes(query)) score += 20;
  if (name.startsWith(query)) score += 10;
  else if (name.startsWith(tokens[0])) score += 5;

  for (const t of tokens) {
    const at = name.indexOf(t);
    if (at === -1) continue; // matched via brand/range/code only
    score += 2;
    // A word-boundary hit ("brown" in "Dark Brown") beats one buried mid-word
    // ("brown" in "Brownish").
    if (at === 0 || !/[a-z0-9]/.test(name[at - 1])) score += 1;
  }

  return score;
}

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
  const query = filters.search?.trim().toLowerCase() ?? "";
  const tokens = searchTokens(filters.search);
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
    if (tokens.length) {
      const hay = `${p.name} ${p.brand} ${p.range} ${p.code ?? ""}`.toLowerCase();
      // indexOf per token, not a regex per paint — this runs over the whole
      // catalogue on every keystroke.
      for (const t of tokens) if (hay.indexOf(t) === -1) return false;
    }
    return true;
  });

  // Relevance only displaces the default (name) order: someone who explicitly
  // picked Brand or Lightness in the browse sort still gets it.
  const scores =
    tokens.length && sort === "name"
      ? new Map(result.map((p) => [p.id, scoreMatch(p, tokens, query)]))
      : null;

  result.sort((a, b) => {
    switch (sort) {
      case "brand":
        return a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name);
      case "lightness":
        return a.l - b.l || a.name.localeCompare(b.name);
      default:
        if (scores) {
          const d = scores.get(b.id)! - scores.get(a.id)!;
          if (d) return d;
        }
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
