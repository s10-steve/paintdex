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
}

export const ROLES: Record<SchemeRole, RoleMeta> = {
  base: { label: "Base", solid: true, weight: 1.4, cssVar: "var(--role-base)" },
  layer: { label: "Layer", solid: true, weight: 1.0, cssVar: "var(--role-layer)" },
  highlight: { label: "Highlight", solid: true, weight: 0.55, cssVar: "var(--role-highlight)" },
  wash: { label: "Wash", solid: false, weight: 1.0, cssVar: "var(--role-wash)", opacity: 0.62 },
  glaze: { label: "Glaze", solid: false, weight: 1.0, cssVar: "var(--role-glaze)", opacity: 0.48 },
  weathering: { label: "Weathering", solid: false, weight: 0.8, cssVar: "var(--role-weathering)", opacity: 0.6 },
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
  /**
   * How much of the model this element covers, relative to the others. Drives
   * the bar's width so e.g. armour reads wider than eye lenses. Defaults to 1.
   */
  weight?: number;
}

export interface Scheme {
  title: string;
  elements: SchemeElement[];
}

/** A blank scheme — the starting point for the visualiser and the Reset target. */
export const emptyScheme = (): Scheme => ({ title: "", elements: [] });

export const roleOf = (p: SchemePaint): RoleMeta => ROLES[p.role] ?? ROLES.layer;
export const weightOf = (p: SchemePaint): number =>
  typeof p.weight === "number" ? p.weight : roleOf(p).weight;

/** Bounds for the per-element size control. */
export const ELEMENT_WEIGHT_MIN = 0.4;
export const ELEMENT_WEIGHT_MAX = 3;
export const elementWeightOf = (e: SchemeElement): number =>
  typeof e.weight === "number" ? e.weight : 1;
