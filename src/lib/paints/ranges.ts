/**
 * Range metadata: what `data/ranges.json` says about each brand's product
 * lines, and the one function that folds it onto a paint.
 *
 * A range carries what's true of every bottle in it — how it's delivered
 * (`format`), what binds it (`binder`), which product `line` it belongs to —
 * so 235 Model Air records don't each have to say "airbrush". The few paints
 * that break their range's rule are listed under `exceptions`.
 *
 * `line` is what a bottle *is*; a range is a heading it's listed under. AK
 * prints one Real Colors bottle under both "Air" and "WWII", and that's the
 * only thing a paint's `ranges[]` may mean. `validate-data` rejects a record
 * whose ranges span two lines — the importer used to merge any two rows with
 * the same name and hex, which filed Game Color and Game Air as one paint and
 * made "I own the pot" indistinguishable from "I own the airbrush version".
 *
 * Imported by `load.ts` and the build scripts only. The client never needs
 * it: the browse index ships each paint already resolved.
 */
import rangesJson from "@/../data/ranges.json";
import type { Paint, PaintBinder, PaintFormat, PaintRecord, PaintType } from "./types";

export interface RangeInfo {
  /** URL-safe, unique within its brand. */
  slug: string;
  /** Product line, unique within its brand. */
  line: string;
  format: PaintFormat;
  binder: PaintBinder;
  /** What a new paint in this range is, unless it says otherwise. The importer's default. */
  defaultType: PaintType;
  /** Every paint in the range is metallic. */
  metallic?: boolean;
  /** The whole line is off the market; its paints must say so too. */
  discontinued?: boolean;
  note?: string;
}

export interface RangesFile {
  ranges: Record<string, Record<string, RangeInfo>>;
  exceptions: Record<string, { format?: PaintFormat; binder?: PaintBinder; note: string }>;
}

export const RANGES = rangesJson as RangesFile;

export function rangeInfo(brand: string, range: string): RangeInfo | undefined {
  return RANGES.ranges[brand]?.[range];
}

/**
 * A stored record with its range's format and binder. Throws on a range with
 * no entry: `validate-data` guarantees there is one, and a silent default
 * would file an unknown range as brush-on acrylic.
 */
export function withRangeInfo<T extends PaintRecord>(p: T): T & Pick<Paint, "format" | "binder"> {
  const info = rangeInfo(p.brand, p.range);
  if (!info) throw new Error(`No entry in data/ranges.json for ${p.brand} / ${p.range} (${p.id})`);
  const ex = RANGES.exceptions[p.id];
  return { ...p, format: ex?.format ?? info.format, binder: ex?.binder ?? info.binder };
}
