/**
 * Colour maths for Paintdex.
 *
 * Everything here is pure and dependency-free so it can run in the browser,
 * in Node (import script / tests), and during static generation.
 *
 * Similarity uses CIE-Lab + CIEDE2000, which matches human colour perception
 * far better than naive RGB Euclidean distance.
 */

export type Rgb = readonly [number, number, number];
export type Lab = readonly [number, number, number];

/** Parse "#RRGGBB" (or "RRGGBB", "#RGB") into 0-255 RGB. Throws on invalid input. */
export function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    throw new Error(`Invalid hex colour: "${hex}"`);
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Normalize any accepted hex form to canonical uppercase "#RRGGBB". */
export function normalizeHex(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return (
    "#" +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

/** sRGB (0-255) -> CIE XYZ (D65). */
export function rgbToXyz([r, g, b]: Rgb): Lab {
  const toLinear = (c: number) => {
    const cs = c / 255;
    return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  };
  const rl = toLinear(r);
  const gl = toLinear(g);
  const bl = toLinear(b);
  // sRGB D65 matrix
  const x = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175;
  const z = rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041;
  return [x, y, z];
}

/** CIE XYZ (D65) -> CIE-Lab. */
export function xyzToLab([x, y, z]: Lab): Lab {
  // D65 reference white
  const xn = 0.95047;
  const yn = 1.0;
  const zn = 1.08883;
  const f = (t: number) =>
    t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const fx = f(x / xn);
  const fy = f(y / yn);
  const fz = f(z / zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Convenience: hex string -> CIE-Lab. */
export function hexToLab(hex: string): Lab {
  return xyzToLab(rgbToXyz(hexToRgb(hex)));
}

/**
 * CIEDE2000 colour-difference (ΔE00) between two Lab colours.
 * Returns 0 for identical colours; typical "just noticeable" ~1-2.
 * Reference: Sharma, Wu & Dalal (2005).
 */
export function ciede2000(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  const kL = 1;
  const kC = 1;
  const kH = 1;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;

  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;

  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  const rad2deg = (r: number) => (r * 180) / Math.PI;
  const deg2rad = (d: number) => (d * Math.PI) / 180;

  const hp = (bp: number, ap: number) => {
    if (bp === 0 && ap === 0) return 0;
    const angle = rad2deg(Math.atan2(bp, ap));
    return angle >= 0 ? angle : angle + 360;
  };
  const h1p = hp(b1, a1p);
  const h2p = hp(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(deg2rad(dhp) / 2);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp: number;
  if (C1p * C2p === 0) {
    hbarp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hbarp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hbarp = (h1p + h2p + 360) / 2;
  } else {
    hbarp = (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(deg2rad(hbarp - 30)) +
    0.24 * Math.cos(deg2rad(2 * hbarp)) +
    0.32 * Math.cos(deg2rad(3 * hbarp + 6)) -
    0.2 * Math.cos(deg2rad(4 * hbarp - 63));

  const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const Cbarp7 = Math.pow(Cbarp, 7);
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + Math.pow(25, 7)));
  const SL =
    1 + (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(deg2rad(2 * dTheta)) * RC;

  return Math.sqrt(
    Math.pow(dLp / (kL * SL), 2) +
      Math.pow(dCp / (kC * SC), 2) +
      Math.pow(dHp / (kH * SH), 2) +
      RT * (dCp / (kC * SC)) * (dHp / (kH * SH)),
  );
}

/**
 * CIE-Lab in cylindrical (LCh) form: the same colour, described as lightness,
 * chroma (how saturated) and hue angle (which colour) instead of two opponent
 * axes. Chroma and hue are what people actually reason about — "same blue, less
 * punchy" is a chroma move; "a bit warmer" is a hue move.
 */
export interface Lch {
  /** L*, same as Lab's first component (0 = black, 100 = white). */
  l: number;
  /** C*, distance from the neutral axis. 0 = grey; ~130 is about the maximum. */
  c: number;
  /** Hue angle in degrees, normalized to [0, 360). Meaningless when c ~ 0. */
  h: number;
}

/**
 * Below this chroma a colour is close enough to grey that its hue angle is
 * noise rather than merely small: a ±1 wobble in the a*, b* pair swings it by
 * roughly 57/C degrees, so at C* = 10 the hue is ±6° and at C* = 5 it's ±11°.
 * Callers that position or group by hue must gate on this.
 *
 * Not a rare case in this catalogue: about a quarter of the paints sit under it,
 * including heavily-visited pages like Abaddon Black and Administratum Grey.
 */
export const NEUTRAL_CHROMA = 10;

/** CIE-Lab -> LCh. Hue is reported as 0 for exact neutrals, which is arbitrary. */
export function labToLch([l, a, b]: Lab): Lch {
  const c = Math.hypot(a, b);
  // atan2(0, 0) is 0 rather than NaN, so exact neutrals fall out as h = 0.
  const deg = (Math.atan2(b, a) * 180) / Math.PI;
  return { l, c, h: deg < 0 ? deg + 360 : deg };
}

/**
 * Signed shortest way round the hue circle from `from` to `to`, in degrees.
 * Result is in (-180, 180], so hueDelta(350, 10) is +20, not -340.
 */
export function hueDelta(from: number, to: number): number {
  const d = ((to - from) % 360 + 540) % 360 - 180;
  // The line above lands exactly-opposite hues on -180; report +180 so the
  // range is (-180, 180] and the sign of a half-turn is stable.
  return d === -180 ? 180 : d;
}

/** WCAG relative luminance (0-1) of a hex colour. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const [, y] = rgbToXyz([r, g, b]);
  return y;
}

/**
 * Pick black or white text for legibility on a given background hex.
 * Uses relative luminance with the standard ~0.179 threshold.
 */
export function contrastText(hex: string): "#000000" | "#ffffff" {
  return relativeLuminance(hex) > 0.179 ? "#000000" : "#ffffff";
}

export const COLOUR_FAMILIES = [
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "purple",
  "pink",
  "brown",
  "neutral",
] as const;

export type ColourFamily = (typeof COLOUR_FAMILIES)[number];

/** Convert RGB to HSL (h in 0-360, s/l in 0-1). */
export function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
        break;
      case gn:
        h = ((bn - rn) / d + 2) * 60;
        break;
      default:
        h = ((rn - gn) / d + 4) * 60;
        break;
    }
  }
  return [h, s, l];
}

/**
 * Classify a hex colour into a coarse colour family for filtering.
 * Handles neutrals (low saturation) and browns (dark/desaturated oranges)
 * before falling back to hue buckets.
 */
export function hueFamily(hex: string): ColourFamily {
  const rgb = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(rgb);

  // Greys, blacks, whites.
  if (s < 0.12 || l < 0.06 || l > 0.96) return "neutral";

  // Brown = dark/muted orange-yellow range.
  if (h >= 15 && h < 50 && (l < 0.4 || s < 0.5)) return "brown";

  if (h < 15 || h >= 345) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 165) return "green";
  if (h < 200) return "cyan";
  if (h < 255) return "blue";
  if (h < 290) return "purple";
  if (h < 345) return "pink";
  return "red";
}
