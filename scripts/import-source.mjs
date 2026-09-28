#!/usr/bin/env node
/**
 * Import paint data from the MIT-licensed `Arcturus5404/miniature-paints`
 * dataset into Paintdex's clean JSON schema (`data/paints/*.json`).
 *
 * The generated JSON is the committed source of truth and is hand-editable;
 * this script only needs to run to (re)import or refresh from upstream.
 *
 * **It rewrites each output file wholesale — diff before committing.** It
 * knows nothing about paints added by hand (Warhammer Tone Pro, Army
 * Painter's John Blanche range), and nothing about the categorisation
 * migration's one-off fixes (`scripts/categorise/`: the old-formula Game Air
 * split, paints moved to their right range, codes reassigned after splitting
 * merged records). What it does carry forward, by id, is each existing
 * paint's hand-checked `type`, `metallic` flag and primary range. New paints
 * take their range's `defaultType` from `data/ranges.json`; a range with no
 * entry there is reported, and `validate:data` will then fail until one is
 * added — which is the point, since its format and binder are unknown.
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

/**
 * Upstream files grouped by the Paintdex output file they contribute to.
 *
 * `idPrefix` overrides the brand slug in generated ids. Games Workshop dropped
 * the Citadel name, so those paints are brand "Warhammer" now — but their ids
 * stay `citadel-*`, because every indexed URL, saved collection row and preset
 * points at them. Without the override a re-import would mint `warhammer-*`.
 */
const SOURCES = [
  {
    file: "Citadel_Colour.md",
    brand: "Warhammer",
    idPrefix: "citadel",
    out: "warhammer.json",
  },
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

const RANGES = JSON.parse(await readFile(join(ROOT, "data", "ranges.json"), "utf8")).ranges;

/**
 * The product line a range belongs to. Rows are deduplicated **within** a
 * line: the same name and hex under two lines (Game Color and Game Air, a
 * Tamiya pot and its spray can) are different bottles, and merging them made
 * "I own the pot" indistinguishable from "I own the airbrush version". An
 * unknown range is a line of its own.
 */
const lineOf = (brand, range) => RANGES[brand]?.[range]?.line ?? `range:${range}`;

/** Existing records by id, so hand-checked fields survive a re-import. */
async function loadExisting(out) {
  try {
    const paints = JSON.parse(await readFile(join(OUT_DIR, out), "utf8"));
    return new Map(paints.map((p) => [p.id, p]));
  } catch {
    return new Map();
  }
}

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

  // out file -> Map keyed by `${nameKey}|${hex}|${line}` for dedup across the
  // headings of one product line (and across files).
  const byOut = new Map();

  for (const { file, brand, idPrefix, out } of SOURCES) {
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

      const key = `${name.toLowerCase()}|${hex}|${lineOf(brand, range)}`;
      const existing = bucket.get(key);
      if (existing) {
        if (!existing.ranges.includes(range)) existing.ranges.push(range);
        existing.discontinued = existing.discontinued && discontinued;
        if (!existing.code && code) existing.code = code;
      } else {
        bucket.set(key, {
          name,
          brand,
          idPrefix: idPrefix ?? slugify(brand),
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

  const unknownRanges = new Set();
  for (const [out, bucket] of byOut) {
    const usedIds = new Set();
    const paints = [];
    const existing = await loadExisting(out);

    for (const p of bucket.values()) {
      // The headings in one record are all one line, so the primary is only
      // which heading its page shows; alphabetical unless the record exists.
      const sortedRanges = [...p.ranges].sort();
      let primaryRange = sortedRanges[0];

      // Stable id, disambiguated on collision (same name, different hex).
      const base = `${p.idPrefix}-${slugify(p.name)}`;
      let id = base;
      if (usedIds.has(id)) id = `${base}-${slugify(primaryRange)}`;
      let n = 2;
      while (usedIds.has(id)) id = `${base}-${n++}`;
      usedIds.add(id);

      const before = existing.get(id);
      if (before && p.ranges.includes(before.range)) primaryRange = before.range;
      const info = RANGES[p.brand]?.[primaryRange];
      if (!info) unknownRanges.add(`${p.brand} / ${primaryRange}`);
      const type = before?.type ?? info?.defaultType ?? "opaque";
      const metallic = before ? Boolean(before.metallic) : Boolean(info?.metallic);

      const record = {
        id,
        name: p.name,
        brand: p.brand,
        range: primaryRange,
        type,
        hex: p.hex,
        code: p.code,
        discontinued: p.discontinued || Boolean(info?.discontinued),
      };
      if (p.ranges.length > 1) {
        record.ranges = sortedRanges;
      }
      if (metallic) record.metallic = true;
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
  if (unknownRanges.size) {
    console.warn(
      `\n${unknownRanges.size} range(s) have no entry in data/ranges.json — add them (format, binder, line, defaultType) before committing:\n  ${[...unknownRanges].join("\n  ")}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
