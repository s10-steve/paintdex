/**
 * Import / export a scheme as JSON — the MVP's "save your work" mechanism
 * (there are no accounts, so a downloadable file doubles as backup and a way
 * to share a scheme with someone else).
 *
 * Export strips runtime ids and undefined fields for a clean, human-readable
 * file. Import is deliberately lenient: it sanitises each field with a sensible
 * default rather than rejecting a whole file over one bad value, and only
 * throws when the input plainly isn't a scheme.
 */
import {
  MAX_MIX_COMPONENTS,
  MAX_NOTE,
  MAX_PARTS,
  MAX_SCHEME_TITLE,
  ROLES,
  type MixComponent,
  type Scheme,
  type SchemeElement,
  type SchemePaint,
  type SchemeRole,
} from "./types";

/** Current on-disk format version, for forward-compatible imports. */
export const SCHEME_FORMAT = 1;

export interface ExportShape {
  format: number;
  app: "paintdex";
  title: string;
  elements: Array<{
    name: string;
    paints: Array<{
      name: string;
      brand: string;
      range: string;
      hex: string;
      role: SchemeRole;
      custom?: true;
      parts?: number;
      medium?: true;
      mix?: Array<{
        name: string;
        brand: string;
        range: string;
        hex: string;
        parts: number;
        medium?: true;
        custom?: true;
      }>;
      note?: string;
    }>;
  }>;
}

/**
 * Build the plain, id-free export object for a scheme. Used both by
 * `exportSchemeJSON` (which stringifies it for a download) and by the
 * account-sync path (which stores it directly as `jsonb`, no stringify round
 * trip). Pure — no React/DOM — so it stays node-testable.
 */
export function toExportShape(scheme: Scheme): ExportShape {
  return {
    format: SCHEME_FORMAT,
    app: "paintdex",
    title: scheme.title,
    elements: scheme.elements.map((e) => ({
      name: e.name,
      paints: e.paints.map((p) => ({
        name: p.name,
        brand: p.brand,
        range: p.range,
        hex: p.hex,
        role: p.role,
        ...(p.custom ? { custom: true as const } : {}),
        // `parts` and `medium` ride with `mix` and are never emitted without
        // it, so a de-mixed entry serialises back to exactly the bytes a plain
        // paint does — see the note on `SchemePaint.mix`.
        ...(p.mix && p.mix.length
          ? {
              parts: typeof p.parts === "number" ? p.parts : 1,
              ...(p.medium ? { medium: true as const } : {}),
              mix: p.mix.map((c) => ({
                name: c.name,
                brand: c.brand,
                range: c.range,
                hex: c.hex,
                parts: c.parts,
                ...(c.medium ? { medium: true as const } : {}),
                ...(c.custom ? { custom: true as const } : {}),
              })),
            }
          : {}),
        ...(p.note ? { note: p.note } : {}),
      })),
    })),
  };
}

/** Serialise a scheme to pretty JSON (no runtime ids). */
export function exportSchemeJSON(scheme: Scheme): string {
  return JSON.stringify(toExportShape(scheme), null, 2);
}

/** A filesystem-friendly name for a scheme's export, e.g. "white-templars". */
export function schemeSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "paint-scheme"
  );
}

const isRole = (v: unknown): v is SchemeRole =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(ROLES, v);

const HEX = /^#?[0-9a-fA-F]{6}$/;
function cleanHex(v: unknown): string {
  if (typeof v === "string" && HEX.test(v.trim())) {
    return "#" + v.trim().replace(/^#/, "").toUpperCase();
  }
  return "#808080";
}

const str = (v: unknown, fallback: string): string =>
  typeof v === "string" && v.length ? v : fallback;

/**
 * One component's share of a mix, or `undefined`.
 *
 * Zero is rejected rather than clamped, unlike most bounds here: the shares are
 * normalised by their total, so an all-zero mix divides by zero and every Lab
 * channel comes out `NaN`. That reaches a renderer as a malformed hex — a throw
 * from `addColorStop` on the poster canvas, and a 500 on the public OpenGraph
 * route. `JSON.parse("1e400")` is the nasty input: well-formed JSON, `Infinity`.
 */
function parts(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return undefined;
  return Math.min(v, MAX_PARTS);
}

/** The extra paints of a mix. Capped — `schemes.data` has a size constraint. */
function mixList(v: unknown): MixComponent[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, MAX_MIX_COMPONENTS).map((rc): MixComponent => {
    const c = (rc && typeof rc === "object" ? rc : {}) as Record<string, unknown>;
    return {
      name: str(c.name, "Untitled"),
      brand: str(c.brand, "custom"),
      range: str(c.range, "custom"),
      hex: cleanHex(c.hex),
      parts: parts(c.parts) ?? 1,
      ...(c.medium === true ? { medium: true as const } : {}),
      ...(c.custom === true ? { custom: true as const } : {}),
    };
  });
}

/** A short application note, or `undefined`. Trimmed, then capped. */
function note(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, MAX_NOTE);
  return t.length ? t : undefined;
}

/**
 * Parse and sanitise a scheme from JSON text, assigning fresh ids via `newId`.
 * Throws a user-facing Error only when the text isn't JSON or isn't a scheme.
 */
export function importScheme(text: string, newId: () => string): Scheme {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  return importSchemeObject(data, newId);
}

/**
 * Sanitise an already-parsed scheme object (e.g. a `jsonb` row from the
 * database), assigning fresh ids via `newId`. Same lenient rules as
 * `importScheme`; use this to avoid an object → string → object round trip.
 */
export function importSchemeObject(data: unknown, newId: () => string): Scheme {
  if (!data || typeof data !== "object") {
    throw new Error("That doesn't look like a paint scheme.");
  }
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.elements)) {
    throw new Error("That doesn't look like a paint scheme (no elements found).");
  }

  const elements: SchemeElement[] = obj.elements.map((re): SchemeElement => {
    const e = (re && typeof re === "object" ? re : {}) as Record<string, unknown>;
    const rawPaints = Array.isArray(e.paints) ? e.paints : [];
    const paints: SchemePaint[] = rawPaints.map((rp): SchemePaint => {
      const p = (rp && typeof rp === "object" ? rp : {}) as Record<string, unknown>;
      const mix = mixList(p.mix);
      const noteText = note(p.note);
      return {
        id: newId(),
        name: str(p.name, "Untitled"),
        brand: str(p.brand, "custom"),
        range: str(p.range, "custom"),
        hex: cleanHex(p.hex),
        role: isRole(p.role) ? p.role : "layer",
        ...(p.custom === true ? { custom: true } : {}),
        ...(mix.length
          ? {
              parts: parts(p.parts) ?? 1,
              ...(p.medium === true ? { medium: true as const } : {}),
              mix,
            }
          : {}),
        ...(noteText !== undefined ? { note: noteText } : {}),
      };
    });
    return {
      id: newId(),
      name: str(e.name, "Element"),
      paints,
    };
  });

  // Trimmed to the column's limit: an over-long title from a file would
  // otherwise be rejected by the database as an opaque sync failure, well after
  // the import appeared to succeed.
  return {
    title: str(obj.title, "Imported scheme").slice(0, MAX_SCHEME_TITLE),
    elements,
  };
}
