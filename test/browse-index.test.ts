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
    // `credentials: "omit"` must match the `crossOrigin="anonymous"` preload on
    // the pages that use this, or the two are different HTTP cache keys and the
    // ~1MB index is downloaded twice.
    expect(fetchMock).toHaveBeenCalledWith(BROWSE_INDEX_URL, { credentials: "omit" });
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

  it("rejects a 200 whose body isn't the index", async () => {
    // A CDN error page that happens to be JSON, an SPA fallback, a truncated
    // deploy. Cast straight to `BrowsePaint[]`, this resolved "successfully"
    // and then threw out of `filterPaints(...)` during render — a white screen,
    // with no error boundary on either page, instead of the "Couldn't load the
    // paint database" state that already exists.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ error: "nope" }) })),
    );
    await expect(fetchBrowseIndex()).rejects.toThrow(/malformed/i);
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
