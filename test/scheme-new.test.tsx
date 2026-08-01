/**
 * @vitest-environment jsdom
 *
 * `?new=1` — the "+ New scheme" button on `/my-schemes`.
 *
 * That button used to be a bare link to `/visualiser`, which opens whatever the
 * editor was last holding: nothing in the load path asks for a blank document, so
 * sign-in reconciliation loads the most recently updated scheme and "New scheme"
 * reopens your last one. The cases that matter here:
 *
 * - signed in, exactly ONE new row is created and the editor is blank;
 * - it waits for reconciliation, or it races the load and the autosave — the same
 *   hazard `?preset=` has;
 * - signed out, `localStorage` is the only copy of the visitor's work, so it asks
 *   first and a refusal really does leave it alone;
 * - the param is always stripped, and a URL carrying two of these params settles
 *   on one document rather than fighting over it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, cleanup, waitFor } from "@testing-library/react";
import type { SchemeRow } from "@/lib/supabase/types";
import type { Scheme } from "@/lib/scheme/types";
import { toExportShape } from "@/lib/scheme/io";
import { SCHEME_PRESETS } from "@/lib/scheme/presets";

const STORE = "paintdex-scheme-v1";

/* ---- mocks ------------------------------------------------------------- */

let currentUser: { id: string } | null = null;
let authLoading = false;

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    configured: true,
    googleEnabled: true,
    gisReady: true,
    session: currentUser ? {} : null,
    user: currentUser,
    loading: authLoading,
    signOut: async () => {},
  }),
}));

const catalogue = SCHEME_PRESETS.flatMap((spec) =>
  spec.elements.flatMap((el) =>
    el.paints.map((ref) => ({
      id: ref.id,
      ...ref.fallback,
      type: "matt" as const,
      discontinued: false,
      family: "neutral" as const,
      l: 50,
    })),
  ),
);

vi.mock("@/hooks/use-browse-index", () => ({
  useBrowseIndex: () => ({ paints: catalogue, loadError: false, loading: false }),
}));

const listSchemes = vi.fn<() => Promise<SchemeRow[]>>();
const createScheme = vi.fn();
const updateScheme = vi.fn();

vi.mock("@/lib/data/schemes", () => ({
  listSchemes: (...args: unknown[]) => listSchemes(...(args as [])),
  createScheme: (...args: unknown[]) => createScheme(...args),
  updateScheme: (...args: unknown[]) => updateScheme(...args),
  schemeExists: async () => true,
  renameScheme: vi.fn(),
  deleteScheme: vi.fn(),
  publishScheme: vi.fn(),
  unpublishScheme: vi.fn(),
}));

const { SchemeVisualiser } = await import("@/components/scheme-visualiser");

/* ---- helpers ----------------------------------------------------------- */

