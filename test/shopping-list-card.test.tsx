/**
 * @vitest-environment jsdom
 *
 * The visualiser's "Your paints for this scheme" card. The rules are pinned in
 * `shopping-list.test.ts`; this covers what the card adds — when it renders at
 * all, and that "Add all to wishlist" asks for exactly the paints you haven't
 * got.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import type { BrowsePaint } from "@/lib/paints/types";
import type { Scheme } from "@/lib/scheme/types";
import type { PaintStatus } from "@/lib/supabase/types";

let phase: "off" | "loading" | "ready" | "failed" = "ready";
let entries = new Map<string, PaintStatus>();
const setStatusMany = vi.fn(async () => {});

vi.mock("@/components/collection/collection-provider", () => ({
  useCollection: () => ({
    enabled: phase !== "off" && phase !== "loading",
    ready: phase === "ready",
    phase,
    statusOf: (id: string) => entries.get(id) ?? null,
    entries,
    setStatus: async () => {},
    remove: async () => {},
    setStatusMany: (...a: unknown[]) => setStatusMany(...(a as [])),
    reload: async () => {},
    error: null,
    dismissError: () => {},
  }),
}));

const { ShoppingListCard } = await import("@/components/scheme/shopping-list-card");

const bp = (id: string, name: string, hex: string): BrowsePaint =>
  ({ id, name, brand: "Vallejo", range: "Game Color", type: "opaque", format: "brush", binder: "acrylic", hex, discontinued: false, family: "red", l: 40 }) as BrowsePaint;

const CATALOGUE = [bp("red", "Bloody Red", "#9A0E0E"), bp("white", "Dead White", "#FFFFFF"), bp("blue", "Magic Blue", "#0B5CA8")];

const SCHEME: Scheme = {
  title: "Test",
  elements: [
    {
      id: "e1",
      name: "Armour",
      paints: [
        { id: "p1", name: "Bloody Red", brand: "Vallejo", range: "Game Color", hex: "#9A0E0E", role: "base" },
        { id: "p2", name: "Dead White", brand: "Vallejo", range: "Game Color", hex: "#FFFFFF", role: "highlight" },
        { id: "p3", name: "Magic Blue", brand: "Vallejo", range: "Game Color", hex: "#0B5CA8", role: "layer" },
      ],
    },
  ],
};

beforeEach(() => {
  phase = "ready";
  entries = new Map([["red", "owned"], ["white", "wishlist"]]);
  setStatusMany.mockClear();
});
afterEach(() => cleanup());

describe("ShoppingListCard", () => {
  it("renders nothing signed out", () => {
    phase = "off";
    const { container } = render(<ShoppingListCard scheme={SCHEME} dbPaints={CATALOGUE} loadError={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing for a scheme with no paints", () => {
    const { container } = render(
      <ShoppingListCard scheme={{ title: "", elements: [] }} dbPaints={CATALOGUE} loadError={false} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("waits for the catalogue instead of calling everything unmatched", () => {
    render(<ShoppingListCard scheme={SCHEME} dbPaints={null} loadError={false} />);
    expect(screen.getByText(/Checking this scheme/)).toBeTruthy();
    expect(screen.queryByText("Not in the catalogue")).toBeNull();
  });

  it("summarises the split in the collapsed line", () => {
    render(<ShoppingListCard scheme={SCHEME} dbPaints={CATALOGUE} loadError={false} />);
    expect(screen.getByText("1 owned · 1 on wishlist · 1 to buy")).toBeTruthy();
  });

  it("adds only the paints to buy to the wishlist", async () => {
    render(<ShoppingListCard scheme={SCHEME} dbPaints={CATALOGUE} loadError={false} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add all to wishlist" }));
    });
    expect(setStatusMany).toHaveBeenCalledWith(["blue"], "wishlist");
  });

  it("links each missing paint to the paint page filtered to yours", () => {
    render(<ShoppingListCard scheme={SCHEME} dbPaints={CATALOGUE} loadError={false} />);
    const compare = screen.getAllByRole("link", { name: "Compare with all yours →" });
    expect(compare.map((a) => a.getAttribute("href"))).toContain("/paints/blue?mine=owned");
  });

  it("says so when you already own everything, with no bulk button", () => {
    entries = new Map([["red", "owned"], ["white", "owned"], ["blue", "owned"]]);
    render(<ShoppingListCard scheme={SCHEME} dbPaints={CATALOGUE} loadError={false} />);
    expect(screen.getByText("You own every paint in this scheme.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add all to wishlist" })).toBeNull();
  });
});
