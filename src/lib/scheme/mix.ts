/**
 * Mixed layer entries — "1:1 Agrax Earthshade + Lahmian Medium".
 *
 * A `SchemePaint` carries its own colour in `hex` and, when it is a mix, a list
 * of extra `MixComponent`s with a parts ratio. **`displayHex` is the one thing a
 * renderer may read for a colour**; `paint.hex` means only "the primary paint's
 * own colour" and is left alone so serialisation, the presets and the browse
 * index keep working unchanged.
 *
 * This lives beside the scheme types rather than in `@/lib/color` because it is
 * `SchemePaint`-shaped; the generic weighted mean it delegates to is in
 * `@/lib/color`, next to the transforms it shares a white point with.
 */
import { blendHexLab } from "@/lib/color";
import { brandLabel, type MixComponent, type SchemePaint } from "./types";

/** One ingredient of an entry: the primary, or one of its mix components. */
export interface MixEntry {
  name: string;
  brand: string;
  range: string;
  hex: string;
  parts: number;
  medium?: true;
  custom?: true;
}

export const hasMix = (p: SchemePaint): boolean =>
  Array.isArray(p.mix) && p.mix.length > 0;

/**
 * A usable share. The second line of defence behind `io.ts`, for any scheme
 * that reaches a renderer another way — a zero or non-finite total would divide
 * out to `NaN` in every channel.
 */
export const partsOf = (c: { parts?: number }): number =>
  Number.isFinite(c.parts) && (c.parts as number) > 0 ? (c.parts as number) : 1;

/** Every ingredient of an entry, primary first. One entry for a plain paint. */
export function components(p: SchemePaint): MixEntry[] {
  const primary: MixEntry = {
    name: p.name,
    brand: p.brand,
    range: p.range,
    hex: p.hex,
    parts: partsOf(p),
    ...(p.medium ? { medium: true as const } : {}),
    ...(p.custom ? { custom: true as const } : {}),
  };
  if (!hasMix(p)) return [primary];
  return [primary, ...(p.mix as MixComponent[]).map((c) => ({ ...c, parts: partsOf(c) }))];
}

/*
 * The blend memo.
 *
 * Module scope rather than a `useMemo`, for the reason `lab-index.ts` already
 * records: a `useMemo` dies with its component, and the poster preview redraws
 * on every `pointermove` across every callout. Keyed on the colours and shares
 * rather than on `paint.id`, so a re-imported scheme with fresh ids still hits.
 * Bounded, because the OpenGraph route runs on a warm lambda that may serve many
 * schemes — the cache exists to survive a render pass, not a deploy.
 */
const BLEND_MEMO = new Map<string, string>();
const BLEND_MEMO_MAX = 512;

/**
 * The colour to paint for this entry: its own hex, or the parts-weighted blend
 * of its mix.
 *
 * Components flagged `medium` are excluded from the blend — they thin rather
 * than tint, so a 1:1 Agrax Earthshade + Lahmian Medium stays brown instead of
 * averaging toward the medium's near-white `#F9F9F9`. An all-medium mix has
 * nothing to tint with, so it blends everything rather than returning grey.
 *
 * A plain paint short-circuits before any maths or map lookup, so every scheme
 * that predates mixes renders bit-identically and no slower.
 */
export function displayHex(p: SchemePaint): string {
  if (!hasMix(p)) return p.hex;

  const all = components(p);
  const tinting = all.filter((c) => !c.medium);
  const used = tinting.length ? tinting : all;

  const key = used.map((c) => `${c.hex}:${c.parts}`).join("|");
  const hit = BLEND_MEMO.get(key);
  if (hit !== undefined) return hit;

  const out = blendHexLab(used.map((c) => ({ hex: c.hex, weight: c.parts })));
  if (BLEND_MEMO.size >= BLEND_MEMO_MAX) BLEND_MEMO.clear();
  BLEND_MEMO.set(key, out);
  return out;
}

/** Trims a share for display: `1` stays `1`, `0.5` stays `0.5`. */
const formatParts = (n: number): string => String(Number(n.toFixed(2)));

/** "Agrax Earthshade + Lahmian Medium"; the plain name when there's no mix. */
export function mixName(p: SchemePaint): string {
  if (!hasMix(p)) return p.name;
  return components(p)
    .map((c) => c.name)
    .join(" + ");
}

/** "1:1", "2:1:1" — or "" when the entry isn't a mix. */
export function ratioLabel(p: SchemePaint): string {
  if (!hasMix(p)) return "";
  return components(p)
    .map((c) => formatParts(c.parts))
    .join(":");
}

/** "1:1 Agrax Earthshade + Lahmian Medium" — one string for labels and the poster. */
export function mixTitle(p: SchemePaint): string {
  const ratio = ratioLabel(p);
  return ratio ? `${ratio} ${mixName(p)}` : p.name;
}

/**
 * The makers behind an entry, for the poster's brand line. Distinct, and capped
 * at two: that line is 14px in a 298px column, so `ellipsize` would eat a third
 * anyway.
 */
export function mixBrandLabel(p: SchemePaint): string {
  if (!hasMix(p)) return brandLabel(p);
  const seen: string[] = [];
  for (const c of components(p)) {
    const label = brandLabel(c);
    if (!seen.includes(label)) seen.push(label);
  }
  return seen.slice(0, 2).join(" · ");
}
