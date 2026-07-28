import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BROWSE_INDEX_URL,
  fetchBrowseIndex,
  resetBrowseIndexCache,
} from "@/lib/paints/browse-index";

const record = { id: "x", name: "X", brand: "B", range: "R", hex: "#000000" };

const ok = () =>
  vi.fn(async () => ({ ok: true, status: 200, json: async () => [record] }));

beforeEach(() => {
  resetBrowseIndexCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetBrowseIndexCache();
});

describe("fetchBrowseIndex", () => {
  it("fetches the static index asset", async () => {
    const fetchMock = ok();
    vi.stubGlobal("fetch", fetchMock);
    await fetchBrowseIndex();
    expect(fetchMock).toHaveBeenCalledWith(BROWSE_INDEX_URL);
  });

  it("parses the catalogue once and reuses it", async () => {
    // The point of the memo: navigating paint to paint must not re-parse ~4,900
    // records on every hop just to render a filtered panel.
    const fetchMock = ok();
    vi.stubGlobal("fetch", fetchMock);
    const a = await fetchBrowseIndex();
    const b = await fetchBrowseIndex();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
  });

  it("shares a single in-flight request between concurrent callers", async () => {
    const fetchMock = ok();
    vi.stubGlobal("fetch", fetchMock);
    const [a, b] = await Promise.all([fetchBrowseIndex(), fetchBrowseIndex()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("rejects on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, json: async () => [] })),
    );
    await expect(fetchBrowseIndex()).rejects.toThrow("HTTP 503");
  });

  it("does not cache a failure, so one blip offline isn't permanent", async () => {
    const failing = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", failing);
    await expect(fetchBrowseIndex()).rejects.toThrow("offline");

    const recovered = ok();
    vi.stubGlobal("fetch", recovered);
    await expect(fetchBrowseIndex()).resolves.toEqual([record]);
    expect(recovered).toHaveBeenCalledTimes(1);
  });
});