function scheme(title: string): Scheme {
  return {
    title,
    elements: [
      {
        id: "e1",
        name: "Armour",
        paints: [
          { id: "p1", name: "Leadbelcher", brand: "Citadel", range: "Base", hex: "#6B6F72", role: "base" },
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
    created_at: updated,
    updated_at: updated,
  } as SchemeRow;
}

const editorTitle = () => (screen.getByLabelText("Scheme name") as HTMLInputElement).value;
const elementCount = () => screen.queryAllByLabelText(/element name/i).length;

function seedLocal(s: Scheme) {
  localStorage.setItem(STORE, JSON.stringify({ scheme: s, blend: false }));
}

const newParam = () => new URLSearchParams(window.location.search).get("new");

beforeEach(() => {
  currentUser = null;
  authLoading = false;
  localStorage.clear();
  window.history.replaceState(null, "", "/visualiser?new=1");
  listSchemes.mockReset();
  createScheme.mockReset();
  updateScheme.mockReset();
  listSchemes.mockResolvedValue([]);
  createScheme.mockImplementation(async (_uid: string, _data: unknown, title: string) =>
    row("new-row", title, scheme(title), "2026-01-03T00:00:00.000Z"),
  );
  updateScheme.mockResolvedValue({ matched: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/* ---- signed in --------------------------------------------------------- */

describe("?new=1 while signed in", () => {
  it("opens a blank scheme rather than the most recent one", async () => {
    // The reported bug: this is exactly the state "+ New scheme" was landing in.
    seedLocal(scheme("Last thing I worked on"));
    listSchemes.mockResolvedValue([
      row("saved-1", "Last thing I worked on", scheme("Last thing I worked on"), "2026-01-05T00:00:00.000Z"),
    ]);
    currentUser = { id: "u1" };

    render(<SchemeVisualiser />);

    await waitFor(() => expect(editorTitle()).toBe(""));
    expect(elementCount()).toBe(0);
    // Blank and saved: one new row, so it's immediately shareable.
    await waitFor(() => expect(createScheme).toHaveBeenCalledTimes(1));
    expect(createScheme.mock.calls[0][2]).toBe("Untitled scheme");
    await waitFor(() => expect(newParam()).toBeNull());
  });

  it("waits for reconciliation, then creates exactly one scheme", async () => {
    // Acting before the row list lands races the reconciliation and the autosave.
    let release!: (rows: SchemeRow[]) => void;
    listSchemes.mockImplementation(() => new Promise((res) => (release = res)));
    currentUser = { id: "u1" };

    render(<SchemeVisualiser />);
    await waitFor(() => expect(screen.getByLabelText("Scheme name")).toBeTruthy());
    expect(createScheme).not.toHaveBeenCalled();

    await act(async () => {
      release([row("saved-1", "Existing", scheme("Existing"), "2026-01-02T00:00:00.000Z")]);
    });

    await waitFor(() => expect(createScheme).toHaveBeenCalledTimes(1));
    expect(editorTitle()).toBe("");
  });

  it("never prompts — nothing is being destroyed", async () => {
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmSpy);
    seedLocal(scheme("Saved work"));
    listSchemes.mockResolvedValue([
      row("saved-1", "Saved work", scheme("Saved work"), "2026-01-05T00:00:00.000Z"),
    ]);
    currentUser = { id: "u1" };

    render(<SchemeVisualiser />);

    await waitFor(() => expect(editorTitle()).toBe(""));
    expect(confirmSpy).not.toHaveBeenCalled();
    // …and the scheme they were on is still in the picker.
    expect(screen.getByRole("option", { name: "Saved work" })).toBeTruthy();
  });
});

/* ---- signed out -------------------------------------------------------- */

describe("?new=1 while signed out", () => {
  it("clears an empty editor without asking", async () => {
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmSpy);

    render(<SchemeVisualiser />);

    await waitFor(() => expect(newParam()).toBeNull());
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(editorTitle()).toBe("");
  });

  it("asks before clearing work in progress, and honours a refusal", async () => {
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmSpy);
    seedLocal(scheme("My work in progress"));

    render(<SchemeVisualiser />);

    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(1));
    expect(editorTitle()).toBe("My work in progress");
    const stored = JSON.parse(localStorage.getItem(STORE) ?? "{}");
    expect(stored.scheme.title).toBe("My work in progress");
    // The param still goes, so a refresh isn't a second prompt.
    await waitFor(() => expect(newParam()).toBeNull());
  });

  it("clears the editor when the visitor accepts", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    seedLocal(scheme("My work in progress"));

    render(<SchemeVisualiser />);

    await waitFor(() => expect(editorTitle()).toBe(""));
    expect(elementCount()).toBe(0);
  });

  it("does nothing while the session is still resolving", async () => {
    // `user` is null here because we don't know yet, not because nobody is
    // signed in — taking the signed-out path would prompt a signed-in visitor
    // and then destroy work their account was about to protect.
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmSpy);
    authLoading = true;
    seedLocal(scheme("Mine"));

    render(<SchemeVisualiser />);
    await waitFor(() => expect(screen.getByLabelText("Scheme name")).toBeTruthy());
    await act(async () => {});

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(editorTitle()).toBe("Mine");
    expect(newParam()).toBe("1");
  });
});

/* ---- precedence -------------------------------------------------------- */

describe("?new=1 alongside the other deep links", () => {
  it("yields to ?scheme=, which names a specific row", async () => {
    const saved = row("saved-1", "Open me", scheme("Open me"), "2026-01-02T00:00:00.000Z");
    listSchemes.mockResolvedValue([saved]);
    currentUser = { id: "u1" };
    window.history.replaceState(null, "", "/visualiser?new=1&scheme=saved-1");

    render(<SchemeVisualiser />);

    await waitFor(() => expect(editorTitle()).toBe("Open me"));
    expect(createScheme).not.toHaveBeenCalled();
    await waitFor(() => expect(newParam()).toBeNull());
  });

  it("beats ?preset=, and only one document ends up loaded", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    window.history.replaceState(null, "", `/visualiser?new=1&preset=${SCHEME_PRESETS[0].slug}`);

    render(<SchemeVisualiser />);

    await waitFor(() => expect(newParam()).toBeNull());
    await act(async () => {});
    expect(editorTitle()).toBe("");
    expect(elementCount()).toBe(0);
  });
});
