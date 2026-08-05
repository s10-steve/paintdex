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
import { useState } from "react";
import { usePoster, LOCAL_POSTER_SCOPE } from "@/hooks/use-poster";
import {
  deleteSchemePhoto,
  downloadSchemePhoto,
  uploadSchemePhoto,
} from "@/lib/data/scheme-photos";
import type { SchemeElement } from "@/lib/scheme/types";

vi.mock("@/lib/data/scheme-photos", () => ({
  schemePhotoPath: (userId: string, schemeId: string) => `${userId}/${schemeId}.jpg`,
  uploadSchemePhoto: vi.fn(async (userId: string, schemeId: string) => `${userId}/${schemeId}.jpg`),
  downloadSchemePhoto: vi.fn(async () => null),
  deleteSchemePhoto: vi.fn(async () => {}),
  signSchemePhoto: vi.fn(async () => null),
}));

const mockUpload = vi.mocked(uploadSchemePhoto);
const mockDownload = vi.mocked(downloadSchemePhoto);
const mockDelete = vi.mocked(deleteSchemePhoto);

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

/**
 * The same, in remote mode, wired the way `scheme-visualiser` wires it: the
 * caller owns `photo_path` and feeds it back in. That loop is the point — it's
 * what tells the hook the upload it just made is the row's photo, so the fetch
 * effect doesn't turn round and download it again.
 */
function remoteHarness(schemeId = "row-1", initialPath: string | null = null) {
  const seen: { current: ReturnType<typeof usePoster> | null } = { current: null };
  const paths: (string | null)[] = [];
  function Probe() {
    const [photoPath, setPhotoPath] = useState(initialPath);
    seen.current = usePoster(elements, schemeId, {
      schemeId,
      userId: "u1",
      photoPath,
      onPhotoPath: (p) => {
        paths.push(p);
        setPhotoPath(p);
      },
    });
    return null;
  }
  render(<Probe />);
  return { seen, paths };
}

const choosePhoto = (seen: { current: ReturnType<typeof usePoster> | null }) =>
  act(async () => {
    await seen.current?.loadPhoto(new File(["x"], "m.jpg", { type: "image/jpeg" }));
  });

let failWritesLargerThan = Infinity;
let realSetItem: typeof Storage.prototype.setItem;

beforeEach(() => {
  localStorage.clear();
  failWritesLargerThan = Infinity;

  // `vi.mock` factory fns aren't spies, so `restoreAllMocks` leaves their call
  // history in place and a later test sees an earlier one's uploads.
  mockUpload.mockClear();
  mockDownload.mockClear();
  mockDelete.mockClear();

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

describe("usePoster remote storage", () => {
  it("uploads a chosen photo and hands the caller its path", async () => {
    const { seen, paths } = remoteHarness();
    await act(async () => {});
    await choosePhoto(seen);

    await waitFor(() => expect(paths).toEqual(["u1/row-1.jpg"]));
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(seen.current?.photo).not.toBeNull();
    expect(seen.current?.error).toBeNull();
  });

  it("does not re-download the photo it just uploaded", async () => {
    // The caller feeds `photo_path` straight back in, so without a guard the
    // fetch effect would immediately pull down the bytes still in memory.
    const { seen } = remoteHarness();
    await act(async () => {});
    await choosePhoto(seen);

    await waitFor(() => expect(mockUpload).toHaveBeenCalled());
    await act(async () => {});
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("keeps the photo in memory, and says so, when the upload fails", async () => {
    mockUpload.mockRejectedValueOnce(new Error("offline"));
    const { seen, paths } = remoteHarness();
    await act(async () => {});
    await choosePhoto(seen);

    await waitFor(() => expect(seen.current?.error).toMatch(/couldn't save that photo/i));
    // The studio stays usable — same posture as the local "too large" path.
    expect(seen.current?.photo).not.toBeNull();
    expect(paths).toEqual([]);
  });

  it("loads the photo the row points at", async () => {
    mockDownload.mockResolvedValueOnce(new Blob(["jpeg-bytes"], { type: "image/jpeg" }));
    const { seen } = remoteHarness("row-1", "u1/row-1.jpg");

    await waitFor(() => expect(seen.current?.photo).not.toBeNull());
    expect(mockDownload).toHaveBeenCalledWith("u1/row-1.jpg");
    expect(seen.current?.photo?.dataUrl).toMatch(/^data:/);
  });

  it("opens empty rather than broken when the object has gone", async () => {
    mockDownload.mockResolvedValueOnce(null);
    const { seen, paths } = remoteHarness("row-1", "u1/row-1.jpg");
    await act(async () => {});

    expect(seen.current?.photo).toBeNull();
    // A row pointing at a missing object isn't something the user can act on.
    expect(seen.current?.error).toBeNull();
    // And "no photo in state" must not be read as "the user removed it" — that
    // is also what every moment before the fetch resolves looks like, so a save
    // effect that acted on it would clear `photo_path` on a slow connection.
    expect(mockDelete).not.toHaveBeenCalled();
    expect(paths).toEqual([]);
  });

  it("moves an existing localStorage photo into the account, then drops the local copy", async () => {
    localStorage.setItem(`${PHOTO}:row-1`, DATA_URL);
    const { seen, paths } = remoteHarness();

    await waitFor(() => expect(paths).toEqual(["u1/row-1.jpg"]));
    expect(seen.current?.photo?.dataUrl).toBe(DATA_URL);
    // Kept in one place, not two — the local copy would spend the quota on a
    // cache nothing reads.
    await waitFor(() => expect(localStorage.getItem(`${PHOTO}:row-1`)).toBeNull());
  });

  it("never writes the photo to localStorage in remote mode", async () => {
    const { seen } = remoteHarness();
    await act(async () => {});
    await choosePhoto(seen);

    await waitFor(() => expect(mockUpload).toHaveBeenCalled());
    expect(localStorage.getItem(`${PHOTO}:row-1`)).toBeNull();
    // The settings still are, though — they never left the device.
    expect(localStorage.getItem(`${SETTINGS}:row-1`)).not.toBeNull();
  });

  it("deletes the object and clears the path when the photo is removed", async () => {
    mockDownload.mockResolvedValueOnce(new Blob(["jpeg-bytes"], { type: "image/jpeg" }));
    const { seen, paths } = remoteHarness("row-1", "u1/row-1.jpg");
    await waitFor(() => expect(seen.current?.photo).not.toBeNull());

    act(() => seen.current?.clearPhoto());

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("u1/row-1.jpg"));
    await waitFor(() => expect(paths).toEqual([null]));
    expect(seen.current?.photo).toBeNull();
  });

  it("issues no delete for a scheme that never had a photo", async () => {
    const { seen } = remoteHarness();
    await act(async () => {});
    act(() => seen.current?.clearPhoto());
    await act(async () => {});

    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("keeps the anchors when the photo is removed", async () => {
    // The two are separate keys precisely so losing one can't cost the other.
    localStorage.setItem(
      `${SETTINGS}:row-1`,
      JSON.stringify({ anchors: { 0: { x: 0.4, y: 0.6 } }, names: ["Armour"] }),
    );
    mockDownload.mockResolvedValueOnce(new Blob(["jpeg-bytes"], { type: "image/jpeg" }));
    const { seen } = remoteHarness("row-1", "u1/row-1.jpg");
    await waitFor(() => expect(seen.current?.photo).not.toBeNull());

    act(() => seen.current?.clearPhoto());
    await act(async () => {});

    expect(seen.current?.anchors).toEqual({ 0: { x: 0.4, y: 0.6 } });
  });
});
