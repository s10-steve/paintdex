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
import { render, screen, act, cleanup, waitFor } from "@testing-library/react";
import type { SchemeRow } from "@/lib/supabase/types";
import type { Scheme } from "@/lib/scheme/types";
import { toExportShape } from "@/lib/scheme/io";

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

const listSchemes = vi.fn<() => Promise<SchemeRow[]>>();
const createScheme = vi.fn();
const updateScheme = vi.fn();

vi.mock("@/lib/data/schemes", () => ({
  listSchemes: (...args: unknown[]) => listSchemes(...(args as [])),
  createScheme: (...args: unknown[]) => createScheme(...args),
  updateScheme: (...args: unknown[]) => updateScheme(...args),
  publishScheme: vi.fn(),
  unpublishScheme: vi.fn(),
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

beforeEach(() => {
  currentUser = null;
  localStorage.clear();
  listSchemes.mockReset();
  createScheme.mockReset();
  updateScheme.mockReset();
  createScheme.mockImplementation(async (_uid: string, data: unknown, title: string) =>
    row("new-row", title, scheme(title), "2026-01-03T00:00:00.000Z"),
  );
  updateScheme.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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
  });
});
