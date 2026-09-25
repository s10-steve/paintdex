/**
 * Brand names the catalogue no longer uses, and what they became.
 *
 * Games Workshop dropped the Citadel name, so its paints are brand "Warhammer"
 * now. Their ids were **deliberately kept** as `citadel-*`: every indexed
 * `/paints/<id>` URL, every `paint_collection.paint_id` row and every preset
 * points at one, and none of them needed to change for a relabel. But the old
 * name is still out there in places the catalogue doesn't own — saved scheme
 * documents (which store the brand string), bookmarked `?brand=Citadel` links,
 * and what people type into search — so those readers go through here.
 *
 * Pure, and free of the catalogue, so the client modules can import it.
 */

/** Former brand name → the current one. */
export const LEGACY_BRANDS: Readonly<Record<string, string>> = {
  Citadel: "Warhammer",
};

const byLowerName = new Map(
  Object.entries(LEGACY_BRANDS).map(([from, to]) => [from.toLowerCase(), to]),
);

/**
 * The current name for a brand, case-insensitively; anything that isn't a
 * former name comes back unchanged.
 */
export function canonicalBrand(brand: string): string {
  return byLowerName.get(brand.trim().toLowerCase()) ?? brand;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/**
 * The name a paint used to be sold under, or `undefined`.
 *
 * Decided by the id rather than the brand: a paint that was relabelled kept its
 * old-brand id, while one launched after the rename (Tone Pro) was never sold
 * under the old name and has a new-brand id — saying "formerly Citadel" about it
 * would be false.
 */
export function formerBrand(paint: { id: string; brand: string }): string | undefined {
  for (const [from, to] of Object.entries(LEGACY_BRANDS)) {
    if (paint.brand === to && paint.id.startsWith(`${slug(from)}-`)) return from;
  }
  return undefined;
}
