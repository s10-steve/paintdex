/**
 * @vitest-environment jsdom
 *
 * "Your paints" on a paint page's alternatives panel — "what do I already own
 * that's close to this?".
 *
 * The panel's default render is the precomputed list, and the filter has to
 * leave that alone for everyone it doesn't apply to (signed out) while forcing a
 * client re-rank for everyone it does — the precomputed sixteen can't know whose
 * paints are whose. The plot reads the same candidate set, so it's covered
 * through the hook rather than by laying out marks in jsdom.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, act, renderHook } from "@testing-library/react";
import type { BrowsePaint, Paint } from "@/lib/paints/types";
import type { PaintStatus } from "@/lib/supabase/types";
import { hexToLab } from "@/lib/color";
import { emptySimilarParams } from "@/lib/paints/filter-params";

const bp = (id: string, hex: string, extra: Partial<BrowsePaint> = {}): BrowsePaint =>
  ({
    id,
    name: id,
    brand: "Vallejo",
    range: "Game Color",
    type: "layer",
    hex,
    discontinued: false,
    family: "red",
    l: 40,
    ...extra,
  }) as BrowsePaint;

const CATALOGUE: BrowsePaint[] = [
  bp("target", "#A00000"),
  bp("near-not-mine", "#A20202"),
  bp("mine-close", "#A40404"),
  bp("mine-old", "#A60606", { discontinued: true }),
  bp("wished", "#A80808"),
];

vi.mock("@/hooks/use-browse-index", () => ({
  useBrowseIndex: () => ({ paints: CATALOGUE, loadError: false, loading: false }),
}));

let phase: "off" | "loading" | "ready" | "failed" = "ready";
const entries = new Map<string, PaintStatus>([
  ["mine-close", "owned"],
  ["mine-old", "owned"],
  ["wished", "wishlist"],
]);

vi.mock("@/components/collection/collection-provider", () => ({
  useCollection: () => ({
    enabled: phase === "ready" || phase === "failed",
    ready: phase === "ready",
    phase,
    statusOf: (id: string) => entries.get(id) ?? null,
    entries,
    setStatus: async () => {},
    remove: async () => {},
    reload: async () => {},
    error: null,
    dismissError: () => {},
  }),
}));

const { SimilarColours } = await import("@/components/similar-colours");
const { useSimilarCandidates } = await import("@/hooks/use-similar-candidates");

const target: Paint = { ...CATALOGUE[0], type: "layer" } as Paint;
// The precomputed list the static page ships: deliberately *not* what a
// client re-rank would produce, so the assertions can tell the two apart.
const PRECOMPUTED = [{ paint: CATALOGUE[1] as Paint, distance: 0.5 }];

const at = (qs: string) => window.history.replaceState(null, "", `/paints/target${qs}`);

const renderPanel = async () => {
  render(
    <SimilarColours
      target={target}
      all={PRECOMPUTED}
      brands={["Vallejo"]}
      types={["layer"]}
      ranges={["Game Color"]}
    />,
  );
  await act(async () => {});
};

const listed = () =>
  screen
    .queryAllByRole("link")
    .map((a) => (a.getAttribute("href") ?? "").split("?")[0])
    .filter((h) => h.startsWith("/paints/"))
    .map((h) => h.slice("/paints/".length));

beforeEach(() => {
  phase = "ready";
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  at("");
});

describe("SimilarColours with ?mine=", () => {
  it("re-ranks to your paints only, discontinued included", async () => {
    at("?mine=owned");
    await renderPanel();
    expect(listed()).toEqual(["mine-close", "mine-old"]);
  });

  it("keeps the precomputed list when signed out", async () => {
    phase = "off";
    at("?mine=owned");
    await renderPanel();
    expect(listed()).toEqual(["near-not-mine"]);
    expect(screen.queryByRole("button", { name: "Remove filter: Paints I own" })).toBeNull();
  });

  it("waits for the collection rather than showing everything first", async () => {
    phase = "loading";
    at("?mine=owned");
    await renderPanel();
    expect(listed()).toEqual([]);
    expect(screen.queryByText(/None of your paints/)).toBeNull();
  });

  it("says the collection couldn't load, and how to get the list back", async () => {
    phase = "failed";
    at("?mine=owned");
    await renderPanel();
    expect(screen.getByText(/Couldn’t load your paints to filter by them/)).toBeTruthy();
  });

  it("shows the radio only when the collection is enabled", async () => {
    await renderPanel();
    expect(screen.getAllByLabelText("Paints I own").length).toBeGreaterThan(0);
    cleanup();
    phase = "off";
    await renderPanel();
    expect(screen.queryByLabelText("Paints I own")).toBeNull();
  });
});

describe("the plot's candidates under the collection filter", () => {
  it("are your paints only", () => {
    const { result } = renderHook(() =>
      useSimilarCandidates({
        target,
        targetLab: hexToLab(target.hex),
        filters: { ...emptySimilarParams(), mine: "collection", view: "plot" },
        cutoff: Infinity,
        anyFilter: true,
        inCollection: new Set(["mine-close", "mine-old", "wished"]),
      }),
    );
    expect(result.current.plotCandidates?.map((c) => c.id).sort()).toEqual([
      "mine-close",
      "mine-old",
      "wished",
    ]);
  });

  it("are withheld while the collection is pending", () => {
    const { result } = renderHook(() =>
      useSimilarCandidates({
        target,
        targetLab: hexToLab(target.hex),
        filters: { ...emptySimilarParams(), mine: "owned", view: "plot" },
        cutoff: Infinity,
        anyFilter: true,
        collectionPending: true,
      }),
    );
    expect(result.current.plotCandidates).toBeNull();
    expect(result.current.awaitingData).toBe(true);
  });
});
