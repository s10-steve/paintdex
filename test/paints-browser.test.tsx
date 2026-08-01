/**
 * @vitest-environment jsdom
 *
 * Browse's URL-derived filter state.
 *
 * This page moved from "the URL mirrors state" to "the URL *is* state": every
 * filter is derived from `useSearchParams()` on each render, and every control
 * writes through `history.replaceState`. Nothing at the component layer covered
 * that — the codec suite can't see it, and `paint-filters-travel.test.tsx`
 * deliberately scopes to `BackToBrowse`/`PaintFacets`. CLAUDE.md records that
 * `router.replace` silently froze this page once, and the failure mode here is an
 * empty grid rather than a degraded one, so it's worth pinning.
 *
 * Scope, stated honestly: the two halves tested here are **ours** — deriving the
 * grid from params, and writing the right URL when a control changes. The join
 * between them (Next re-rendering with a new `useSearchParams` value after a
 * `replaceState`) is framework behaviour; mocking it would be testing the mock, so
 * it is verified in a real browser instead. What this suite can do is drive the
 * resync by hand: re-render with the params the write produced and assert the grid
 * followed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { BrowsePaint } from "@/lib/paints/types";

let currentParams = new URLSearchParams();
const replaceState = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/paints",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => currentParams,
}));

/** A tiny catalogue with one distinguishing feature per record. */
const paint = (
  id: string,
  brand: string,
  type: string,
  family: string,
  extra: Partial<BrowsePaint> = {},
): BrowsePaint =>
  ({
    id,
    name: id,
    brand,
    range: `${brand} Range`,
    type,
    hex: "#808080",
    discontinued: false,
    family,
    l: 50,
    ...extra,
  }) as BrowsePaint;

const CATALOGUE: BrowsePaint[] = [
  paint("citadel-a", "Citadel", "layer", "red"),
  paint("citadel-b", "Citadel", "base", "blue"),
  paint("vallejo-a", "Vallejo", "layer", "red"),
  paint("vallejo-metal", "Vallejo", "metallic", "neutral", { metallic: true }),
  paint("old-paint", "Citadel", "layer", "red", { discontinued: true }),
];

vi.mock("@/hooks/use-browse-index", () => ({
  useBrowseIndex: () => ({ paints: CATALOGUE, loadError: false, loading: false }),
}));

import { PaintsBrowser } from "@/components/paints-browser";

const FACETS = {
  brands: ["Citadel", "Vallejo"],
  ranges: ["Citadel Range", "Vallejo Range"],
  types: ["base", "layer", "metallic"],
  families: ["red", "blue", "neutral"],
};

/** Render at a given query string, the way a real visit would arrive. */
const renderAt = (qs: string) => {
  currentParams = new URLSearchParams(qs);
  return render(<PaintsBrowser {...FACETS} />);
};

/** The ids currently in the grid. */
const shownIds = () =>
  screen
    .getAllByRole("link")
    .map((a) => a.getAttribute("href") ?? "")
    .filter((h) => h.startsWith("/paints/"))
    .map((h) => h.slice("/paints/".length).split("?")[0]);

/** The query string of the most recent replaceState call. */
const writtenQuery = () => {
  const url = replaceState.mock.calls.at(-1)?.[2] as string | undefined;
  return url?.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
};

