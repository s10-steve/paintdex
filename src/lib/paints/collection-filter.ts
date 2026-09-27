/**
 * The paint ids "only paints I own" narrows to, for `FacetSelection.inCollection`.
 *
 * Pure, and deliberately ignorant of the collection provider: it takes the
 * provider's map and hands back a set, so `matchesFacets` can apply the filter
 * without importing React or Supabase.
 *
 * Memoized at module scope on the map's identity, per the `lab-index.ts` rule. A
 * `useMemo` would die with the component, and a paint-to-paint navigation
 * remounts the panel; the provider keeps the same map across navigations and
 * replaces it on every toggle, so identity is exactly the right key.
 */
import type { PaintStatus } from "@/lib/supabase/types";
import type { CollectionFilter } from "./filter-params";

type Entries = ReadonlyMap<string, PaintStatus>;

const memo = new WeakMap<Entries, Partial<Record<Exclude<CollectionFilter, "">, ReadonlySet<string>>>>();

export function collectionIds(
  entries: Entries,
  mine: CollectionFilter,
): ReadonlySet<string> | null {
  if (!mine) return null;
  let cached = memo.get(entries);
  if (!cached) {
    cached = {};
    memo.set(entries, cached);
  }
  let ids = cached[mine];
  if (!ids) {
    ids = new Set(
      [...entries]
        .filter(([, status]) => mine === "collection" || status === "owned")
        .map(([id]) => id),
    );
    cached[mine] = ids;
  }
  return ids;
}
