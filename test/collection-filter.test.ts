import { describe, it, expect } from "vitest";
import { collectionIds } from "@/lib/paints/collection-filter";
import type { PaintStatus } from "@/lib/supabase/types";

const entries = new Map<string, PaintStatus>([
  ["a", "owned"],
  ["b", "wishlist"],
  ["c", "owned"],
]);

describe("collectionIds", () => {
  it("is null when the filter is off", () => {
    expect(collectionIds(entries, "")).toBeNull();
  });

  it("narrows to owned, or to owned plus wishlist", () => {
    expect([...collectionIds(entries, "owned")!].sort()).toEqual(["a", "c"]);
    expect([...collectionIds(entries, "collection")!].sort()).toEqual(["a", "b", "c"]);
  });

  it("returns the same set for the same map, and a fresh one after a toggle", () => {
    // Keyed on the provider map's identity: the provider keeps the map across
    // navigations and replaces it on every change.
    expect(collectionIds(entries, "owned")).toBe(collectionIds(entries, "owned"));
    const toggled = new Map(entries).set("b", "owned");
    expect(collectionIds(toggled, "owned")).not.toBe(collectionIds(entries, "owned"));
    expect(collectionIds(toggled, "owned")!.has("b")).toBe(true);
  });
});
