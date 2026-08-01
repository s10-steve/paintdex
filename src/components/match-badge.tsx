import { matchLabel } from "@/lib/paints/filter";

/** Small badge describing how close a match is (from a CIEDE2000 distance). */
export function MatchBadge({ distance }: { distance: number }) {
  const label = matchLabel(distance);
  // Green (close) -> amber -> muted (loose).
  const tone =
    distance < 2
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : distance < 5
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        : distance < 10
          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          : "bg-muted text-muted-foreground";
  return (
    <span
      // `shrink-0 whitespace-nowrap`: the badge sits in flex rows next to paint
      // names and `brand · range`, both of which run long. Without these the
      // badge is the thing that gives way, and its two children (the label and
      // the ΔE figure) wrap independently — a squashed two-line pill next to a
      // clamped name, which is what made the alternatives cards look broken.
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
      title={`ΔE ${distance.toFixed(1)}`}
    >
      {label}
      <span className="opacity-60">ΔE {distance.toFixed(1)}</span>
    </span>
  );
}
