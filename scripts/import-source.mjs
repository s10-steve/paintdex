#!/usr/bin/env node
/**
 * Import paint data from the MIT-licensed `Arcturus5404/miniature-paints`
 * dataset into Paintdex's clean JSON schema (`data/paints/*.json`).
 *
 * The generated JSON is the committed source of truth and is hand-editable;
 * this script only needs to run to (re)import or refresh from upstream.
 *
 * Usage:
 *   node scripts/import-source.mjs            # fetch from GitHub (raw)
 *   node scripts/import-source.mjs --src DIR  # read local *.md from DIR
 *
 * Upstream: https://github.com/Arcturus5404/miniature-paints (MIT, (c) 2022 Rick Fleuren)
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "data", "paints");
const RAW_BASE =
  "https://raw.githubusercontent.com/Arcturus5404/miniature-paints/master/paints";

/** Upstream files grouped by the Paintdex output file they contribute to. */
const SOURCES = [
  { file: "Citadel_Colour.md", brand: "Citadel", out: "citadel.json" },
  { file: "Vallejo.md", brand: "Vallejo", out: "vallejo.json" },
  { file: "AK.md", brand: "AK Interactive", out: "ak-interactive.json" },
  { file: "AKRC.md", brand: "AK Interactive", out: "ak-interactive.json" },
  { file: "Army_Painter.md", brand: "Army Painter", out: "army-painter.json" },
  { file: "Duncan.md", brand: "Duncan Rhodes", out: "duncan-rhodes.json" },
  { file: "GreenStuffWorld.md", brand: "Green Stuff World", out: "green-stuff-world.json" },
  { file: "Liquitex.md", brand: "Liquitex", out: "liquitex.json" },
  { file: "Mig.md", brand: "Mig", out: "mig.json" },
  { file: "P3.md", brand: "P3", out: "p3.json" },
  { file: "Scale75.md", brand: "Scale 75", out: "scale-75.json" },
  { file: "Tamiya.md", brand: "Tamiya", out: "tamiya.json" },
];

function slugify(s) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Map a brand's product-line label ("Set") + name to a normalized finish. */
function mapType(set, name) {
  const s = set.toLowerCase();
  const n = name.toLowerCase();
  if (s.includes("contrast") || s.includes("speedpaint")) return "contrast";
  if (s.includes("technical")) return "technical";
  if (s.includes("shade") || n.includes(" shade")) return "shade";
  if (s.includes("wash") || n.includes(" wash")) return "wash";
  if (s.includes("dry")) return "dry";
  if (s.includes("glaze") || n.includes("glaze")) return "glaze";
  if (s.includes("ink") || n.endsWith(" ink")) return "ink";
  // Enamels and oils come after the finish rules above so an "Enamel Wash" is
  // still a wash. `\boil` rather than `includes("oil")`: Scale 75's "Soil Works"
  // range would otherwise import as 14 oils.
  if (s.includes("enamel")) return "enamel";
  if (/\boil/.test(s) || s.includes("oilbrusher")) return "oil";
  if (s.includes("metal")) return "metallic";
  if (s.includes("primer")) return "primer";
  if (s.includes("spray")) return "spray";
  if (s.includes("air")) return "air";
  if (s.includes("layer")) return "layer";
  if (s.includes("base") || s.includes("foundation")) return "base";
  return "other";
}

/** Lower rank = more representative primary range for a paint. */
const TYPE_RANK = {
  base: 0,
  layer: 1,
  contrast: 2,
  metallic: 2,
  shade: 3,
  ink: 3,
  wash: 3,
  technical: 4,
  glaze: 5,
  other: 5,
  enamel: 5,
  oil: 5,
  dry: 6,
  primer: 7,
  air: 8,
  spray: 9,
};

