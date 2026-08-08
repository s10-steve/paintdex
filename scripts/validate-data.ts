#!/usr/bin/env tsx
/**
 * Validate every paint data file in `data/paints/` against the zod schema,
 * and enforce cross-file invariants (globally unique ids, unique
 * brand+name+hex+range — the range is part of the key because the same
 * colour legitimately appears once per product line, e.g. a Base and an Air
 * version of the same paint).
 *
 * Run: npm run validate:data
 * Exits non-zero on any problem, so it can gate CI and PRs.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
    console.log(`  ✓ ${file}: ${parsed.data.length} paints`);
  }

  if (errors.length) {
    console.error(`\n✗ ${errors.length} problem(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`\n✓ All good — ${total} paints across ${files.length} files.`);
}

main();
