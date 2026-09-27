/**
 * @vitest-environment jsdom
 *
 * Browse's "Your paints" filter.
 *
 * Split from `paints-browser.test.tsx` because it needs the collection provider
 * mocked, where that suite runs with no provider at all — the same split as
 * `layer-row-collection.test.tsx`.
 *
 * What's pinned is where a per-user filter in a shared URL can go wrong: applied
 * with no collection to apply (an empty grid for a signed-out visitor), applied
 * before the collection has arrived (every paint, then yours), healed out of the
 * URL while signed out (so signing in loses it), or counted differently by the
 * chip, the badge and Clear all.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { BrowsePaint } from "@/lib/paints/types";
import type { PaintStatus } from "@/lib/supabase/types";

let currentParams = new URLSearchParams();
const replaceState = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/paints",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => currentParams,
}));

const paint = (id: string, brand: string, extra: Partial<BrowsePaint> = {}): BrowsePaint =>
  ({
    id,
    name: id,
    brand,
    range: `${brand} Range`,
    type: "layer",
    hex: "#808080",
    discontinued: false,
    family: "red",
    l: 50,
    ...extra,
  }) as BrowsePaint;

const CATALOGUE: BrowsePaint[] = [
  paint("owned-a", "Warhammer"),
  paint("wished-b", "Vallejo"),
  paint("other-c", "Vallejo"),
  paint("owned-old", "Warhammer", { discontinued: true }),
];

vi.mock("@/hooks/use-browse-index", () => ({
  useBrowseIndex: () => ({ paints: CATALOGUE, loadError: false, loading: false }),
}));

let phase: "off" | "loading" | "ready" | "failed" = "ready";
const entries = new Map<string, PaintStatus>([
  ["owned-a", "owned"],
  ["wished-b", "wishlist"],
  ["owned-old", "owned"],
]);
const reload = vi.fn();

vi.mock("@/components/collection/collection-provider", () => ({
  useCollection: () => ({
    enabled: phase !== "off" && phase !== "loading",
    ready: phase === "ready",
    phase,
    statusOf: (id: string) => entries.get(id) ?? null,
    entries,
    setStatus: async () => {},
    remove: async () => {},
    reload: (...a: unknown[]) => reload(...a),
    error: null,
    dismissError: () => {},
  }),
}));

const { PaintsBrowser } = await import("@/components/paints-browser");

const FACETS = {
  brands: ["Warhammer", "Vallejo"],
  ranges: ["Warhammer Range", "Vallejo Range"],
  types: ["layer"],
  families: ["red"],
};

const renderAt = (qs: string) => {
  currentParams = new URLSearchParams(qs);
  return render(<PaintsBrowser {...FACETS} />);
};

const shownIds = () =>
  screen
    .queryAllByRole("link")
    .map((a) => a.getAttribute("href") ?? "")
    .filter((h) => h.startsWith("/paints/"))
    .map((h) => h.slice("/paints/".length).split("?")[0])
    .sort();

const writtenQuery = () => {
  const url = replaceState.mock.calls.at(-1)?.[2] as string | undefined;
  return url?.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
};

beforeEach(() => {
  phase = "ready";
  reload.mockReset();
  replaceState.mockClear();
  vi.spyOn(window.history, "replaceState").mockImplementation(
    replaceState as unknown as typeof window.history.replaceState,
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("?mine= on browse", () => {
  it("shows only your paints, discontinued ones included", () => {
    renderAt("mine=owned");
    expect(shownIds()).toEqual(["owned-a", "owned-old"]);
  });

  it("adds the wishlist for 'Owned or on wishlist'", () => {
    renderAt("mine=collection");
    expect(shownIds()).toEqual(["owned-a", "owned-old", "wished-b"]);
  });

  it("gives the chip, the badge and Clear all the same story", () => {
    renderAt("mine=owned&brand=Warhammer");
    const chips = screen.getAllByRole("button", { name: /^Remove filter:/ });
    // Desktop sidebar + mobile row, two chips each.
    expect(chips.map((c) => c.getAttribute("aria-label"))).toContain(
      "Remove filter: Paints I own",
    );
    expect(screen.getByRole("button", { name: "Filters (2)" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear all" })[0]);
    expect(new URLSearchParams(writtenQuery()).get("mine")).toBeNull();
  });

  it("writes the param from the radio", () => {
    renderAt("");
    fireEvent.click(screen.getAllByLabelText("Paints I own")[0]);
    expect(writtenQuery()).toBe("mine=owned");
  });

  it("hides the discontinued checkbox while it's on, since yours show anyway", () => {
    renderAt("mine=owned");
    expect(screen.queryByLabelText("Include discontinued")).toBeNull();
  });

  it("shows the loading skeleton, not 'No paints', while the collection loads", () => {
    phase = "loading";
    renderAt("mine=owned");
    expect(shownIds()).toEqual([]);
    expect(screen.queryByText(/None of your paints|No paints found/)).toBeNull();
    expect(screen.getByText("Loading paints…")).toBeTruthy();
  });

  it("says so, with a retry, when the collection failed to load", () => {
    phase = "failed";
    renderAt("mine=owned");
    expect(screen.getByText("Couldn’t load your paints")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalled();
  });

  it("is carried but not applied when signed out — and not healed out of the URL", () => {
    phase = "off";
    renderAt("mine=owned");
    // Every live paint, no chip, no radio.
    expect(shownIds()).toEqual(["other-c", "owned-a", "wished-b"]);
    expect(screen.queryByRole("button", { name: "Remove filter: Paints I own" })).toBeNull();
    expect(screen.queryByLabelText("Paints I own")).toBeNull();
    // A heal write that stripped it would lose the filter on sign-in.
    for (const call of replaceState.mock.calls) {
      expect(String(call[2])).toContain("mine=owned");
    }
  });
});
