#!/usr/bin/env tsx
/**
 * Validate every paint data file in `data/paints/` against the zod schema,
 * and enforce cross-file invariants (globally unique ids, unique
 * brand+name+hex+range — the range is part of the key because the same
 * colour legitimately appears once per product line, e.g. a Base and an Air
 * version of the same paint).
 *
 * Also holds `data/ranges.json` and the catalogue to each other: every paint's
 * range has an entry, every entry has a paint, a paint's `ranges[]` stays on
 * one product line (a second line is a different bottle, and merging them is
 * what made owning Game Color indistinguishable from owning Game Air), and a
 * discontinued line's paints say so.
 *
 * Run: npm run validate:data
 * Exits non-zero on any problem, so it can gate CI and PRs.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RANGES, rangeInfo } from "../src/lib/paints/ranges";
import { paintsFileSchema } from "../src/lib/paints/schema";

const DATA_DIR = join(process.cwd(), "data", "paints");

function main() {
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.error("No paint data files found in data/paints/");
    process.exit(1);
  }

  const errors: string[] = [];
  const ids = new Map<string, string>(); // id -> file
  const identity = new Map<string, string>(); // brand|name|hex -> file
  const usedRanges = new Set<string>(); // brand|range
  let total = 0;

  for (const file of files) {
    const path = join(DATA_DIR, file);
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      errors.push(`${file}: invalid JSON (${(e as Error).message})`);
      continue;
    }

    const parsed = paintsFileSchema.safeParse(json);
    if (!parsed.success) {
      for (const issue of parsed.error.issues.slice(0, 20)) {
        errors.push(`${file}: ${issue.path.join(".")} — ${issue.message}`);
      }
      continue;
    }

    for (const p of parsed.data) {
      total++;
      if (ids.has(p.id)) {
        errors.push(
          `${file}: duplicate id "${p.id}" (also in ${ids.get(p.id)})`,
        );
      } else {
        ids.set(p.id, file);
      }
      const key = `${p.brand}|${p.name.toLowerCase()}|${p.hex}|${p.range}`;
      if (identity.has(key)) {
        errors.push(
          `${file}: duplicate paint ${p.brand} "${p.name}" ${p.hex} (also in ${identity.get(key)})`,
        );
      } else {
        identity.set(key, file);
      }
    }
    for (const p of parsed.data) {
      const info = rangeInfo(p.brand, p.range);
      if (!info) {
        errors.push(`${file}: ${p.id} is in "${p.brand} / ${p.range}", which has no entry in data/ranges.json`);
        continue;
      }
      if (info.discontinued && !p.discontinued) {
        errors.push(`${file}: ${p.id} is in the discontinued range "${p.range}" but isn't marked discontinued`);
      }
      for (const r of p.ranges ?? [p.range]) {
        usedRanges.add(`${p.brand}|${r}`);
        const other = rangeInfo(p.brand, r);
        if (!other) errors.push(`${file}: ${p.id} lists "${r}", which has no entry in data/ranges.json`);
        else if (other.line !== info.line) {
          errors.push(
            `${file}: ${p.id} lists "${p.range}" (${info.line}) and "${r}" (${other.line}) — different product lines are different paints; split the record`,
          );
        }
      }
    }
    console.log(`  ✓ ${file}: ${parsed.data.length} paints`);
  }

  for (const [brand, ranges] of Object.entries(RANGES.ranges)) {
    const slugs = new Map<string, string>();
    for (const [range, info] of Object.entries(ranges)) {
      if (!usedRanges.has(`${brand}|${range}`)) errors.push(`data/ranges.json: "${brand} / ${range}" has no paints`);
      if (slugs.has(info.slug)) errors.push(`data/ranges.json: ${brand} slug "${info.slug}" is used by "${range}" and "${slugs.get(info.slug)}"`);
      slugs.set(info.slug, range);
    }
  }
  for (const id of Object.keys(RANGES.exceptions)) {
    if (!ids.has(id)) errors.push(`data/ranges.json: exception for "${id}", which isn't a paint`);
  }

  if (errors.length) {
    console.error(`\n✗ ${errors.length} problem(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`\n✓ All good — ${total} paints across ${files.length} files.`);
}

main();
