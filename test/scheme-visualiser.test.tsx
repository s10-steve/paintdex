/**
 * @vitest-environment jsdom
 *
 * The one place in the app where a bug destroys user data: what the visualiser
 * does with the editor's current scheme when a user signs in.
 *
 * The *decision* is pure and covered in `scheme.test.ts` (`planSignInScheme`).
 * These tests cover the *wiring* around it, which no pure test can reach:
 *
 * - a scheme built while signed out is adopted as a NEW row, and the editor
 *   keeps showing it rather than being overwritten by a saved scheme;
 * - `skipSaveRef` suppresses the debounced autosave immediately after a
 *   programmatic load, so we don't write back what we just fetched;
 * - signing out drops the server state and leaves the localStorage path intact.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { SchemeRow } from "@/lib/supabase/types";
import type { Scheme } from "@/lib/scheme/types";
import { toExportShape } from "@/lib/scheme/io";
import { canonicalScheme } from "@/lib/scheme/sync";

const STORE = "paintdex-scheme-v1";

/* ---- mocks ------------------------------------------------------------- */

// The auth session, driven per-test. `useAuth` is read on every render, so
// flipping this and re-rendering is how we simulate sign-in / sign-out.
let currentUser: { id: string } | null = null;

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

// Never fetch the catalogue in tests; the paint picker isn't under test here.
vi.mock("@/hooks/use-browse-index", () => ({
  useBrowseIndex: () => ({ paints: [], loadError: false, loading: false }),
}));

const listSchemes = vi.fn<(userId: string) => Promise<SchemeRow[]>>();
const createScheme = vi.fn();
const updateScheme = vi.fn();
const schemeExists = vi.fn<(id: string) => Promise<boolean>>();

vi.mock("@/lib/data/schemes", () => ({
  listSchemes: (...args: unknown[]) => listSchemes(...(args as [string])),
  createScheme: (...args: unknown[]) => createScheme(...args),
  updateScheme: (...args: unknown[]) => updateScheme(...args),
  schemeExists: (...args: unknown[]) => schemeExists(...(args as [string])),
  renameScheme: vi.fn(),
  deleteScheme: vi.fn(),
  publishScheme: vi.fn(),
  unpublishScheme: vi.fn(),
}));

// Whether the browser's session is still valid. A write matching no rows means
// "deleted elsewhere" ONLY if this says yes — a lapsed session produces exactly
// the same empty result under RLS.
const hasLiveSession = vi.fn<() => Promise<boolean>>();
vi.mock("@/lib/supabase/session", () => ({
  hasLiveSession: () => hasLiveSession(),
}));

// Imported after the mocks are registered.
const { SchemeVisualiser } = await import("@/components/scheme-visualiser");

/* ---- helpers ----------------------------------------------------------- */

function scheme(title: string, elementName = "Armour"): Scheme {
  return {
    title,
    elements: [
      {
        id: "e1",
        name: elementName,
        paints: [
          {
            id: "p1",
            name: "Leadbelcher",
            brand: "Citadel",
            range: "Base",
            hex: "#6B6F72",
            role: "base",
          },
        ],
      },
    ],
  };
}

function row(id: string, title: string, data: Scheme, updated: string): SchemeRow {
  return {
    id,
    user_id: "u1",
    title,
    data: toExportShape(data),
    is_public: false,
    share_slug: null,
    share_token_hash: null,
    created_at: updated,
    updated_at: updated,
  } as SchemeRow;
}

/** The scheme-name input doubles as a read-out of what the editor holds. */
const editorTitle = () => (screen.getByLabelText("Scheme name") as HTMLInputElement).value;

/** Seed localStorage the way the signed-out autosave would have left it. */
function seedLocal(s: Scheme) {
  localStorage.setItem(STORE, JSON.stringify({ scheme: s, blend: true }));
}

/**
 * Seed localStorage the way a signed-in session would have left it: the document
 * plus a binding saying which row it came from and what we last had in sync with
 * it. `synced` defaults to the document itself (nothing unflushed).
 */
function seedBound(s: Scheme, id: string, opts: { userId?: string; synced?: Scheme } = {}) {
  localStorage.setItem(
    STORE,
    JSON.stringify({
      scheme: s,
      blend: true,
      binding: {
        id,
        userId: opts.userId ?? "u1",
        syncedCanon: canonicalScheme(opts.synced ?? s),
      },
    }),
  );
}

const storedBinding = () => JSON.parse(localStorage.getItem(STORE) ?? "{}").binding ?? null;

