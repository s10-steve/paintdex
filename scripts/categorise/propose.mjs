/**
 * Writes the review files for the paint-categorisation migration, and edits
 * nothing: `type-review.csv` (every paint, the rows worth a look first),
 * `ranges.csv` and `splits.json`.
 *
 * Usage: node scripts/categorise/propose.mjs <out-dir>
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { RANGES } from "./range-defaults.mjs";
import { applyReranges, classify, loadFiles, planSplits } from "./lib.mjs";

const out = process.argv[2] ?? ".";
mkdirSync(out, { recursive: true });

const paints = loadFiles().flatMap((f) => f.paints);
const before = new Map(paints.map((p) => [p.id, { type: p.type, metallic: Boolean(p.metallic), range: p.range }]));
const rerange = applyReranges(paints);
const splits = planSplits(paints);
const splitIds = new Set(splits.map((s) => s.id));

const rows = paints.map((p) => {
  const c = classify(p);
  const reasons = [...c.reasons];
  if (splitIds.has(p.id)) reasons.push("merges product lines — split");
  const was = before.get(p.id);
  return {
    id: p.id, brand: p.brand, range: p.range, name: p.name, hex: p.hex,
    current_range: was.range, current_type: was.type, current_metallic: was.metallic,
    proposed_type: c.type, proposed_metallic: c.metallic, format: c.format, binder: c.binder,
    source: c.source, needs_review: c.review || splitIds.has(p.id) ? "yes" : "", reasons: reasons.join("; "),
  };
});

const csv = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const table = (cols, rs) => [cols.join(","), ...rs.map((r) => cols.map((c) => csv(r[c] ?? "")).join(","))].join("\n") + "\n";
rows.sort((a, b) => (b.needs_review > a.needs_review ? 1 : -1) || a.brand.localeCompare(b.brand) || a.range.localeCompare(b.range) || a.name.localeCompare(b.name));
writeFileSync(join(out, "type-review.csv"), table(Object.keys(rows[0]), rows));
writeFileSync(join(out, "splits.json"), JSON.stringify({ rerange, splits }, null, 2) + "\n");

const counts = rows.reduce((m, r) => ((m[`${r.brand}|${r.range}`] = (m[`${r.brand}|${r.range}`] ?? 0) + 1), m), {});
writeFileSync(join(out, "ranges.csv"), table(
  ["brand", "range", "line", "paints", "format", "binder", "defaultType", "metallic", "discontinued", "note"],
  Object.entries(RANGES).map(([k, v]) => {
    const [brand, range] = k.split("|");
    return { brand, range, paints: counts[k] ?? 0, ...v, metallic: v.metallic === true ? "yes" : v.metallic || "", discontinued: v.discontinued ? "yes" : "" };
  }),
));

const tally = (k) => rows.reduce((m, r) => ((m[r[k]] = (m[r[k]] ?? 0) + 1), m), {});
console.log("paints:", rows.length, "| needs review:", rows.filter((r) => r.needs_review).length);
console.log("proposed types:", tally("proposed_type"));
console.log("formats:", tally("format"), "| binders:", tally("binder"));
console.log("metallic:", rows.filter((r) => r.current_metallic || r.current_type === "metallic").length, "→", rows.filter((r) => r.proposed_metallic).length);
console.log("records to split:", splits.length, "→ new records:", splits.reduce((n, s) => n + s.create.length, 0), "| re-ranged:", rerange.length);
