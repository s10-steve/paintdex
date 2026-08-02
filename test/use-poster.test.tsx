/**
 * @vitest-environment jsdom
 *
 * `usePoster`'s persistence, which had no coverage and three bugs in it.
 *
 * All three are storage-shaped rather than logic-shaped — a key that isn't
 * written, a key that isn't scoped, an access that throws — so they only show
 * up against a real `localStorage` with a real save/restore cycle. Hence a
 * component test rather than a pure one.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act, cleanup, waitFor } from "@testing-library/react";
import { usePoster, LOCAL_POSTER_SCOPE } from "@/hooks/use-poster";
import type { SchemeElement } from "@/lib/scheme/types";

const SETTINGS = "paintdex-poster-v1";
const PHOTO = "paintdex-poster-photo-v1";

/**
 * A 1×1 GIF. jsdom doesn't decode images, so `Image` is stubbed below and this
 * only ever has to be a distinguishable string.
 */
const DATA_URL = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
const OTHER_URL = "data:image/gif;base64,OTHERPHOTO=";

const elements: SchemeElement[] = [{ id: "e1", name: "Armour", paints: [] }];

/** Renders the hook and exposes its latest return value. */
function harness(scope?: string) {
  const seen: { current: ReturnType<typeof usePoster> | null } = { current: null };
  function Probe() {
    seen.current = usePoster(elements, scope);
    return null;
  }
  render(<Probe />);
  return seen;
}

let failWritesLargerThan = Infinity;
let realSetItem: typeof Storage.prototype.setItem;

beforeEach(() => {
  localStorage.clear();
  failWritesLargerThan = Infinity;

  // jsdom has no image decoder: resolve `onload` on the next tick so the
  // restore path completes, and report a size so `downscale` has something to
  // work with.
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 100;
      naturalHeight = 100;
      set src(_v: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    },
  );

  // jsdom has no canvas backend, so `downscale` would bail to null and the
  // upload path would report "couldn't process that image" before reaching the
  // storage code under test.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    imageSmoothingQuality: "low",
    drawImage: () => {},
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(DATA_URL);

  realSetItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (value.length > failWritesLargerThan) {
      const err = new Error("QuotaExceededError");
      err.name = "QuotaExceededError";
      throw err;
    }
    realSetItem.call(this, key, value);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("usePoster storage scoping", () => {
  it("keeps each scheme's photo and anchors apart", async () => {
    // The bug: two fixed keys meant every scheme shared one photo, and
    // `reconcileAnchors` then matched the old anchors onto any element of the
    // new scheme with the same name — "Armour" being exactly what people reuse.
    localStorage.setItem(`${PHOTO}:row-1`, DATA_URL);
    localStorage.setItem(
      `${SETTINGS}:row-1`,
      JSON.stringify({ anchors: { 0: { x: 0.5, y: 0.5 } }, names: ["Armour"] }),
    );

    const other = harness("row-2");
    await act(async () => {});

    expect(other.current?.photo).toBeNull();
    expect(other.current?.anchors).toEqual({});
  });

  it("loads the scheme's own state back", async () => {
    localStorage.setItem(`${PHOTO}:row-1`, DATA_URL);
    localStorage.setItem(
      `${SETTINGS}:row-1`,
      JSON.stringify({ anchors: { 0: { x: 0.25, y: 0.75 } }, names: ["Armour"] }),
    );

    const own = harness("row-1");
    await waitFor(() => expect(own.current?.photo).not.toBeNull());
    expect(own.current?.photo?.dataUrl).toBe(DATA_URL);
    expect(own.current?.anchors).toEqual({ 0: { x: 0.25, y: 0.75 } });
  });
});

describe("usePoster legacy migration", () => {
  it("copies an unscoped photo into the scoped key so it survives a reload", async () => {
    // Not a fixed bug — the old code did migrate, because the photo effect's
    // `!photo` branch nulls `savedPhotoRef` before the image finishes decoding.
    // That's a load-bearing accident, and scoping the keys gave it a second
    // hop to get wrong, so it's pinned here.
    localStorage.setItem(PHOTO, DATA_URL);

    harness(LOCAL_POSTER_SCOPE);
    await waitFor(() =>
      expect(localStorage.getItem(`${PHOTO}:${LOCAL_POSTER_SCOPE}`)).toBe(DATA_URL),
    );
  });

  it("reads a photo stored inside the pre-split settings blob", async () => {
    localStorage.setItem(SETTINGS, JSON.stringify({ photo: DATA_URL, framing: { zoom: 2 } }));

    const seen = harness(LOCAL_POSTER_SCOPE);
    await waitFor(() => expect(seen.current?.photo?.dataUrl).toBe(DATA_URL));
    expect(seen.current?.framing.zoom).toBe(2);
    await waitFor(() =>
      expect(localStorage.getItem(`${PHOTO}:${LOCAL_POSTER_SCOPE}`)).toBe(DATA_URL),
    );
  });

  it("does not hand the unscoped leftovers to a saved scheme", async () => {
    // Attributing one browser's stray photo to a particular row would be a guess.
    localStorage.setItem(PHOTO, DATA_URL);

    const seen = harness("row-1");
    await act(async () => {});
    expect(seen.current?.photo).toBeNull();
  });
});

describe("usePoster storage failures", () => {
  it("survives a localStorage that throws on every access", async () => {
    // Safari with cookies blocked throws `SecurityError` on reads and removes
    // too, not just writes — two `removeItem` calls used to sit outside the
    // try/catch that guards everything else here.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    const seen = harness("row-1");
    await act(async () => {});

    // No throw escaping the effect, and the studio is usable with no photo.
    expect(seen.current?.photo).toBeNull();
    expect(seen.current?.mounted).toBe(true);
  });

  it("tells the user when a photo is too large to keep", async () => {
    failWritesLargerThan = 10;
    const seen = harness("row-1");
    await act(async () => {});

    await act(async () => {
      await seen.current?.loadPhoto(
        new File(["x"], "m.jpg", { type: "image/jpeg" }),
      );
    });

    // Previously this failed silently and the user found out on reload.
    await waitFor(() => expect(seen.current?.error).toMatch(/too large/i));
    // The photo still works for this session.
    expect(seen.current?.photo).not.toBeNull();
  });

  it("starts clean when the stored photo won't decode", async () => {
    // A truncated data URL is what a partial quota write leaves behind. This
    // used to be an unhandled promise rejection.
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        naturalWidth = 0;
        naturalHeight = 0;
        set src(_v: string) {
          setTimeout(() => this.onerror?.(), 0);
        }
      },
    );
    localStorage.setItem(`${PHOTO}:row-1`, OTHER_URL);

    const seen = harness("row-1");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(seen.current?.photo).toBeNull();
  });
});
