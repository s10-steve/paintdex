/**
 * Pure decision logic for reconciling the editor's current (localStorage)
 * scheme with a user's saved schemes at sign-in. Kept out of the React
 * component so it can be unit-tested (see `test/scheme.test.ts`).
 */
import { importSchemeObject, toExportShape } from "./io";
import type { Scheme } from "./types";

/**
 * A stable, order-independent JSON string for a scheme or a stored export
 * shape. Postgres `jsonb` does not preserve key order, so we can't compare raw
 * `JSON.stringify` output; routing both sides through `importSchemeObject` →
 * `toExportShape` normalises structure, key order and runtime ids away.
 */
export function canonicalScheme(data: unknown): string {
  return JSON.stringify(toExportShape(importSchemeObject(data, () => "x")));
}

/** True when a scheme is more than the blank seed (has elements or a title). */
export function schemeHasContent(s: Scheme): boolean {
  return s.elements.length > 0 || s.title.trim() !== "";
}

/**
 * What to do with the editor's current scheme when the user signs in, given the
 * `data` of their already-saved schemes (most-recent first):
 *
 * - `"adopt-local"` — save the current scheme as a new row. Used for a
 *   brand-new user, and (the important case) for a returning user who built
 *   something while signed out that isn't already saved — so that work is
 *   preserved instead of being silently overwritten.
 * - `"load-latest"` — the current scheme is blank or already saved, so just
 *   load the most-recently-updated saved scheme into the editor.
 */
export function planSignInScheme(
  savedData: unknown[],
  local: Scheme,
): "adopt-local" | "load-latest" {
  if (savedData.length === 0) return "adopt-local";
  if (!schemeHasContent(local)) return "load-latest";
  const localCanon = canonicalScheme(local);
  const alreadySaved = savedData.some((d) => {
    try {
      return canonicalScheme(d) === localCanon;
    } catch {
      return false;
    }
  });
  return alreadySaved ? "load-latest" : "adopt-local";
}
