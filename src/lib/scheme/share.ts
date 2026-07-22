/**
 * Pure helpers for public share links.
 *
 * A published scheme gets a `share_slug` — a readable, unguessable token used in
 * its `/scheme/<slug>` URL. The slug is a slugified title plus a random suffix:
 * the title makes shared links legible ("white-templars-…" reads well on
 * Reddit/Instagram) while the suffix keeps them unique and hard to enumerate.
 *
 * Everything here is pure (no React/DOM, no crypto) so it stays node-testable —
 * callers supply the randomness (browser `crypto.getRandomValues`).
 */
import { schemeSlug } from "./io";

/** Length of the random suffix, in base-36 characters. */
export const SHARE_TOKEN_LENGTH = 10;

/**
 * Derive a lowercase base-36 token from random bytes. Deterministic given its
 * input, so it's unit-testable; feed it `crypto.getRandomValues(new
 * Uint8Array(n))` at the call site. Each byte becomes two base-36 chars, so the
 * 10-char token is fixed by the first 5 random bytes — ~40 bits of entropy
 * (about 4 bits/char). Not a cryptographic key; just a hard-to-enumerate handle
 * behind RLS.
 */
export function makeShareToken(rand: Uint8Array): string {
  let out = "";
  for (const byte of rand) {
    // 0–255 → exactly two base-36 digits, so the byte→chars mapping is simple.
    out += byte.toString(36).padStart(2, "0");
  }
  return out.slice(0, SHARE_TOKEN_LENGTH) || "0";
}

/**
 * Build a share slug from a scheme title and a random token, e.g.
 * "white-templars-3f9a2b7c10". Reuses `schemeSlug` so the title part matches
 * the export-filename slug rules.
 */
export function makeShareSlug(title: string, token: string): string {
  return `${schemeSlug(title)}-${token}`;
}

/** Absolute URL for a shared scheme, e.g. "https://paintdex.app/scheme/foo-123". */
export function shareUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, "")}/scheme/${slug}`;
}