beforeEach(() => {
  currentUser = null;
  localStorage.clear();
  listSchemes.mockReset();
  createScheme.mockReset();
  updateScheme.mockReset();
  schemeExists.mockReset();
  createScheme.mockImplementation(async (_uid: string, data: unknown, title: string) =>
    row("new-row", title, scheme(title), "2026-01-03T00:00:00.000Z"),
  );
  updateScheme.mockResolvedValue({ matched: true });
  schemeExists.mockResolvedValue(true);
  hasLiveSession.mockReset();
  hasLiveSession.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * Render with a session already in place — a cold load of a signed-in browser,
 * which is what every multi-device case actually is. Deliberately *not*
 * `renderThenSignIn`: rendering signed out first clears the binding (that's what
 * signing out does), which is the very state under test here.
 */
async function renderSignedIn(rows: SchemeRow[]) {
  listSchemes.mockResolvedValue(rows);
  currentUser = { id: "u1" };
  const view = render(<SchemeVisualiser />);
  await waitFor(() => expect(screen.getByLabelText("Scheme name")).toBeTruthy());
  await act(async () => {});
  return view;
}

/** Render signed out, let the localStorage restore effect settle, then sign in. */
async function renderThenSignIn(rows: SchemeRow[]) {
  const view = render(<SchemeVisualiser />);
  await waitFor(() => expect(screen.getByLabelText("Scheme name")).toBeTruthy());
  listSchemes.mockResolvedValue(rows);
  currentUser = { id: "u1" };
  await act(async () => {
    view.rerender(<SchemeVisualiser />);
  });
  return view;
}

/* ---- tests ------------------------------------------------------------- */

describe("SchemeVisualiser sign-in reconciliation", () => {
  it("adopts a scheme built while signed out as a new row, without overwriting the editor", async () => {
    seedLocal(scheme("Ultramarines test"));
    await renderThenSignIn([
      row("saved-1", "Older saved scheme", scheme("Older saved scheme"), "2026-01-02T00:00:00.000Z"),
    ]);

    // The local scheme was not in the saved set, so it must be created…
    await waitFor(() => expect(createScheme).toHaveBeenCalledTimes(1));
    expect(createScheme.mock.calls[0][2]).toBe("Ultramarines test");
    expect(createScheme.mock.calls[0][1]).toEqual(toExportShape(scheme("Ultramarines test")));

    // …and the editor must still show the user's work, not the saved scheme.
    expect(editorTitle()).toBe("Ultramarines test");
  });

  it("adopts local work for a brand-new user with no saved schemes", async () => {
    seedLocal(scheme("First scheme"));
    await renderThenSignIn([]);

    await waitFor(() => expect(createScheme).toHaveBeenCalledTimes(1));
    expect(createScheme.mock.calls[0][2]).toBe("First scheme");
    expect(editorTitle()).toBe("First scheme");
  });

  it("loads the most recent saved scheme when the editor is blank", async () => {
    await renderThenSignIn([
      row("saved-2", "Newest", scheme("Newest"), "2026-01-05T00:00:00.000Z"),
      row("saved-1", "Older", scheme("Older"), "2026-01-01T00:00:00.000Z"),
    ]);

    await waitFor(() => expect(editorTitle()).toBe("Newest"));
    expect(createScheme).not.toHaveBeenCalled();
  });

  it("does not re-create a scheme that is already saved", async () => {
    const built = scheme("Already saved");
    seedLocal(built);
    await renderThenSignIn([row("saved-1", "Already saved", built, "2026-01-02T00:00:00.000Z")]);

    await waitFor(() => expect(editorTitle()).toBe("Already saved"));
    expect(createScheme).not.toHaveBeenCalled();
  });
});

/**
 * The reported multi-device bugs. All three used to end the same way — a second
 * copy of the scheme in the account — because the local document had no way to
 * say which saved row it was.
 */
describe("SchemeVisualiser multi-device reconciliation", () => {
  it("does not re-create a scheme deleted on another device", async () => {
    seedBound(scheme("Deleted on the phone"), "row-1");
    await renderSignedIn([]);

    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByRole("status").textContent).toMatch(/deleted on another device/i);
    // The bug: the local copy no longer matched anything saved, so it was
    // inserted as a new row and the delete undid itself.
    expect(createScheme).not.toHaveBeenCalled();
    expect(editorTitle()).toBe("");
    expect(storedBinding()).toBeNull();
  });

  /**
   * The banner is `fixed` and outside the poster studio, which is a `fixed
   * inset-0` modal on the same stacking layer whose Tab handler cycles within its
   * own subtree. Left rendered, it painted over the modal and put Dismiss on
   * screen with no keyboard route to it.
   */
  it("hides the notice while the share-image studio is open, and brings it back", async () => {
    // A survivor, so the editor holds a scheme with elements — "Create shareable
    // image" is disabled for an empty one.
    seedBound(scheme("Deleted on the phone"), "row-1");
    await renderSignedIn([
      row("row-2", "Still here", scheme("Still here"), "2026-01-04T00:00:00.000Z"),
    ]);
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create shareable image" }));
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();

    // `notice` is state, not something the studio consumed.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    });
    expect(screen.getByRole("status").textContent).toMatch(/deleted on another device/i);
  });

  it("opens the most recent survivor when the bound scheme was deleted", async () => {
    seedBound(scheme("Deleted on the phone"), "row-1");
    await renderSignedIn([
      row("row-2", "Still here", scheme("Still here"), "2026-01-04T00:00:00.000Z"),
    ]);

    await waitFor(() => expect(editorTitle()).toBe("Still here"));
    expect(createScheme).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toMatch(/deleted on another device/i);
    expect(storedBinding()?.id).toBe("row-2");
  });

  it("takes a rename made on another device instead of duplicating the scheme", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const doc = scheme("Old name");
    seedBound(doc, "row-1");
    await renderSignedIn([row("row-1", "Renamed on the phone", doc, "2026-01-04T00:00:00.000Z")]);

    await waitFor(() => expect(editorTitle()).toBe("Renamed on the phone"));
    expect(createScheme).not.toHaveBeenCalled();
    // …and the stale title must not be written back over the rename.
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(updateScheme).not.toHaveBeenCalled();
  });

  it("keeps local edits that never reached the server, and pushes them to the same row", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const saved = scheme("Saved copy");
    const unflushed = scheme("Edited just before the tab closed");
    // `synced` is what we last wrote; the document has moved on since.
    seedBound(unflushed, "row-1", { synced: saved });
    await renderSignedIn([row("row-1", "Saved copy", saved, "2026-01-04T00:00:00.000Z")]);

    await waitFor(() => expect(editorTitle()).toBe("Edited just before the tab closed"));
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    // Pushed to the bound row — no new row, and nothing lost.
    expect(createScheme).not.toHaveBeenCalled();
    expect(updateScheme).toHaveBeenCalledTimes(1);
    expect(updateScheme.mock.calls[0][0]).toBe("row-1");
    expect(updateScheme.mock.calls[0][2]).toBe("Edited just before the tab closed");
  });

  it("does not autosave before reconciliation has resolved", async () => {
    // The window this closes: a restored binding arms the autosave, and a save
    // that lands before the row list does pushes a stale copy over a rename.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const doc = scheme("Local copy");
    seedBound(doc, "row-1");

    let release!: (rows: SchemeRow[]) => void;
    listSchemes.mockImplementation(() => new Promise((res) => (release = res)));

    const view = render(<SchemeVisualiser />);
    await waitFor(() => expect(screen.getByLabelText("Scheme name")).toBeTruthy());
    currentUser = { id: "u1" };
    await act(async () => {
      view.rerender(<SchemeVisualiser />);
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(updateScheme).not.toHaveBeenCalled();

    await act(async () => {
      release([row("row-1", "Renamed on the phone", doc, "2026-01-04T00:00:00.000Z")]);
    });
    await waitFor(() => expect(editorTitle()).toBe("Renamed on the phone"));
  });

  it("reports a scheme deleted mid-edit instead of re-creating it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const doc = scheme("Being edited");
    seedBound(doc, "row-1");
    await renderSignedIn([row("row-1", "Being edited", doc, "2026-01-04T00:00:00.000Z")]);
    await waitFor(() => expect(editorTitle()).toBe("Being edited"));

    // Deleted elsewhere: the write matches no row, and it really is gone.
    updateScheme.mockResolvedValue({ matched: false });
    schemeExists.mockResolvedValue(false);
    listSchemes.mockResolvedValue([]);

    const input = screen.getByLabelText("Scheme name") as HTMLInputElement;
    await act(async () => {
      input.focus();
      fireEvent.change(input, { target: { value: "Being edited!" } });
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(createScheme).not.toHaveBeenCalled();
    expect(storedBinding()).toBeNull();
  });

  it("does not claim a deletion when the session has lapsed", async () => {
    // The ambiguity that makes `schemeExists` alone insufficient: an anon-key
    // request has `auth.uid() = null`, so RLS matches none of our rows and a
    // live scheme reads back exactly like a deleted one. Only the session check
    // separates them — without it this blanks a scheme that is alive and well.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const doc = scheme("Alive and well");
    seedBound(doc, "row-1");
    await renderSignedIn([row("row-1", "Alive and well", doc, "2026-01-04T00:00:00.000Z")]);
    await waitFor(() => expect(editorTitle()).toBe("Alive and well"));

    updateScheme.mockResolvedValue({ matched: false });
    // Same empty answer a deletion gives — the row is invisible either way.
    schemeExists.mockResolvedValue(false);
    hasLiveSession.mockResolvedValue(false);

    const input = screen.getByLabelText("Scheme name") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "Alive and well!" } });
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByRole("status")).toBeNull();
    expect(storedBinding()?.id).toBe("row-1");
    expect(editorTitle()).toBe("Alive and well!");
    expect(createScheme).not.toHaveBeenCalled();
  });

  it("does not clobber a scheme selected while a save was in flight", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const doc = scheme("First");
    seedBound(doc, "row-1");
    await renderSignedIn([
      row("row-1", "First", doc, "2026-01-04T00:00:00.000Z"),
      row("row-2", "Second", scheme("Second"), "2026-01-03T00:00:00.000Z"),
    ]);
    await waitFor(() => expect(editorTitle()).toBe("First"));

    // A write that will come back "deleted", released only after the user has
    // moved on to another scheme.
    let finish!: (v: { matched: boolean }) => void;
    updateScheme.mockImplementation(() => new Promise((res) => (finish = res)));
    schemeExists.mockResolvedValue(false);
    // Deliberately headed by a row the user did NOT pick: an ungated completion
    // would open this one, so the assertion can tell the two apart.
    listSchemes.mockResolvedValue([
      row("row-3", "Third", scheme("Third"), "2026-01-05T00:00:00.000Z"),
      row("row-2", "Second", scheme("Second"), "2026-01-03T00:00:00.000Z"),
    ]);

    const input = screen.getByLabelText("Scheme name") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "First edited" } });
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // Switch schemes while that write is still out.
    await act(async () => {
      fireEvent.change(screen.getByLabelText("My schemes"), { target: { value: "row-2" } });
    });
    await waitFor(() => expect(editorTitle()).toBe("Second"));

    await act(async () => {
      finish({ matched: false });
    });

    // The stale completion must not swap the editor out from under them.
    expect(editorTitle()).toBe("Second");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("discards refetched rows that a save has already overtaken", async () => {
    const doc = scheme("Before");
    seedBound(doc, "row-1");
    await renderSignedIn([row("row-1", "Before", doc, "2026-01-04T00:00:00.000Z")]);
    await waitFor(() => expect(editorTitle()).toBe("Before"));

    // The refetch is in flight when a save lands. Its rows predate that write,
    // and the write moved `syncedCanon` on, so applying them would look "clean"
    // and quietly replace the visible edits with the pre-save copy.
    let releaseRows!: (rows: SchemeRow[]) => void;
    listSchemes.mockImplementation(() => new Promise((res) => (releaseRows = res)));
    vi.setSystemTime(Date.now() + 60_000);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    const input = screen.getByLabelText("Scheme name") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "Edited after the refetch started" } });
    });
    await waitFor(() => expect(updateScheme).toHaveBeenCalled());

    await act(async () => {
      releaseRows([row("row-1", "Before", doc, "2026-01-04T00:00:00.000Z")]);
    });

    expect(editorTitle()).toBe("Edited after the refetch started");
  });

  it("asks only for the signed-in user's own rows", async () => {
    // RLS ORs "select own" with "select public", so an unfiltered query also
    // returns strangers' published schemes — which would then be reconciled
    // against, and could be the row opened after a deletion.
    seedBound(scheme("Mine"), "row-1");
    await renderSignedIn([row("row-1", "Mine", scheme("Mine"), "2026-01-04T00:00:00.000Z")]);
    await waitFor(() => expect(listSchemes).toHaveBeenCalledWith("u1"));
  });

  it("keeps saving when a write matches no row but the scheme still exists", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const doc = scheme("Still there");
    seedBound(doc, "row-1");
    await renderSignedIn([row("row-1", "Still there", doc, "2026-01-04T00:00:00.000Z")]);
    await waitFor(() => expect(editorTitle()).toBe("Still there"));

    updateScheme.mockResolvedValue({ matched: false });
    schemeExists.mockResolvedValue(true);

    const input = screen.getByLabelText("Scheme name") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "Still there!" } });
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByRole("status")).toBeNull();
    expect(storedBinding()?.id).toBe("row-1");
    expect(editorTitle()).toBe("Still there!");
  });

  it("ignores a binding left by a different account on the same browser", async () => {
    const doc = scheme("u1's scheme");
    seedBound(doc, "row-1", { userId: "u1" });
    currentUser = null;
    localStorage.setItem(
      STORE,
      JSON.stringify({
        scheme: doc,
        blend: true,
        binding: { id: "row-1", userId: "u1", syncedCanon: canonicalScheme(doc) },
      }),
    );

    // A cold load as u2, with u1's binding still in this browser's storage.
    listSchemes.mockResolvedValue([
      row("row-9", "u2's own", scheme("u2's own"), "2026-01-04T00:00:00.000Z"),
    ]);
    currentUser = { id: "u2" };
    render(<SchemeVisualiser />);
    await waitFor(() => expect(screen.getByLabelText("Scheme name")).toBeTruthy());
    await act(async () => {});

    // u2's rows say nothing about u1's binding: no "deleted" claim, and the
    // content path adopts the visible work as u2's own new scheme.
    await waitFor(() => expect(createScheme).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("picks up another device's changes when the tab regains focus", async () => {
    const doc = scheme("Before");
    seedBound(doc, "row-1");
    await renderSignedIn([row("row-1", "Before", doc, "2026-01-04T00:00:00.000Z")]);
    await waitFor(() => expect(editorTitle()).toBe("Before"));

    listSchemes.mockClear();
    listSchemes.mockResolvedValue([
      row("row-1", "Renamed on the phone", doc, "2026-01-05T00:00:00.000Z"),
    ]);
    // The refetch is throttled; the initial load counts as the last one.
    vi.setSystemTime(Date.now() + 60_000);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(editorTitle()).toBe("Renamed on the phone"));

    // Throttled: a second focus straight after doesn't re-query.
    listSchemes.mockClear();
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(listSchemes).not.toHaveBeenCalled();
  });

  it("leaves the editor alone on refocus when it holds unsaved edits", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const doc = scheme("Before");
    seedBound(doc, "row-1");
    await renderSignedIn([row("row-1", "Before", doc, "2026-01-04T00:00:00.000Z")]);
    await waitFor(() => expect(editorTitle()).toBe("Before"));

    const input = screen.getByLabelText("Scheme name") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "Mid-sentence" } });
    });

    listSchemes.mockResolvedValue([
      row("row-1", "Renamed on the phone", doc, "2026-01-05T00:00:00.000Z"),
    ]);
    vi.advanceTimersByTime(60_000);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Typing must not be yanked out from under the user by a background refresh.
    expect(editorTitle()).toBe("Mid-sentence");
  });
});