beforeEach(() => {
  replaceState.mockClear();
  vi.spyOn(window.history, "replaceState").mockImplementation(
    replaceState as unknown as typeof window.history.replaceState,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("deriving the grid from the URL", () => {
  it("shows everything live when no params are set", () => {
    renderAt("");
    // The discontinued paint is excluded by default.
    expect(shownIds().sort()).toEqual([
      "citadel-a",
      "citadel-b",
      "vallejo-a",
      "vallejo-metal",
    ]);
  });

  it("filters by brand", () => {
    renderAt("brand=Citadel");
    expect(shownIds().sort()).toEqual(["citadel-a", "citadel-b"]);
  });

  it("filters by type", () => {
    renderAt("type=layer");
    expect(shownIds().sort()).toEqual(["citadel-a", "vallejo-a"]);
  });

  it("filters by colour family", () => {
    renderAt("family=blue");
    expect(shownIds()).toEqual(["citadel-b"]);
  });

  it("filters by metallic finish, both ways", () => {
    renderAt("metal=1");
    expect(shownIds()).toEqual(["vallejo-metal"]);
    cleanup();
    renderAt("metal=0");
    expect(shownIds()).not.toContain("vallejo-metal");
  });

  it("includes discontinued only when asked", () => {
    renderAt("disc=1");
    expect(shownIds()).toContain("old-paint");
  });

  it("combines facets with AND", () => {
    renderAt("brand=Citadel&type=layer");
    expect(shownIds()).toEqual(["citadel-a"]);
  });

  it("applies the search text from the URL", () => {
    renderAt("q=vallejo-metal");
    expect(shownIds()).toEqual(["vallejo-metal"]);
  });

  it("ignores a brand that has left the catalogue rather than emptying the grid", () => {
    // The ghost-filter case: no checkbox can render for it, so it must not filter.
    renderAt("brand=Gone Paints");
    expect(shownIds().length).toBe(4);
  });

  it("drops a paint type outside the vocabulary", () => {
    renderAt("type=nonsense");
    expect(shownIds().length).toBe(4);
  });
});

describe("writing the URL from the controls", () => {
  it("adds a facet on tick", () => {
    renderAt("");
    fireEvent.click(screen.getByLabelText("Citadel"));
    expect(new URLSearchParams(writtenQuery()).get("brand")).toBe("Citadel");
  });

  it("merges into an existing facet, sorted", () => {
    renderAt("brand=Vallejo");
    fireEvent.click(screen.getByLabelText("Citadel"));
    expect(new URLSearchParams(writtenQuery()).get("brand")).toBe(
      "Citadel,Vallejo",
    );
  });

  it("removes a facet on untick, deleting the param entirely", () => {
    renderAt("brand=Citadel");
    fireEvent.click(screen.getByLabelText("Citadel"));
    expect(new URLSearchParams(writtenQuery()).get("brand")).toBeNull();
  });

  it("writes the finish in the shared 1/0 vocabulary", () => {
    renderAt("");
    fireEvent.click(screen.getByLabelText("Metallic only"));
    expect(new URLSearchParams(writtenQuery()).get("metal")).toBe("1");
  });

  it("preserves a paint page's params when a facet changes", () => {
    renderAt("view=plot&match=2");
    fireEvent.click(screen.getByLabelText("Citadel"));
    const out = new URLSearchParams(writtenQuery());
    expect(out.get("view")).toBe("plot");
    expect(out.get("match")).toBe("2");
  });

  it("keeps sort through Clear all, and drops the filters", () => {
    // The bug this pins: clearAll used to wipe the whole query string, including a
    // sort it never counted as a filter.
    renderAt("brand=Citadel&q=red&family=blue&sort=lightness&view=plot");
    fireEvent.click(screen.getAllByRole("button", { name: "Clear all" })[0]);
    const out = new URLSearchParams(writtenQuery());
    expect(out.get("sort")).toBe("lightness");
    expect(out.get("view")).toBe("plot");
    expect(out.get("brand")).toBeNull();
    expect(out.get("q")).toBeNull();
    expect(out.get("family")).toBeNull();
  });

  it("omits the default sort rather than writing it", () => {
    renderAt("sort=lightness");
    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "name" } });
    expect(new URLSearchParams(writtenQuery()).get("sort")).toBeNull();
  });
});

describe("resync: the grid follows the params the write produced", () => {
  it("re-renders filtered after a facet write", () => {
    renderAt("");
    expect(shownIds().length).toBe(4);

    fireEvent.click(screen.getByLabelText("Citadel"));
    const produced = writtenQuery();

    // Stand in for Next handing back the new useSearchParams value. The point is
    // that the grid is a function of the params, with no separate state to go
    // stale — so re-rendering at the URL the control just wrote is enough.
    cleanup();
    renderAt(produced);
    expect(shownIds().sort()).toEqual(["citadel-a", "citadel-b"]);
  });
});

