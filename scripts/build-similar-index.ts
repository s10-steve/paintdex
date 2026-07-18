#!/usr/bin/env tsx
/**
 * Precompute the "similar colours" lists for every paint.
 *
 * Static generation used to call `findSimilar` over the whole dataset twice per
 * paint page (~O(n²) CIEDE2000 calls, plus a full sort and array allocation on
 * every page). This script does that ranking once, up front, and writes the
 * result to `.cache/similar-index.json`. The paint detail pages then read the
 * precomputed lists (an O(1) lookup) instead of recomputing them, so per-page
 * build cost stays flat as the catalogue grows.
 *
 * The ranking itself is still O(n²), so it's sharded across CPU cores: the main
 * process spawns one `tsx` child per shard (workers can't inherit tsx's TS
 * loader, but a child process can), each child ranks a contiguous slice and
 * writes a shard file, and the main process merges them.
 *
 * Reads the source `data/paints/*.json` and computes Lab itself. Wired into
 * `prebuild`/`predev`; safe to run by hand with `npm run build:similar-index`.
 */
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { ciede2000, hexToLab } from "../src/lib/color/index";
import type { Paint } from "../src/lib/paints/types";

const LIMIT = 16; // matches the detail page's findSimilar limit
const DATA_DIR = join(process.cwd(), "data", "paints");
const OUT_DIR = join(process.cwd(), ".cache");
const OUT_FILE = join(OUT_DIR, "similar-index.json");
const shardFile = (i: number) => join(OUT_DIR, `similar-shard-${i}.json`);

/** A paint with its Lab value — only what the ranking needs. */
interface RankPaint {
  id: string;
  name: string;
  brand: string;
  discontinued: boolean;
  lab: readonly [number, number, number];
}

interface Entry {
  id: string;
  d: number;
}
type ShardResult = Record<string, { all: Entry[] }>;

/** Insert into a distance-ascending list, keeping at most `limit` entries. */
function boundedInsert(list: Entry[], cand: Entry, limit: number) {
  if (list.length >= limit && cand.d >= list[list.length - 1].d) return;
  let lo = 0;
  let hi = list.length;
  // Insert after equal distances so ties keep candidate (browse) order, like
  // findSimilar's stable sort.
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].d <= cand.d) lo = mid + 1;
    else hi = mid;
  }
  list.splice(lo, 0, cand);
  if (list.length > limit) list.pop();
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Rank paints[start, end) against the whole dataset. */
function rankRange(
  paints: RankPaint[],
  start: number,
  end: number,
): ShardResult {
  const n = paints.length;
  const out: ShardResult = {};
  for (let i = start; i < end; i++) {
    const a = paints[i];
    const all: Entry[] = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const b = paints[j];
      // Mirror findSimilar's defaults: suggestions never include discontinued.
      if (b.discontinued) continue;
      const d = ciede2000(a.lab, b.lab);
      boundedInsert(all, { id: b.id, d }, LIMIT);
    }
    out[a.id] = {
      all: all.map((e) => ({ id: e.id, d: round(e.d) })),
    };
  }
  return out;
}

/**
 * Read the source data and enrich with Lab, in the same order the browse index
 * uses (name A–Z within brand) so ids/order are stable across shards.
 */
function loadPaints(): RankPaint[] {
  const files = readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const paints: RankPaint[] = [];
  for (const file of files) {
    const records = JSON.parse(
      readFileSync(join(DATA_DIR, file), "utf8"),
    ) as Paint[];
    for (const p of records) {
      paints.push({
        id: p.id,
        name: p.name,
        brand: p.brand,
        discontinued: p.discontinued,
        lab: hexToLab(p.hex),
      });
    }
  }
  paints.sort(
    (x, y) => x.brand.localeCompare(y.brand) || x.name.localeCompare(y.name),
  );
  return paints;
}

/** Child: `--shard <i> <count>` ranks its slice and writes a shard file. */
function runShard(shard: number, count: number) {
  const paints = loadPaints();
  const n = paints.length;
  const size = Math.ceil(n / count);
  const start = shard * size;
  const end = Math.min(start + size, n);
  const result = start < end ? rankRange(paints, start, end) : {};
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(shardFile(shard), JSON.stringify(result));
}

/** Main: fan the ranking out across CPU cores, then merge the shards. */
async function runMain() {
  const paints = loadPaints();
  const n = paints.length;
  const count = Math.max(1, Math.min(cpus().length, 8));
  const self = fileURLToPath(import.meta.url);

  mkdirSync(OUT_DIR, { recursive: true });
  await Promise.all(
    Array.from({ length: count }, (_, i) => spawnShard(self, i, count)),
  );

  const merged: ShardResult = {};
  for (let i = 0; i < count; i++) {
    Object.assign(merged, JSON.parse(readFileSync(shardFile(i), "utf8")));
    rmSync(shardFile(i), { force: true });
  }

  const json = JSON.stringify(merged);
  writeFileSync(OUT_FILE, json);
  console.log(
    `  similar-index.json: ${n} paints × up to ${LIMIT} matches, ${count} shard(s) (${(
      Buffer.byteLength(json) / 1024
    ).toFixed(0)} KB)`,
  );
}

function spawnShard(self: string, i: number, count: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // `npx tsx <self> --shard i count` — a full tsx process, so the TS imports
    // in this file resolve the same way they do for the parent.
    const child = spawn(
      "npx",
      ["tsx", self, "--shard", String(i), String(count)],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`shard ${i} exited ${code}`)),
    );
  });
}

const shardArg = process.argv.indexOf("--shard");
if (shardArg !== -1) {
  runShard(Number(process.argv[shardArg + 1]), Number(process.argv[shardArg + 2]));
} else {
  runMain().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
