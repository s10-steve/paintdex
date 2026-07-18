#!/usr/bin/env tsx
/**
 * Precompute the browse index that the `/paints` page loads at runtime.
 *
 * Reads the hand-editable `data/paints/*.json`, enriches each record with its
 * CIE-Lab value and colour family, and writes a single static asset
 * (`public/browse-index.json`). The browser fetches this instead of importing
 * the dataset into the client JS bundle, so the `/paints` bundle stays lean and
 * the (precomputed) Lab values don't have to be recomputed in the browser as
 * the catalogue grows.
 *
 * Wired into the `prebuild` / `predev` npm scripts; safe to run by hand with
 * `npm run build:browse-index`.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { hexToLab, hueFamily } from "../src/lib/color/index";
import type { BrowsePaint, Paint } from "../src/lib/paints/types";

const DATA_DIR = join(process.cwd(), "data", "paints");
const OUT_DIR = join(process.cwd(), "public");
const OUT_FILE = join(OUT_DIR, "browse-index.json");

/** Round to ~3 decimals; well beyond perceptual precision. */
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function main() {
  const files = readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  const paints: BrowsePaint[] = [];
  for (const file of files) {
    const records = JSON.parse(
      readFileSync(join(DATA_DIR, file), "utf8"),
    ) as Paint[];
    for (const p of records) {
      // Ship only lightness (for the sort) + family (for the filter). The full
      // Lab triple isn't needed on the browse page and would bloat the payload.
      paints.push({
        ...p,
        l: round(hexToLab(p.hex)[0]),
        family: hueFamily(p.hex),
      });
    }
  }

  // Match the default browse order (name A–Z within brand) so the first paint
  // and the facet lists are stable regardless of file iteration order.
  paints.sort(
    (x, y) => x.brand.localeCompare(y.brand) || x.name.localeCompare(y.name),
  );

  mkdirSync(OUT_DIR, { recursive: true });
  const json = JSON.stringify(paints);
  writeFileSync(OUT_FILE, json);
  console.log(
    `  browse-index.json: ${paints.length} paints (${(
      Buffer.byteLength(json) / 1024
    ).toFixed(0)} KB)`,
  );
}

main();
