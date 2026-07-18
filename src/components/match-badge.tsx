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
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
      title={`ΔE ${distance.toFixed(1)}`}
    >
      {label}
      <span className="opacity-60">ΔE {distance.toFixed(1)}</span>
    </span>
  );
}
