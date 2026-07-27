import { hexToLab } from "@/lib/color";
import type { BrowsePaint, PaintWithLab } from "./types";

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
const cache = new WeakMap<readonly BrowsePaint[], PaintWithLab[]>();

export function withLab(paints: readonly BrowsePaint[]): PaintWithLab[] {
  const hit = cache.get(paints);
  if (hit) return hit;
  const enriched = paints.map((p) => ({ ...p, lab: hexToLab(p.hex) }));
  cache.set(paints, enriched);
  return enriched;
}