/**
 * The applied-filter summary. Its whole reason to exist is that the ticks in the
 * sidebar can be scrolled or drawered out of sight, so the two things worth
 * pinning are that a chip appears for what's applied and that removing one
 * writes the same URL unticking the box would.
 */
describe("the active-filter chips", () => {
  /** Chip buttons, identified by the label the component gives them. */
  const chipLabels = () =>
    screen
      .getAllByRole("button", { name: /^Remove filter: / })
      .map((b) => (b.getAttribute("aria-label") ?? "").replace("Remove filter: ", ""));

  it("shows nothing when nothing is filtered", () => {
    renderAt("");
    expect(screen.queryAllByRole("button", { name: /^Remove filter: / })).toEqual([]);
  });

  it("summarises every applied filter, and not sort", () => {
    renderAt("brand=Citadel&type=layer&family=red&metal=1&disc=1&q=ork&sort=lightness");
    // Both sidebar copies are in the DOM at once (desktop `hidden md:block`) plus
    // the mobile row above the grid, so each chip appears more than once — the
    // set is what matters, not the count.
    expect(new Set(chipLabels())).toEqual(
      new Set([
        "Citadel",
        "Red",
        "Layer",
        "Metallic only",
        "Including discontinued",
        "Search: ork",
      ]),
    );
  });

  it("removing a facet chip writes the same URL as unticking the box", () => {
    renderAt("brand=Citadel,Vallejo");
    fireEvent.click(screen.getAllByRole("button", { name: "Remove filter: Citadel" })[0]);
    expect(new URLSearchParams(writtenQuery()).get("brand")).toBe("Vallejo");
  });

  it("removing the finish chip clears only the finish", () => {
    renderAt("brand=Citadel&metal=1");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Remove filter: Metallic only" })[0],
    );
    const out = new URLSearchParams(writtenQuery());
    expect(out.get("metal")).toBeNull();
    expect(out.get("brand")).toBe("Citadel");
  });

  it("removing the search chip empties the box as well as the param", () => {
    // Dropping `q` alone would leave the typed text in the input with a pending
    // debounce about to put it straight back.
    renderAt("q=ork");
    const box = screen.getByLabelText("Search paints") as HTMLInputElement;
    expect(box.value).toBe("ork");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Remove filter: Search: ork" })[0],
    );
    expect(new URLSearchParams(writtenQuery()).get("q")).toBeNull();
    expect(box.value).toBe("");
  });

  it("drops the chip once the grid re-renders at the URL the removal wrote", () => {
    renderAt("brand=Citadel&type=layer");
    fireEvent.click(screen.getAllByRole("button", { name: "Remove filter: Layer" })[0]);
    const produced = writtenQuery();
    cleanup();
    renderAt(produced);
    expect(new Set(chipLabels())).toEqual(new Set(["Citadel"]));
  });
});

/**
 * The mobile chip row and the mobile drawer both render chips, and the drawer is
 * a plain overlay — no `aria-modal`, no focus trap — so both stay in the
 * accessibility tree and the Tab order when it's open. Two identical
 * "Remove filter: X" buttons per chip is the regression this pins.
 */
describe("the mobile chip row and the filters drawer don't double up", () => {
  const removeButtons = (name: string) =>
    screen.queryAllByRole("button", { name: `Remove filter: ${name}` });

  it("shows one chip per filter with the drawer shut", () => {
    renderAt("brand=Citadel");
    // The sidebar copy (`hidden md:block`, so display:none but still queryable
    // by role in jsdom) plus the mobile row.
    expect(removeButtons("Citadel").length).toBe(2);
  });

  it("does not add a third copy when the drawer opens", () => {
    renderAt("brand=Citadel");
    const before = removeButtons("Citadel").length;
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    // The drawer mounts its own sidebar copy; the mobile row steps aside so the
    // total doesn't grow.
    expect(removeButtons("Citadel").length).toBe(before);
  });
});
