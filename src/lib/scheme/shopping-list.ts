/**
 * What a scheme needs from your paint collection: which of its paints you own,
 * which are on your wishlist, which you'd have to buy — and for each one you
 * haven't got, the closest paint you *do* own.
 *
 * Pure, so the visualiser's card is presentation only and the rules are pinned
 * in `test/shopping-list.test.ts`. The catalogue and the collection arrive as
 * arguments: this module must not import `@/lib/paints/load` (the `presets.ts`
 * rule — it would put the whole catalogue in the client bundle) and must not
 * know what a collection provider is.
 *
 * Things it has to get right:
 *
 * - **Every ingredient counts, mediums included.** "1:1 Agrax + Lahmian Medium"
 *   needs both pots, and you still have to buy Lahmian Medium, even though the
 *   blend leaves it out of the colour. So the walk goes through `components()`,
 *   not the entry's primary.
 * - **One row per catalogue paint.** A basecoat used on three elements is one
 *   pot, listed once with the elements it's used on, in first-appearance order.
 * - **A scheme paint has no catalogue id** (see "My paints" in CLAUDE.md), so
 *   ids come from `cataloguePaintId`, which matches on name and maker and knows
 *   the old "Citadel" brand. An ingredient it can't resolve — a custom colour,
 *   or a paint that has been renamed — is `unmatched` rather than dropped, so
 *   the counts add up to what's on screen.
 * - **"Closest you own" is like-for-like, then by colour.** A candidate has to be
 *   the same kind of paint (`paintGroup`: an opaque paint for an opaque one, a
 *   wash for a wash), in the same binder, with the same metallic finish, and
 *   within `MAX_SUGGESTION`
 *   ΔE — past that "Similar" is a different colour, and "nothing close" is the
 *   more useful answer. By colour alone it offered Nuln Oil for Macragge Blue,
 *   Heavy Metal for Fenrisian Grey and Lahmian Medium for Stormhost Silver.
 */
import { ciede2000, hexToLab, type Lab } from "@/lib/color";
import { cataloguePaintId } from "@/lib/paints/catalogue-match";
import { withLab, type BrowsePaintWithLab } from "@/lib/paints/lab-index";
import type { BrowsePaint, PaintBinder, PaintType } from "@/lib/paints/types";
import type { PaintStatus } from "@/lib/supabase/types";
import { components } from "./mix";
import type { Scheme, SchemeRole } from "./types";

/**
 * Beyond this ΔE a "closest colour" isn't close: `matchLabel` calls it
 * "Loose", and the card says there's nothing close instead.
 */
export const MAX_SUGGESTION = 20;

/**
 * What a paint does, coarsely enough that paints in one group can stand in
 * for each other — a direct read of the catalogue's `type`, which now means
 * exactly that.
 *
 * - `wash` takes glazes and inks too: painters thin an ink into a wash, and a
 *   glaze is a wash used over a wider area. Coarser than `type` on purpose.
 * - `technical` covers textures, effects, mediums and varnishes, and never
 *   matches anything: there is no colour substitute for Lahmian Medium, a
 *   crackle texture or a gloss varnish.
 * - Delivery is **not** part of the match. If you own the airbrush Macragge
 *   Blue, you have that colour; the shopping list still counts owning *this*
 *   record exactly, which is why pot and air versions are separate paints.
 * - Chemistry is, through `binder` in `Want`: an enamel panel-line wash
 *   behaves nothing like an acrylic shade, and oil paints aren't a stand-in for
 *   acrylics.
 */
export type PaintGroup = "opaque" | "wash" | "one-coat" | "primer" | "technical";

const GROUP_OF_TYPE: Record<PaintType, PaintGroup> = {
  opaque: "opaque",
  contrast: "one-coat",
  wash: "wash",
  glaze: "wash",
  ink: "wash",
  primer: "primer",
  varnish: "technical",
  medium: "technical",
  technical: "technical",
};

export const paintGroup = (p: { type: PaintType }): PaintGroup => GROUP_OF_TYPE[p.type];

/**
 * For a colour with no catalogue entry, the scheme's role is the only hint at
 * what kind of paint it is. Weathering can be anything, so it isn't narrowed.
 */
const GROUP_OF_ROLE: Partial<Record<SchemeRole, PaintGroup>> = {
  base: "opaque",
  layer: "opaque",
  highlight: "opaque",
  drybrush: "opaque",
  wash: "wash",
  glaze: "wash",
};

/** What a suggestion has to match. `null` means "either". */
interface Want {
  group: PaintGroup | null;
  binder: PaintBinder | null;
  metallic: boolean | null;
}

type Entries = ReadonlyMap<string, PaintStatus>;

export interface ClosestOwned {
  paint: BrowsePaint;
  distance: number;
}

export interface ShoppingItem {
  paintId: string;
  paint: BrowsePaint;
  /** The element names this paint is used on, in scheme order, deduplicated. */
  elements: string[];
}

export interface NeededItem extends ShoppingItem {
  /** Null when you own nothing to compare against. */
  closestOwned: ClosestOwned | null;
}

export interface UnmatchedItem {
  name: string;
  /** The role of the scheme entry it first appeared in — the only hint at its kind. */
  role: SchemeRole;
  brand: string;
  hex: string;
  /** `custom`: a colour entered by hand. `not-found`: named, but not in the catalogue. */
  reason: "custom" | "not-found";
  elements: string[];
  closestOwned: ClosestOwned | null;
}

