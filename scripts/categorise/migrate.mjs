/**
 * Applies the paint-categorisation migration to `data/`: writes
 * `data/ranges.json`, and rewrites `data/paints/*.json` with the new
 * "what it does" types, metallic flags, range corrections, the split of
 * records that merged different product lines, and range-level
 * discontinuation. Idempotent — a second run changes nothing.
 *
 * Usage: node scripts/categorise/migrate.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OVERRIDES, RANGES } from "./range-defaults.mjs";
import { DATA_DIR, applyReranges, classify, loadFiles, planSplits, slug } from "./lib.mjs";

const files = loadFiles();
const all = files.flatMap((f) => f.paints);
applyReranges(all);
const plans = new Map(planSplits(all).map((s) => [s.id, s]));

/** Source key order, so a rewritten record diffs only where it changed. */
function record(p, c) {
  const r = { id: p.id, name: p.name, brand: p.brand, range: p.range, type: c.type, hex: p.hex, code: p.code ?? null, discontinued: c.discontinued };
  if (p.ranges?.length > 1) r.ranges = [...p.ranges].sort();
  if (c.metallic) r.metallic = true;
  return r;
}

let created = 0;
for (const f of files) {
  const out = [];
  for (const p of f.paints) {
    const plan = plans.get(p.id);
    const kept = plan ? { ...p, range: plan.keep.range, ranges: plan.keep.ranges, code: plan.keep.code } : p;
    out.push(record(kept, classify(kept)));
    for (const n of plan?.create ?? []) {
      // A split-off record is a different bottle: it takes its own range's
      // type, not the one the merged record carried.
      const q = { id: n.id, name: p.name, brand: p.brand, range: n.range, ranges: n.ranges, type: "other", hex: p.hex, code: n.code, discontinued: false, metallic: p.metallic || p.type === "metallic" };
      out.push(record(q, classify(q)));
      created++;
    }
  }
  const path = join(DATA_DIR, f.file);
  const original = readFileSync(path, "utf8");
  let text = JSON.stringify(out, null, 2);
  // Keep each file's own conventions: \u-escaped non-ASCII, trailing newline.
  if (/\\u[0-9a-f]{4}/i.test(original)) text = text.replace(/[\u007f-￿]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
  if (original.endsWith("\n")) text += "\n";
  writeFileSync(path, text);
}

// data/ranges.json — nested brand → range, in catalogue order.
const ranges = {};
for (const [key, v] of Object.entries(RANGES).sort(([a], [b]) => a.localeCompare(b))) {
  const [brand, range] = key.split("|");
  const e = { slug: slug(range), line: v.line.split("/")[1], format: v.format, binder: v.binder, defaultType: v.defaultType };
  if (v.metallic === true) e.metallic = true;
  if (v.discontinued) e.discontinued = true;
  if (v.note) e.note = v.note;
  (ranges[brand] ??= {})[range] = e;
}
const exceptions = {};
for (const [id, o] of Object.entries(OVERRIDES)) {
  if (!o.format && !o.binder) continue;
  exceptions[id] = { ...(o.format && { format: o.format }), ...(o.binder && { binder: o.binder }), note: o.reason };
}
writeFileSync("data/ranges.json", JSON.stringify({ ranges, exceptions }, null, 2) + "\n");

console.log(`✓ ${all.length} paints rewritten, ${created} split-off records added → ${all.length + created}; data/ranges.json: ${Object.keys(RANGES).length} ranges, ${Object.keys(exceptions).length} exceptions`);
