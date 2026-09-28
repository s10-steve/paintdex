/**
 * Core paint types shared across the app.
 *
 * The canonical, human-editable source of truth lives in `data/paints/*.json`.
 * These types describe the shape of a single record after loading.
 */
import type { ColourFamily } from "@/lib/color";

/**
 * What a paint **does**, comparably across brands — the only thing `type`
 * means. How it's delivered (`format`) and what binds it (`binder`) are
 * properties of its range, in `data/ranges.json`; a brand's own product line
 * ("Base", "Layer", "Tone Pro") is `range`; metallic is its own flag. The old
 * vocabulary mixed all four and filed 60% of the catalogue as `other` — see
 * `LEGACY_TYPES` in `filter-params.ts` for where each old value went.
 *
 * Order is the facet's display order: the everyday paints first.
 */
export const PAINT_TYPES = [
  "opaque",
  "contrast",
  "wash",
  "glaze",
  "ink",
  "primer",
  "varnish",
  "medium",
  "technical",
] as const;

export type PaintType = (typeof PAINT_TYPES)[number];

/** How a paint is delivered. `airbrush`: sold to spray straight from the bottle. */
export const PAINT_FORMATS = ["brush", "airbrush", "spray"] as const;
export type PaintFormat = (typeof PAINT_FORMATS)[number];

/** What binds it. `lacquer` includes acrylic-lacquer and alcohol-based paints. */
export const PAINT_BINDERS = ["acrylic", "enamel", "oil", "lacquer"] as const;
export type PaintBinder = (typeof PAINT_BINDERS)[number];

/** Display words for the three closed vocabularies, shared by facets and pages. */
export const VALUE_LABELS: Readonly<Record<string, string>> = {
  opaque: "Opaque",
  contrast: "Contrast / one-coat",
  wash: "Wash / shade",
  glaze: "Glaze",
  ink: "Ink",
  primer: "Primer",
  varnish: "Varnish",
  medium: "Medium",
  technical: "Texture & effect",
  brush: "Brush-on",
  airbrush: "Airbrush",
  spray: "Spray can",
  acrylic: "Acrylic",
  enamel: "Enamel",
  oil: "Oil",
  lacquer: "Lacquer",
};

/** A paint as stored in `data/paints/*.json`. */
export interface PaintRecord {
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
  /**
   * Whether the paint has a metallic finish. Independent of `type` — brands
   * classify metallics inconsistently — so it's a separate, hand-correctable
   * flag. Absent is treated as false.
   */
  metallic?: boolean;
}

/**
 * A paint as the app sees it: the stored record plus its range's `format` and
 * `binder`, resolved by `withRangeInfo` (`ranges.ts`) when it's loaded.
 */
export interface Paint extends PaintRecord {
  format: PaintFormat;
  binder: PaintBinder;
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