export interface ShoppingList {
  owned: ShoppingItem[];
  wishlist: NeededItem[];
  needed: NeededItem[];
  unmatched: UnmatchedItem[];
}

/*
 * The owned pool and the per-colour answers, memoized on the collection map's
 * identity (the provider replaces the map on every change and keeps it
 * otherwise). Without this, typing in the scheme title — a new `scheme` on
 * every keystroke — would redo a ΔE pass over the whole collection for every
 * paint in the scheme.
 */
interface OwnedPool {
  paints: BrowsePaintWithLab[];
  byHex: Map<string, ClosestOwned | null>;
}
const pools = new WeakMap<Entries, WeakMap<readonly BrowsePaint[], OwnedPool>>();

function ownedPool(entries: Entries, catalogue: readonly BrowsePaint[]): OwnedPool {
  let perCatalogue = pools.get(entries);
  if (!perCatalogue) {
    perCatalogue = new WeakMap();
    pools.set(entries, perCatalogue);
  }
  let pool = perCatalogue.get(catalogue);
  if (!pool) {
    // Owned only — a wishlisted paint isn't one you can reach for — and
    // discontinued ones included, because you still have the pot.
    pool = {
      paints: withLab(catalogue).filter((p) => entries.get(p.id) === "owned"),
      byHex: new Map(),
    };
    perCatalogue.set(catalogue, pool);
  }
  return pool;
}

function closestTo(
  hex: string,
  want: Want,
  pool: OwnedPool,
  excludeId?: string,
): ClosestOwned | null {
  // Technical paints have no colour substitute; don't pretend otherwise.
  if (want.group === "technical") return null;
  const key = `${hex.toUpperCase()}|${want.group ?? "*"}|${want.binder ?? "*"}|${want.metallic ?? "*"}|${excludeId ?? ""}`;
  if (pool.byHex.has(key)) return pool.byHex.get(key) ?? null;

  let lab: Lab;
  try {
    lab = hexToLab(hex);
  } catch {
    // A malformed custom hex can't be compared; that's no reason to fail the list.
    pool.byHex.set(key, null);
    return null;
  }
  let best: ClosestOwned | null = null;
  for (const p of pool.paints) {
    if (p.id === excludeId) continue;
    const group = paintGroup(p);
    if (group === "technical") continue;
    if (want.group && group !== want.group) continue;
    if (want.binder && p.binder !== want.binder) continue;
    if (want.metallic !== null && Boolean(p.metallic) !== want.metallic) continue;
    const distance = ciede2000(lab, p.lab);
    if (distance >= MAX_SUGGESTION) continue;
    if (!best || distance < best.distance) best = { paint: p, distance };
  }
  pool.byHex.set(key, best);
  return best;
}

export function shoppingList(
  scheme: Scheme,
  catalogue: readonly BrowsePaint[],
  entries: Entries,
): ShoppingList {
  const byId = new Map<string, BrowsePaint>();
  for (const p of catalogue) if (!byId.has(p.id)) byId.set(p.id, p);

  // Insertion order is first appearance, which is the order the rows render in.
  const matched = new Map<string, ShoppingItem>();
  const unmatched = new Map<string, Omit<UnmatchedItem, "closestOwned">>();

  const addElement = (list: string[], name: string) => {
    if (!list.includes(name)) list.push(name);
  };

  for (const element of scheme.elements) {
    const elementName = element.name || "Untitled element";
    for (const entry of element.paints) {
      for (const c of components(entry)) {
        const id = cataloguePaintId(c, catalogue);
        const paint = id ? byId.get(id) : undefined;
        if (id && paint) {
          const item = matched.get(id) ?? { paintId: id, paint, elements: [] };
          addElement(item.elements, elementName);
          matched.set(id, item);
          continue;
        }
        const custom = Boolean(c.custom) && (!c.brand || c.brand === "custom");
        const key = `${custom ? "custom" : c.brand.toLowerCase()}|${c.name.toLowerCase()}|${c.hex.toUpperCase()}`;
        const item = unmatched.get(key) ?? {
          name: c.name || "Custom colour",
          role: entry.role,
          brand: custom ? "" : c.brand,
          hex: c.hex,
          reason: custom ? ("custom" as const) : ("not-found" as const),
          elements: [],
        };
        addElement(item.elements, elementName);
        unmatched.set(key, item);
      }
    }
  }

  const pool = ownedPool(entries, catalogue);
  const out: ShoppingList = { owned: [], wishlist: [], needed: [], unmatched: [] };
  for (const item of matched.values()) {
    const status = entries.get(item.paintId);
    if (status === "owned") {
      out.owned.push(item);
      continue;
    }
    const withClosest: NeededItem = {
      ...item,
      closestOwned: closestTo(
        item.paint.hex,
        { group: paintGroup(item.paint), binder: item.paint.binder, metallic: Boolean(item.paint.metallic) },
        pool,
        item.paintId,
      ),
    };
    if (status === "wishlist") out.wishlist.push(withClosest);
    else out.needed.push(withClosest);
  }
  for (const item of unmatched.values()) {
    // Nothing says what a hand-entered colour is made of or whether it's
    // metallic, so either will do.
    const want: Want = { group: GROUP_OF_ROLE[item.role] ?? null, binder: null, metallic: null };
    out.unmatched.push({ ...item, closestOwned: closestTo(item.hex, want, pool) });
  }
  return out;
}
