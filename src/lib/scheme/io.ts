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
  MAX_SCHEME_TITLE,
  ROLES,
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
      return {
        id: newId(),
        name: str(p.name, "Untitled"),
        brand: str(p.brand, "custom"),
        range: str(p.range, "custom"),
        hex: cleanHex(p.hex),
        role: isRole(p.role) ? p.role : "layer",
        ...(p.custom === true ? { custom: true } : {}),
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
