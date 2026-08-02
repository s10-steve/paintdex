import { hexToLab, type Lab } from "@/lib/color";
import type { BrowsePaint } from "./types";

/**
 * A browse-index record with Lab attached. Deliberately not typed as
 * `PaintWithLab`: that shape drops `BrowsePaint`'s precomputed `l`, which these
 * records really do carry. It remains assignable to `PaintWithLab`, so consumers
 * expecting that are unaffected.
 */
export type BrowsePaintWithLab = BrowsePaint & { lab: Lab };

/**
 * Attach CIE-Lab to every record in the browse index, memoized per array.
 *
 * The browse index deliberately ships `l` and `family` but not the full Lab
 * triple, to keep the ~1MB payload down, so any client doing colour maths has to
 * recover it with `hexToLab`. Over 4,961 records that costs ~10ms — more than the
 * JSON parse the module-level fetch cache saves — and a `useMemo` can't help,
 * because it is per-component-instance and a paint-to-paint navigation remounts.
 * So the memo has to outlive the component, which means module scope.
 *
 * Keyed on the array's identity, which is stable precisely because
 * `fetchBrowseIndex` hands out the same cached array to every caller. A `WeakMap`
 * rather than a single slot so a different array — a test fixture, a mocked hook —
 * gets its own entry and can still be collected.
 *
 * Not solved by adding `a`/`b` to the index itself: that grows the payload for all
 * four consumers, most of which never do colour maths, to save one of them a
 * one-off 10ms.
 */
const cache = new WeakMap<readonly BrowsePaint[], BrowsePaintWithLab[]>();

export function withLab(paints: readonly BrowsePaint[]): BrowsePaintWithLab[] {
  const hit = cache.get(paints);
  if (hit) return hit;
  // `hexToLab` *throws* on a malformed hex, and this runs over the whole
  // catalogue — so one bad record used to take the entire alternatives panel
  // down rather than costing us one candidate. Best-effort data deserves
  // best-effort handling: drop what won't parse and rank the rest.
  const enriched: BrowsePaintWithLab[] = [];
  for (const p of paints) {
    try {
      enriched.push({ ...p, lab: hexToLab(p.hex) });
    } catch {
      /* unparseable hex — it simply can't take part in colour matching */
    }
  }
  cache.set(paints, enriched);
  return enriched;
}