describe("SchemeVisualiser autosave suppression", () => {
  it("does not write back a scheme it has just loaded", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderThenSignIn([
      row("saved-1", "Loaded scheme", scheme("Loaded scheme"), "2026-01-02T00:00:00.000Z"),
    ]);
    await waitFor(() => expect(editorTitle()).toBe("Loaded scheme"));

    // Past the 1s autosave debounce with no user edit in between.
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(updateScheme).not.toHaveBeenCalled();
  });

  it("does not write back a scheme it has just adopted", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    seedLocal(scheme("Adopted"));
    await renderThenSignIn([
      row("saved-1", "Something else", scheme("Something else"), "2026-01-02T00:00:00.000Z"),
    ]);
    await waitFor(() => expect(createScheme).toHaveBeenCalledTimes(1));

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(updateScheme).not.toHaveBeenCalled();
  });
});

describe("SchemeVisualiser sign-out", () => {
  it("keeps the editor and localStorage intact when the user signs out", async () => {
    seedLocal(scheme("Still mine"));
    const view = await renderThenSignIn([]);
    await waitFor(() => expect(createScheme).toHaveBeenCalledTimes(1));

    currentUser = null;
    await act(async () => {
      view.rerender(<SchemeVisualiser />);
    });

    expect(editorTitle()).toBe("Still mine");
    const stored = JSON.parse(localStorage.getItem(STORE) ?? "{}");
    expect(stored.scheme.title).toBe("Still mine");
    // The binding goes — it belongs to a session that has ended — but the
    // document stays, so signed-out editing carries on as it always did.
    expect(stored.binding ?? null).toBeNull();
  });
});
