/**
 * The paint collection's JSON export/import.
 *
 * Two things worth pinning beyond the round trip. The parser is *lenient* by
 * design — one bad row in a hand-edited backup must not cost the user the other
 * four thousand — so the tests state exactly which rows survive that leniency
 * and which don't. And it deliberately does **not** validate ids against the
 * catalogue: an id that has left the catalogue has to round-trip, because
 * `/my-paints` is what tells the user about it, and dropping it here would make
 * a re-import quietly lossy.
 */
import { describe, it, expect } from "vitest";
import {
  COLLECTION_FORMAT,
  MAX_IMPORT_ENTRIES,
  exportCollectionJSON,
  parseCollectionJSON,
  parseCollectionObject,
  toCollectionExport,
  type CollectionEntry,
} from "@/lib/paints/collection-io";

const entries: CollectionEntry[] = [
  { paintId: "citadel-abaddon-black", status: "owned" },
  { paintId: "vallejo-white", status: "wishlist" },
];

describe("toCollectionExport", () => {
  it("stamps the format and app", () => {
    const shape = toCollectionExport(entries);
    expect(shape.format).toBe(COLLECTION_FORMAT);
    expect(shape.app).toBe("paintdex");
  });

  it("round-trips through JSON unchanged", () => {
    expect(parseCollectionJSON(exportCollectionJSON(entries))).toEqual(entries);
  });

  it("round-trips an id that isn't in the catalogue", () => {
    // The whole point: the manager page reports these, so the parser must not
    // quietly eat them. Nothing here imports the catalogue to check.
    const stale = [{ paintId: "some-brand-discontinued-2011", status: "owned" as const }];
    expect(parseCollectionJSON(exportCollectionJSON(stale))).toEqual(stale);
  });
});

describe("parseCollectionJSON", () => {
  it("rejects text that isn't JSON", () => {
    expect(() => parseCollectionJSON("not json")).toThrow(/valid JSON/);
  });

  it("rejects JSON that isn't a collection", () => {
    expect(() => parseCollectionJSON("42")).toThrow(/paint collection/);
    expect(() => parseCollectionJSON('{"title":"a scheme"}')).toThrow(/no paints found/);
  });
});

describe("parseCollectionObject leniency", () => {
  const parse = (paints: unknown[]) => parseCollectionObject({ paints });

  it("drops an entry with an unknown status but keeps its neighbours", () => {
    expect(
      parse([
        { id: "a", status: "owned" },
        { id: "b", status: "maybe" },
        { id: "c", status: "wishlist" },
      ]),
    ).toEqual([
      { paintId: "a", status: "owned" },
      { paintId: "c", status: "wishlist" },
    ]);
  });

  it("drops entries with a missing, non-string or empty id", () => {
    expect(
      parse([
        { status: "owned" },
        { id: 7, status: "owned" },
        { id: "   ", status: "owned" },
        { id: "kept", status: "owned" },
      ]),
    ).toEqual([{ paintId: "kept", status: "owned" }]);
  });

  it("drops an id longer than the column allows", () => {
    // 200 is the database's check constraint; a longer one would fail the
    // insert with an error the user can do nothing about.
    expect(parse([{ id: "x".repeat(201), status: "owned" }])).toEqual([]);
    expect(parse([{ id: "x".repeat(200), status: "owned" }])).toHaveLength(1);
  });

  it("survives entries that aren't objects at all", () => {
    expect(parse([null, "nonsense", 3, { id: "kept", status: "owned" }])).toEqual([
      { paintId: "kept", status: "owned" },
    ]);
  });

  it("trims whitespace around an id", () => {
    expect(parse([{ id: "  padded  ", status: "owned" }])).toEqual([
      { paintId: "padded", status: "owned" },
    ]);
  });

  it("collapses a duplicated id to its last occurrence", () => {
    // What the upsert would do with them anyway, so the count the UI reports
    // matches the number of rows that actually get written.
    expect(
      parse([
        { id: "a", status: "owned" },
        { id: "a", status: "wishlist" },
      ]),
    ).toEqual([{ paintId: "a", status: "wishlist" }]);
  });

  it("caps a hostile file at the import limit", () => {
    const huge = Array.from({ length: MAX_IMPORT_ENTRIES + 500 }, (_, i) => ({
      id: `p${i}`,
      status: "owned" as const,
    }));
    expect(parse(huge)).toHaveLength(MAX_IMPORT_ENTRIES);
  });
});
