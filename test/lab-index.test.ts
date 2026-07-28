import { describe, it, expect } from "vitest";
import { withLab } from "@/lib/paints/lab-index";
import { hexToLab } from "@/lib/color";
import type { BrowsePaint } from "@/lib/paints/types";

const paint = (id: string, hex: string): BrowsePaint => ({
  id,
  name: id,
  brand: "B",
  range: "R",
  type: "layer",
  hex,
  discontinued: false,
  family: "red",
  l: 50,
});

describe("withLab", () => {
  it("attaches the Lab triple to every record", () => {
    const input = [paint("a", "#FF0000"), paint("b", "#0000FF")];
    const out = withLab(input);
    expect(out).toHaveLength(2);
    expect(out[0].lab).toEqual(hexToLab("#FF0000"));
    expect(out[1].lab).toEqual(hexToLab("#0000FF"));
  });

  it("keeps the original fields", () => {
    const out = withLab([paint("a", "#FF0000")]);
    expect(out[0].id).toBe("a");
    expect(out[0].family).toBe("red");
    expect(out[0].l).toBe(50);
  });

  it("reuses the same result for the same array", () => {
    // The point of the memo: a paint-to-paint navigation must not re-derive Lab
    // for ~4,900 records, which costs more than the JSON parse the fetch cache
    // already saves. Identity equality is what proves nothing was recomputed.
    const input = [paint("a", "#FF0000")];
    const first = withLab(input);
    const second = withLab(input);
    expect(second).toBe(first);
    expect(second[0]).toBe(first[0]);
  });

  it("gives a different array its own result", () => {
    const a = withLab([paint("a", "#FF0000")]);
    const b = withLab([paint("a", "#FF0000")]);
    expect(b).not.toBe(a);
    expect(b).toEqual(a);
  });

  it("does not mutate the input", () => {
    const input = [paint("a", "#FF0000")];
    withLab(input);
    expect(input[0]).not.toHaveProperty("lab");
  });

  it("handles an empty catalogue", () => {
    expect(withLab([])).toEqual([]);
  });
});
