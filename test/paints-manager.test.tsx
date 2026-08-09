/**
 * @vitest-environment jsdom
 *
 * `/my-paints`.
 *
 * The page is a join: the database stores catalogue ids and nothing else, so
 * every name, brand and swatch here comes from the browse index at render time.
 * That makes two things worth pinning that a simpler list wouldn't need — that
 * an id with no paint behind it any more still gets a row and a Remove button
 * rather than vanishing from a count that then doesn't add up, and that a
 * discontinued paint you own is *not* filtered out, since the catalogue-wide
 * default would hide it and there's no visible control to explain that.
 *
 * The rest is the manager's own behaviour: moving between the two lists,
 * removing, and filtering.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";
import type { BrowsePaint } from "@/lib/paints/types";
import type { PaintStatus } from "@/lib/supabase/types";

let currentUser: { id: string } | null = { id: "user-1" };

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    configured: true,
    googleEnabled: true,
    gisReady: true,
    session: currentUser ? {} : null,
    user: currentUser,
    loading: false,
    signOut: async () => {},
  }),
}));

const paint = (
  id: string,
  name: string,
  brand: string,
  extra: Partial<BrowsePaint> = {},
): BrowsePaint =>
  ({
    id,
    name,
    brand,
    range: "Base",
    type: "base",
    hex: "#123456",
    discontinued: false,
    family: "blue",
    l: 40,
    ...extra,
  }) as BrowsePaint;

// Hexes are coherent with the families and L* values here, because the display
// options derive hue and chroma from them.
const CATALOGUE: BrowsePaint[] = [
  paint("citadel-abaddon-black", "Abaddon Black", "Citadel", {
    hex: "#231f20",
    family: "neutral",
    l: 8,
  }),
  paint("vallejo-white", "Vallejo White", "Vallejo", {
    hex: "#f2f2f0",
    family: "neutral",
    l: 95,
  }),
  paint("citadel-mephiston", "Mephiston Red", "Citadel", {
    hex: "#960c0c",
    family: "red",
    l: 30,
  }),
  paint("citadel-boltgun", "Boltgun Metal", "Citadel", { discontinued: true }),
];

vi.mock("@/hooks/use-browse-index", () => ({
  useBrowseIndex: () => ({ paints: CATALOGUE, loadError: false, loading: false }),
}));

let entries = new Map<string, PaintStatus>();
const setStatus = vi.fn();
const remove = vi.fn();
const reload = vi.fn();

vi.mock("@/components/collection/collection-provider", () => ({
  useCollection: () => ({
    enabled: true,
    ready: true,
    statusOf: (id: string) => entries.get(id) ?? null,
    entries,
    setStatus: (...a: unknown[]) => setStatus(...a),
    remove: (...a: unknown[]) => remove(...a),
    reload: (...a: unknown[]) => reload(...a),
    error: null,
    dismissError: () => {},
  }),
}));

vi.mock("@/lib/data/paint-collection", () => ({
  listCollection: vi.fn(),
  setPaintStatus: vi.fn(),
  removePaint: vi.fn(),
  importCollection: vi.fn(),
  clearCollection: vi.fn(),
}));

const { PaintsManager } = await import("@/components/profile/paints-manager");

const ownedSection = () => screen.getByRole("region", { name: "Paints you own" });
const wishlistSection = () => screen.getByRole("region", { name: "Wishlist" });

beforeEach(() => {
  currentUser = { id: "user-1" };
  entries = new Map();
  setStatus.mockReset();
  remove.mockReset();
  reload.mockReset();
});

afterEach(() => cleanup());

describe("empty state", () => {
  it("points at the browse grid when nothing is saved", () => {
    render(<PaintsManager />);
    expect(screen.getByText("No paints yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Browse paints" }).getAttribute("href")).toBe(
      "/paints",
    );
  });
});

describe("the two lists", () => {
  beforeEach(() => {
    entries = new Map([
      ["citadel-abaddon-black", "owned"],
      ["vallejo-white", "wishlist"],
    ]);
  });

  it("puts each paint under its own list", () => {
    render(<PaintsManager />);
    expect(within(ownedSection()).getByText("Abaddon Black")).toBeTruthy();
    expect(within(wishlistSection()).getByText("Vallejo White")).toBeTruthy();
    expect(within(ownedSection()).queryByText("Vallejo White")).toBeNull();
  });

  it("moves an owned paint to the wishlist", async () => {
    render(<PaintsManager />);
    await act(async () =>
      screen.getByLabelText("Move to wishlist: Abaddon Black").click(),
    );
    expect(setStatus).toHaveBeenCalledWith("citadel-abaddon-black", "wishlist");
  });

  it("moves a wishlisted paint to owned", async () => {
    render(<PaintsManager />);
    await act(async () => screen.getByLabelText("Move to owned: Vallejo White").click());
    expect(setStatus).toHaveBeenCalledWith("vallejo-white", "owned");
  });

  it("removes a paint", async () => {
    render(<PaintsManager />);
    await act(async () =>
      screen.getByLabelText("Remove Abaddon Black from your collection").click(),
    );
    expect(remove).toHaveBeenCalledWith("citadel-abaddon-black");
  });
});

describe("paints the catalogue no longer has", () => {
  it("shows the raw id with a Remove button rather than dropping it", async () => {
    entries = new Map([["some-brand-gone-2011", "owned"]]);
    render(<PaintsManager />);

    expect(screen.getByText("some-brand-gone-2011")).toBeTruthy();
    expect(screen.getByText("No longer in the catalogue")).toBeTruthy();

    await act(async () =>
      screen.getByLabelText("Remove some-brand-gone-2011 from your collection").click(),
    );
    expect(remove).toHaveBeenCalledWith("some-brand-gone-2011");
  });

  it("counts it, so the heading matches what's on screen", () => {
    entries = new Map([
      ["citadel-abaddon-black", "owned"],
      ["some-brand-gone-2011", "owned"],
    ]);
    render(<PaintsManager />);
    expect(within(ownedSection()).getByRole("heading").textContent).toContain("(2)");
  });
});

describe("discontinued paints", () => {
  it("shows one you own", () => {
    // `filterPaints` hides discontinued paints by default, which is right for
    // browsing and wrong here: this is a record of what you have, and the
    // control that would explain their absence is deliberately not rendered.
    entries = new Map([["citadel-boltgun", "owned"]]);
    render(<PaintsManager />);
    expect(within(ownedSection()).getByText("Boltgun Metal")).toBeTruthy();
  });
});

describe("filtering", () => {
  beforeEach(() => {
    entries = new Map([
      ["citadel-abaddon-black", "owned"],
      ["vallejo-white", "owned"],
    ]);
  });

  it("narrows both lists by search text", () => {
    render(<PaintsManager />);
    fireEvent.change(screen.getByPlaceholderText("Search your paints"), {
      target: { value: "abaddon" },
    });

    expect(within(ownedSection()).getByText("Abaddon Black")).toBeTruthy();
    expect(within(ownedSection()).queryByText("Vallejo White")).toBeNull();
  });

  it("narrows by brand, and offers only the brands actually in the collection", () => {
    render(<PaintsManager />);
    // Offering all forty-odd catalogue brands here would be a list of dead ends.
    expect(screen.getByLabelText("Vallejo")).toBeTruthy();
    expect(screen.queryByLabelText("Army Painter")).toBeNull();

    fireEvent.click(screen.getByLabelText("Vallejo"));
    expect(within(ownedSection()).getByText("Vallejo White")).toBeTruthy();
    expect(within(ownedSection()).queryByText("Abaddon Black")).toBeNull();
  });

  it("says a list is empty because of the filters, not because it's empty", () => {
    render(<PaintsManager />);
    fireEvent.change(screen.getByPlaceholderText("Search your paints"), {
      target: { value: "nothing matches this" },
    });
    expect(within(ownedSection()).getByText("Nothing here matches these filters.")).toBeTruthy();
  });

  it("clears every filter at once", () => {
    render(<PaintsManager />);
    fireEvent.change(screen.getByPlaceholderText("Search your paints"), {
      target: { value: "abaddon" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    expect(within(ownedSection()).getByText("Vallejo White")).toBeTruthy();
  });
});

describe("display options", () => {
  beforeEach(() => {
    entries = new Map([
      ["citadel-abaddon-black", "owned"],
      ["vallejo-white", "owned"],
      ["citadel-mephiston", "owned"],
    ]);
  });

  const listedNames = () =>
    within(ownedSection())
      .getAllByRole("link")
      .map((a) => a.textContent);

  it("opens flat and A–Z, so the page looks the same until you change it", () => {
    render(<PaintsManager />);
    // One heading per section: the group headings are the only other headings
    // this page can grow, and grouping is off by default.
    expect(within(ownedSection()).getAllByRole("heading")).toHaveLength(1);
    expect(listedNames()).toEqual(["Abaddon Black", "Mephiston Red", "Vallejo White"]);
  });

  it("adds a heading per brand when grouping by brand", () => {
    render(<PaintsManager />);
    fireEvent.click(screen.getByLabelText("Brand"));

    const headings = within(ownedSection())
      .getAllByRole("heading")
      .map((h) => h.textContent);
    expect(headings[1]).toContain("Citadel");
    expect(headings[1]).toContain("(2)");
    expect(headings[2]).toContain("Vallejo");
    expect(headings[2]).toContain("(1)");
  });

  it("nests two axes, outermost first ticked", () => {
    render(<PaintsManager />);
    fireEvent.click(screen.getByLabelText("Brand"));
    fireEvent.click(screen.getByLabelText("Range"));

    const owned = ownedSection();
    expect(within(owned).getByRole("heading", { level: 3, name: /Citadel/ })).toBeTruthy();
    // Every fixture paint is in the "Base" range, so the inner headings are the
    // ranges within each brand.
    expect(within(owned).getAllByRole("heading", { level: 4 }).length).toBe(2);
  });

  it("stops at two axes rather than becoming a tree", () => {
    render(<PaintsManager />);
    fireEvent.click(screen.getByLabelText("Brand"));
    fireEvent.click(screen.getByLabelText("Range"));

    expect((screen.getByLabelText("Type") as HTMLInputElement).disabled).toBe(true);
    // Ticked boxes stay live, so you can always untick to swap one out.
    expect((screen.getByLabelText("Brand") as HTMLInputElement).disabled).toBe(false);

    fireEvent.click(screen.getByLabelText("Brand"));
    expect((screen.getByLabelText("Type") as HTMLInputElement).disabled).toBe(false);
  });

  it("reorders the list when sorting by hue", () => {
    // The two greys are near-neutral, so a hue sort puts the one coloured paint
    // first and collects them after it, dark to light.
    render(<PaintsManager />);
    fireEvent.change(screen.getByLabelText("Sort paints by"), { target: { value: "hue" } });
    expect(listedNames()).toEqual(["Mephiston Red", "Abaddon Black", "Vallejo White"]);
  });

  it("keeps the display options when the filters are cleared", () => {
    // They say how to present the page, not which paints you want — the same
    // split browse makes between its facets and its sort.
    render(<PaintsManager />);
    fireEvent.click(screen.getByLabelText("Brand"));
    fireEvent.change(screen.getByPlaceholderText("Search your paints"), {
      target: { value: "abaddon" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    expect((screen.getByLabelText("Brand") as HTMLInputElement).checked).toBe(true);
    expect(within(ownedSection()).getAllByRole("heading").length).toBeGreaterThan(1);
  });
});

describe("export", () => {
  it("offers a download of the whole collection", () => {
    entries = new Map([["citadel-abaddon-black", "owned"]]);
    render(<PaintsManager />);
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
  });
});
