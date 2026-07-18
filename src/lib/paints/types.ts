/**
 * Core paint types shared across the app.
 *
 * The canonical, human-editable source of truth lives in `data/paints/*.json`.
 * These types describe the shape of a single record after loading.
 */
import type { ColourFamily } from "@/lib/color";

/** Normalized paint finish/type. `range` keeps the brand's own product-line label. */
export const PAINT_TYPES = [
  "base",
  "layer",
  "shade",
  "contrast",
  "technical",
  "metallic",
  "air",
  "primer",
  "spray",
  "ink",
  "wash",
  "glaze",
  "dry",
  "other",
] as const;

export type PaintType = (typeof PAINT_TYPES)[number];

/** A paint as stored in `data/paints/*.json`. */
export interface Paint {
  /** Stable slug id: `<brand-slug>-<name-slug>` (optionally range-disambiguated). */
  id: string;
  name: string;
  brand: string;
  /** Primary product line this paint belongs to (brand's own label). */
  range: string;
  /** All product lines the paint appears in, when more than one. */
  ranges?: string[];
  /** Normalized finish. */
  type: PaintType;
  /** Uppercase hex string, e.g. "#231F20". */
  hex: string;
  /** Manufacturer product code, when known. */
  code?: string | null;
  discontinued: boolean;
}

/** A paint enriched with precomputed CIE-Lab for fast similarity math. */
export interface PaintWithLab extends Paint {
  lab: readonly [number, number, number];
  /** Coarse colour family used for the colour-family filter facet. */
  family: ColourFamily;
}

/**
 * A paint as shipped in the browse index (`public/browse-index.json`): the
 * source fields plus the precomputed facets the browser actually needs — the
 * colour family (filter) and lightness (sort). Deliberately omits the full Lab
 * triple to keep the fetched payload small; similarity maths uses PaintWithLab.
 */
export interface BrowsePaint extends Paint {
  family: ColourFamily;
  /** Precomputed CIE L* lightness, for the lightness sort. */
  l: number;
}
