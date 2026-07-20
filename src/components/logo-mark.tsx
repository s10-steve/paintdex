/**
 * Paintdex brand mark: the paint spectrum as a 12-segment colour wheel,
 * finished like a camera lens (top-left shine, edge vignette, thin rim) — a
 * "paint" + "-dex" motif. Pure inline SVG, no network request, crisp at any
 * size, and readable on light or dark backgrounds. The canonical asset also
 * lives at `public/logo.svg` and `src/app/icon.svg` (favicon); keep them in
 * sync if the artwork changes.
 */
const HUES = [
  "#E23D3D", "#E8663C", "#EE9A34", "#F0C22E", "#C9D138", "#5FBE4E",
  "#35B98E", "#2FB5C4", "#3D8FD6", "#5A63C8", "#8B54C6", "#CE49A0",
];

/** Segment paths: 12 wedges of a disc (r=28) centred at (32,32). */
const WEDGES = [
  "M32 32 L32 4 A28 28 0 0 1 46 7.75 Z",
  "M32 32 L46 7.75 A28 28 0 0 1 56.25 18 Z",
  "M32 32 L56.25 18 A28 28 0 0 1 60 32 Z",
  "M32 32 L60 32 A28 28 0 0 1 56.25 46 Z",
  "M32 32 L56.25 46 A28 28 0 0 1 46 56.25 Z",
  "M32 32 L46 56.25 A28 28 0 0 1 32 60 Z",
  "M32 32 L32 60 A28 28 0 0 1 18 56.25 Z",
  "M32 32 L18 56.25 A28 28 0 0 1 7.75 46 Z",
  "M32 32 L7.75 46 A28 28 0 0 1 4 32 Z",
  "M32 32 L4 32 A28 28 0 0 1 7.75 18 Z",
  "M32 32 L7.75 18 A28 28 0 0 1 18 7.75 Z",
  "M32 32 L18 7.75 A28 28 0 0 1 32 4 Z",
];

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="Paintdex"
    >
      <defs>
        <clipPath id="pd-disc">
          <circle cx="32" cy="32" r="28" />
        </clipPath>
        <radialGradient id="pd-shine" cx="0.34" cy="0.30" r="0.58">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="0.38" stopColor="#ffffff" stopOpacity="0.26" />
          <stop offset="0.78" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pd-vignette" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.68" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.24" />
        </radialGradient>
      </defs>
      <g clipPath="url(#pd-disc)">
        {WEDGES.map((d, i) => (
          <path key={i} d={d} fill={HUES[i]} />
        ))}
        <rect x="0" y="0" width="64" height="64" fill="url(#pd-vignette)" />
        <rect x="0" y="0" width="64" height="64" fill="url(#pd-shine)" />
      </g>
      <circle cx="32" cy="32" r="28" fill="none" stroke="#000000" strokeOpacity="0.18" strokeWidth="1" />
      <circle cx="32" cy="32" r="27" fill="none" stroke="#ffffff" strokeOpacity="0.32" strokeWidth="1.5" />
    </svg>
  );
}
