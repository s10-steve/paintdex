/**
 * `src/lib/paints/load.ts` hardcodes one `import` per brand file, while both
 * build scripts and the data validator `readdirSync` the same directory. They
 * agree today only by coincidence, and the failure when they stop is silent and
 * ugly:
 *
 * `build-browse-index.ts` reads the directory, so a new brand appears in the
 * grid, in facet availability, and in the alternatives panel's re-rank —
 * but `getAllPaints()` wouldn't know about it, so `generateStaticParams` omits
 * those ids, and with `dynamicParams = false` every one of those cards is a
 * hard 404.
 *
 * Hence this drift guard. Adding a brand file means adding its import.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { getAllPaints, getBrands } from "@/lib/paints/load";

const DATA_DIR = join(process.cwd(), "data/paints");

describe("the catalogue matches the data directory", () => {
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));

  it("has at least one brand file to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("loads every brand file that exists on disk", () => {
    // Compared by record count rather than by filename, because a file's name
    // and its `brand` field are allowed to differ (`scale-75.json` holds
    // "Scale75"). Every record in every file must be reachable from
    // `getAllPaints()`.
    const onDisk = files.reduce((n, f) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const rows = require(join(DATA_DIR, f)) as unknown[];
      return n + rows.length;
    }, 0);
    expect(getAllPaints()).toHaveLength(onDisk);
  });

  it("exposes a brand for every file", () => {
    expect(getBrands().length).toBeGreaterThanOrEqual(files.length);
  });
});
