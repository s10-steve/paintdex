import citadel from "@/../data/paints/citadel.json";
import vallejo from "@/../data/paints/vallejo.json";
import akInteractive from "@/../data/paints/ak-interactive.json";

import { hexToLab, hueFamily } from "@/lib/color";
import type { Paint, PaintWithLab } from "./types";

const RAW: Paint[] = [
  ...(citadel as Paint[]),
  ...(vallejo as Paint[]),
  ...(akInteractive as Paint[]),
];

let cache: PaintWithLab[] | null = null;

/** All paints, enriched with precomputed Lab + colour family. Memoized. */
export function getAllPaints(): PaintWithLab[] {
  if (cache) return cache;
  cache = RAW.map((p) => ({
    ...p,
    lab: hexToLab(p.hex),
    family: hueFamily(p.hex),
  }));
  return cache;
}

/** Look up a single paint by id. */
export function getPaintById(id: string): PaintWithLab | undefined {
  return getAllPaints().find((p) => p.id === id);
}

/** Distinct brands, sorted. */
export function getBrands(): string[] {
  return [...new Set(getAllPaints().map((p) => p.brand))].sort();
}

/** Distinct ranges, sorted (optionally scoped to a set of brands). */
export function getRanges(brands?: string[]): string[] {
  const paints = getAllPaints();
  const set = new Set<string>();
  for (const p of paints) {
    if (brands && brands.length && !brands.includes(p.brand)) continue;
    set.add(p.range);
  }
  return [...set].sort();
}
