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

/**
 * One extra paint blended into a single layer entry — the "+ Lahmian Medium"
 * half of a 1:1 wash.
 *
 * Deliberately id-free. A mix isn't reorderable and isn't individually
 * hoverable, so React keys are the array index and `toExportShape` has nothing
 * to strip. Give these ids only if reordering is ever offered — and then strip
 * them on export, the way `SchemePaint.id` is stripped.
 */
export interface MixComponent {
  name: string;
  brand: string;
  range: string;
  /** This component's own colour — not the blend. */
  hex: string;
  /** Share of the mix. Positive and finite; `io.ts` holds that line. */
  parts: number;
  /**
   * Thins rather than tints: a medium, thinner, glaze medium or varnish. It
   * still counts in the displayed ratio but is left out of the colour blend.
   *
   * Set by hand, because it cannot be detected. The catalogue's `technical`
   * type also holds Crackle Medium and Blood for the Blood God, and "Medium"
   * in a name is usually a real colour ("Medium Sea Grey"). Without the flag,
   * Lahmian Medium's `#F9F9F9` drags a 1:1 Agrax wash to pale beige.
   */
  medium?: true;
  custom?: true;
}

/** A single paint in a scheme, applied in list order (base first). */
export interface SchemePaint {
  /** Stable client id for React keys / reordering. */
  id: string;
  name: string;
  /** Brand, or "custom" for a hand-entered colour. */
  brand: string;
  /** Product range, or "custom". */
  range: string;
  /**
   * Uppercase hex, e.g. "#ABA390" — **the primary paint's own colour**. To
   * render a swatch or a bar band, read `displayHex()` from `./mix`, never
   * this: an entry may be a mix, and only that function knows the blend.
   */
  hex: string;
  role: SchemeRole;
  /** True when entered by hand rather than picked from the database. */
  custom?: boolean;
  /**
   * The primary paint's share of the mix. Written only alongside a non-empty
   * `mix` — see the note on `mix` below.
   */
  parts?: number;
  /**
   * The primary paint is itself a medium. Possible because the user may add the
   * medium first and the pigment second. Same write rule as `parts`.
   */
  medium?: true;
  /**
   * Extra paints blended into this one entry. Absent or empty ⇒ a plain paint.
   *
   * `parts` and `medium` are written *only* when this is non-empty, and
   * removing the last component drops all three. A lone paint's "share" means
   * nothing, and — the real reason — a de-mixed entry has to serialise back to
   * bytes indistinguishable from a plain paint, or its document stays
   * permanently unequal to its stored `syncedCanon`.
   */
  mix?: MixComponent[];
  /** Short free-text instruction, e.g. "airbrush over the upper 75%". */
  note?: string;
}

/** Extra paints one entry may hold, beyond the primary. */
export const MAX_MIX_COMPONENTS = 5;
/** Longest per-layer note. Keeps `schemes.data` inside its 100 000-byte check. */
export const MAX_NOTE = 200;
/** Upper bound on one component's share of a mix. */
export const MAX_PARTS = 100;

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
 * Role is the only thing that sizes a band. There used to be a per-paint
 * `weight` override with a slider behind it, which said the same thing the role
 * already said — base thick, highlight thin — at the cost of a line in every
 * editor row. It was removed, along with the whole class of bug its docblock
 * used to warn about: a non-finite override reaching `barModel` turned every
 * ramp stop into `NaN%`. A role can only be one of seven known keys, so there
 * is nothing left to sanitise.
 */
export const weightOf = (p: SchemePaint): number => roleOf(p).weight;

/**
 * A colour the user mixed or picked themselves, rather than one from the
 * catalogue. `brand`/`range` are both the literal string `"custom"` for these,
 * which must never be shown to the user as-is.
 */
export const isCustomColour = (p: SchemePaint | MixComponent): boolean =>
  Boolean(p.custom) && (!p.brand || p.brand === "custom");

/*
 * `brandLabel` and `paintMeta` describe the *primary* paint only, and must stay
 * that way. Making them mix-aware here means importing `./mix`, which imports
 * this file — and that cycle would drag `@/lib/color` into `bars.ts`, `io.ts`
 * and `presets.ts`, the last of which is under a standing "must not import"
 * rule. The mix-aware variants live in `./mix` instead.
 */

/** Just the maker — for the poster, where there is no room for the range too. */
export const brandLabel = (p: SchemePaint | MixComponent): string =>
  isCustomColour(p) ? "Custom colour" : p.brand;

/** Maker and range ("Citadel · Layer") — the editor and shared-view meta line. */
export const paintMeta = (p: SchemePaint | MixComponent): string =>
  isCustomColour(p)
    ? "Custom colour"
    : p.brand + (p.range && p.range !== "custom" ? ` · ${p.range}` : "");
