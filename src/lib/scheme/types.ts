/**
 * Types for the paint scheme visualiser.
 *
 * A *scheme* is a miniature's paint plan: a list of *elements* (armour, robes,
 * lenses…), each a stack of *paints* applied in order. Every paint carries a
 * `role` that decides how it reads in the visualisation — solid roles
 * (base/layer/highlight) build a tonal ramp; overlay roles (wash/glaze/
 * weathering) sit over it as translucent passes.
 *
 * Everything here is plain data (no React/DOM) so the bar maths in `./bars`
 * stays pure and node-testable.
 */

/** How a paint reads in the bar. */
export type SchemeRole =
  | "base"
  | "layer"
  | "highlight"
  | "drybrush"
  | "wash"
  | "glaze"
  | "weathering";

export interface RoleMeta {
  label: string;
  /** Solid roles form the tonal ramp; non-solid roles render as overlays. */
  solid: boolean;
  /** Default share of the bar (solids) / overlay thickness factor (overlays). */
  weight: number;
  /** CSS custom property driving the role's accent colour. */
  cssVar: string;
  /** Overlay opacity (overlay roles only). */
  opacity?: number;
  /**
   * How an overlay composites over the ramp (overlay roles only).
   *
   * `multiply` models a translucent ink — the base tints the result, which is
   * what a wash or glaze actually does. `normal` models an opaque pigment
   * sitting *on* the surface, so the paint keeps its own colour; multiplying a
   * mint oxide over brass would read as brown-green rather than as the paint.
   */
  blendMode?: "multiply" | "normal";
}

export const ROLES: Record<SchemeRole, RoleMeta> = {
  base: { label: "Base", solid: true, weight: 1.4, cssVar: "var(--role-base)" },
  layer: { label: "Layer", solid: true, weight: 1.0, cssVar: "var(--role-layer)" },
  highlight: { label: "Highlight", solid: true, weight: 0.55, cssVar: "var(--role-highlight)" },
  // Drybrushing reads as a highlight pass — same ramp behaviour and share of the
  // bar, kept as its own role so a recipe can say which technique was used.
  drybrush: { label: "Drybrush", solid: true, weight: 0.55, cssVar: "var(--role-drybrush)" },
  // Washes and glazes are translucent inks: the colour beneath tints the result,
  // which is what `multiply` models.
  wash: { label: "Wash", solid: false, weight: 1.0, cssVar: "var(--role-wash)", opacity: 0.62, blendMode: "multiply" },
  glaze: { label: "Glaze", solid: false, weight: 1.0, cssVar: "var(--role-glaze)", opacity: 0.48, blendMode: "multiply" },
  // Weathering effects (rust streaks, verdigris, copper patina) are opaque
  // pigments sitting on the surface rather than inks tinted by it, so they
  // composite normally and keep their own colour — multiplying something like
  // Nihilakh Oxide over brass reads as brown-green instead of as the paint.
  weathering: { label: "Weathering", solid: false, weight: 1.0, cssVar: "var(--role-weathering)", opacity: 0.8, blendMode: "normal" },
};

/** Role keys in display order (drives the role `<select>`). */
export const ROLE_KEYS = Object.keys(ROLES) as SchemeRole[];

/** A single paint in a scheme, applied in list order (base first). */
export interface SchemePaint {
  /** Stable client id for React keys / reordering. */
  id: string;
  name: string;
  /** Brand, or "custom" for a hand-entered colour. */
  brand: string;
  /** Product range, or "custom". */
  range: string;
  /** Uppercase hex, e.g. "#ABA390". */
  hex: string;
  role: SchemeRole;
  /** True when entered by hand rather than picked from the database. */
  custom?: boolean;
  /** Explicit weight override; falls back to the role default when unset. */
  weight?: number;
}

export interface SchemeElement {
  id: string;
  name: string;
  paints: SchemePaint[];
}

export interface Scheme {
  title: string;
  elements: SchemeElement[];
}

/**
 * Longest scheme title we'll store.
 *
 * Must match the `schemes_title_length` check in `supabase/schema.sql` — the
 * database is the one that has to hold the line (the browser writes rows
 * directly), and this is what stops a legitimate user hitting that constraint
 * as an opaque sync error.
 */
export const MAX_SCHEME_TITLE = 200;

/** A blank scheme — the starting point for the visualiser and the Reset target. */
export const emptyScheme = (): Scheme => ({ title: "", elements: [] });

export const roleOf = (p: SchemePaint): RoleMeta => ROLES[p.role] ?? ROLES.layer;
/**
 * The weight a paint contributes to its bar's ramp.
 *
 * `Number.isFinite` rather than `typeof === "number"`: this is the single read
 * point for the override, and an `Infinity` reaching `barModel` turns every
 * ramp stop into `NaN%`. `io.ts` already rejects those on the way in — this is
 * the second line, for any scheme that reaches a renderer another way.
 */
export const weightOf = (p: SchemePaint): number =>
  Number.isFinite(p.weight) ? (p.weight as number) : roleOf(p).weight;

/**
 * A colour the user mixed or picked themselves, rather than one from the
 * catalogue. `brand`/`range` are both the literal string `"custom"` for these,
 * which must never be shown to the user as-is.
 */
export const isCustomColour = (p: SchemePaint): boolean =>
  Boolean(p.custom) && (!p.brand || p.brand === "custom");

/** Just the maker — for the poster, where there is no room for the range too. */
export const brandLabel = (p: SchemePaint): string =>
  isCustomColour(p) ? "Custom colour" : p.brand;

/** Maker and range ("Citadel · Layer") — the editor and shared-view meta line. */
export const paintMeta = (p: SchemePaint): string =>
  isCustomColour(p)
    ? "Custom colour"
    : p.brand + (p.range && p.range !== "custom" ? ` · ${p.range}` : "");