function normalizeHex(raw) {
  const m = raw.match(/#?([0-9a-fA-F]{6})/);
  if (!m) return null;
  return "#" + m[1].toUpperCase();
}

/** Parse a pipe-delimited markdown table into row objects keyed by header. */
function parseTable(md) {
  const lines = md.split(/\r?\n/).filter((l) => l.trim().startsWith("|"));
  if (lines.length < 2) return [];
  const cells = (line) =>
    line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
  const header = cells(lines[0]).map((h) => h.toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = cells(lines[i]);
    if (c.every((x) => /^-+$/.test(x) || x === "")) continue; // separator row
    const row = {};
    header.forEach((h, idx) => (row[h] = c[idx] ?? ""));
    rows.push(row);
  }
  return rows;
}

async function loadSource(file, srcDir) {
  if (srcDir) return readFile(join(srcDir, file), "utf8");
  const res = await fetch(`${RAW_BASE}/${file}`);
  if (!res.ok) throw new Error(`Failed to fetch ${file}: ${res.status}`);
  return res.text();
}

async function main() {
  const srcArgIdx = process.argv.indexOf("--src");
  const srcDir = srcArgIdx !== -1 ? process.argv[srcArgIdx + 1] : null;

  // out file -> Map keyed by `${nameKey}|${hex}` for dedup across ranges/files.
  const byOut = new Map();

  for (const { file, brand, out } of SOURCES) {
    const md = await loadSource(file, srcDir);
    const rows = parseTable(md);
    const bucket = byOut.get(out) ?? new Map();
    byOut.set(out, bucket);

    for (const row of rows) {
      const name = row.name?.trim();
      const hex = normalizeHex(row.hex ?? "");
      if (!name || !hex) continue;

      const setRaw = (row.set ?? "").trim();
      const discontinued = /\(discontinued\)/i.test(setRaw);
      const range = setRaw.replace(/\s*\(discontinued\)\s*/i, "").trim() || "General";
      // Some upstream files use the literal string "null" for a missing code.
      const codeRaw = (row.code ?? "").trim();
      const code = codeRaw && codeRaw.toLowerCase() !== "null" ? codeRaw : null;

      const key = `${name.toLowerCase()}|${hex}`;
      const existing = bucket.get(key);
      if (existing) {
        if (!existing.ranges.includes(range)) existing.ranges.push(range);
        existing.discontinued = existing.discontinued && discontinued;
        if (!existing.code && code) existing.code = code;
      } else {
        bucket.set(key, {
          name,
          brand,
          hex,
          code,
          ranges: [range],
          discontinued,
        });
      }
    }
  }

  await mkdir(OUT_DIR, { recursive: true });
  let grandTotal = 0;

  for (const [out, bucket] of byOut) {
    const usedIds = new Set();
    const paints = [];

    for (const p of bucket.values()) {
      // Choose the most representative range as the primary.
      const rangesSorted = [...p.ranges].sort(
        (a, b) => TYPE_RANK[mapType(a, p.name)] - TYPE_RANK[mapType(b, p.name)],
      );
      const primaryRange = rangesSorted[0];
      const type = mapType(primaryRange, p.name);

      // Stable id, disambiguated on collision (same name, different hex).
      const brandSlug = slugify(p.brand);
      const base = `${brandSlug}-${slugify(p.name)}`;
      let id = base;
      if (usedIds.has(id)) id = `${base}-${slugify(primaryRange)}`;
      let n = 2;
      while (usedIds.has(id)) id = `${base}-${n++}`;
      usedIds.add(id);

      const record = {
        id,
        name: p.name,
        brand: p.brand,
        range: primaryRange,
        type,
        hex: p.hex,
        code: p.code,
        discontinued: p.discontinued,
      };
      if (p.ranges.length > 1) {
        record.ranges = [...p.ranges].sort();
      }
      paints.push(record);
    }

    paints.sort(
      (a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name),
    );

    await writeFile(join(OUT_DIR, out), JSON.stringify(paints, null, 2) + "\n");
    console.log(`  ${out}: ${paints.length} paints`);
    grandTotal += paints.length;
  }

  console.log(`Done. ${grandTotal} paints across ${byOut.size} files.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
