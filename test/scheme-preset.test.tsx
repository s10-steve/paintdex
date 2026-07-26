/**
 * @vitest-environment jsdom
 *
 * `?preset=<slug>` — the homepage carousel's "Open in the designer" link.
 *
 * This replaces the document the user is looking at, so like the sign-in
 * reconciliation it's a place where a bug destroys work. The cases that matter:
 *
 * - a visitor with work in progress is asked before it's replaced, and declining
 *   really does leave it alone;
 * - a **signed-in** visitor's preset lands as a NEW row — the debounced autosave
 *   must never write the example over a scheme they had saved;
 * - an unknown slug is inert;
 * - the param is always stripped, so a reload doesn't re-prompt or re-seed over
 *   edits made since.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, cleanup, waitFor } from "@testing-library/react";
import type { SchemeRow } from "@/lib/supabase/types";
import type { Scheme } from "@/lib/scheme/types";
import { toExportShape } from "@/lib/scheme/io";
import { SCHEME_PRESETS } from "@/lib/scheme/presets";

const STORE = "paintdex-scheme-v1";
const PRESET = SCHEME_PRESETS[0];

/* ---- mocks ------------------------------------------------------------- */

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

/**
 * The catalogue, as the browse index would supply it. Presets resolve hexes
 * through this, so it has to cover every id they reference — building it from the
 * presets' own fallbacks keeps the fixture honest without importing the real
 * 4,900-paint dataset into a jsdom test.
 */
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

const editorTitle = () => (screen.getByLabelText("Scheme name") as HTMLInputElement).value;

function seedLocal(s: Scheme) {
  localStorage.setItem(STORE, JSON.stringify({ scheme: s, blend: false }));
}

/** Put a `?preset=` on the URL the way arriving from the homepage would. */
function withPresetParam(slug: string) {
  window.history.replaceState(null, "", `/visualiser?preset=${slug}`);
}

const presetParam = () => new URLSearchParams(window.location.search).get("preset");

beforeEach(() => {
  currentUser = null;
  localStorage.clear();
  window.history.replaceState(null, "", "/visualiser");
  listSchemes.mockReset();
  createScheme.mockReset();
  updateScheme.mockReset();
  listSchemes.mockResolvedValue([]);
  createScheme.mockImplementation(async (_uid: string, _data: unknown, title: string) =>
    row("new-row", title, scheme(title), "2026-01-03T00:00:00.000Z"),
  );
  updateScheme.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/* ---- signed out -------------------------------------------------------- */

describe("?preset= while signed out", () => {
  it("loads the example into an empty editor without asking", async () => {
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmSpy);
    withPresetParam(PRESET.slug);

    render(<SchemeVisualiser />);

    await waitFor(() => expect(editorTitle()).toBe(PRESET.title));
    expect(confirmSpy).not.toHaveBeenCalled();
    // Every element made it in, with the real element names.
    for (const el of PRESET.elements) {
      expect(screen.getAllByDisplayValue(el.name).length).toBeGreaterThan(0);
    }
  });

  it("strips the param so a reload doesn't re-seed over later edits", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    withPresetParam(PRESET.slug);

    render(<SchemeVisualiser />);

    await waitFor(() => expect(presetParam()).toBeNull());
  });

  it("asks before replacing work in progress, and honours a refusal", async () => {
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmSpy);
    seedLocal(scheme("My work in progress"));
    withPresetParam(PRESET.slug);

    render(<SchemeVisualiser />);

    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(1));
    // The editor still holds the visitor's scheme…
    expect(editorTitle()).toBe("My work in progress");
    // …and localStorage was never rewritten with the example.
    const stored = JSON.parse(localStorage.getItem(STORE) ?? "{}");
    expect(stored.scheme.title).toBe("My work in progress");
    // The param still goes, so a refresh isn't a second prompt.
    await waitFor(() => expect(presetParam()).toBeNull());
  });

  it("replaces work in progress when the visitor accepts", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    seedLocal(scheme("My work in progress"));
    withPresetParam(PRESET.slug);

    render(<SchemeVisualiser />);

    await waitFor(() => expect(editorTitle()).toBe(PRESET.title));
  });

  it("ignores an unknown slug", async () => {
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmSpy);
    seedLocal(scheme("Untouched"));
    withPresetParam("no-such-scheme");

    render(<SchemeVisualiser />);

    await waitFor(() => expect(presetParam()).toBeNull());
    expect(editorTitle()).toBe("Untouched");
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("does nothing at all without the param", async () => {
    seedLocal(scheme("Just my scheme"));

    render(<SchemeVisualiser />);

    await waitFor(() => expect(editorTitle()).toBe("Just my scheme"));
  });
});

/* ---- signed in --------------------------------------------------------- */

describe("?preset= while signed in", () => {
  // The prompt is signed-out-only on purpose. `adoptScheme` adds the example as a
  // new row, so a signed-in user loses nothing — asking "this can't be undone"
  // would be asking permission for something that isn't happening.
  it("never prompts, because nothing is being replaced", async () => {
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmSpy);
    const mine = row("saved-1", "Mine", scheme("Mine"), "2026-01-02T00:00:00.000Z");
    listSchemes.mockResolvedValue([mine]);
    currentUser = { id: "u1" };
    withPresetParam(PRESET.slug);

    render(<SchemeVisualiser />);

    await waitFor(() => expect(editorTitle()).toBe(PRESET.title));
    expect(confirmSpy).not.toHaveBeenCalled();
    // The scheme they were on is still there, still selectable.
    expect(screen.getByRole("option", { name: "Mine" })).toBeTruthy();
  });

  it("saves the example as a new scheme and never overwrites a saved one", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("confirm", vi.fn(() => true));
    const saved = row(
      "saved-1",
      "Something I already saved",
      scheme("Something I already saved"),
      "2026-01-02T00:00:00.000Z",
    );
    listSchemes.mockResolvedValue([saved]);
    currentUser = { id: "u1" };
    withPresetParam(PRESET.slug);

    render(<SchemeVisualiser />);

    // The example arrives as a brand-new row…
    await waitFor(() => {
      const titles = createScheme.mock.calls.map((c) => c[2]);
      expect(titles).toContain(PRESET.title);
    });
    await waitFor(() => expect(editorTitle()).toBe(PRESET.title));

    // …and past the autosave debounce, the pre-existing row is untouched. This is
    // the assertion the whole `ready` gate exists for.
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    const overwritten = updateScheme.mock.calls.filter((c) => c[0] === "saved-1");
    expect(overwritten).toEqual([]);
  });

  // The `ready` gate exists for exactly this ordering: the catalogue is in hand
  // on the first render, so without the gate the preset seeds *before* sign-in
  // reconciliation resolves. Reconciliation then sees the example sitting in the
  // editor, decides it's unsaved local work, and adopts it as a second row —
  // leaving two junk schemes on the account and the editor bound to the wrong
  // one. Holding a slow `listSchemes` open makes that ordering deterministic.
  it("waits for sign-in reconciliation before seeding", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    let release!: (rows: SchemeRow[]) => void;
    listSchemes.mockReturnValue(
      new Promise<SchemeRow[]>((resolve) => {
        release = resolve;
      }),
    );
    currentUser = { id: "u1" };
    withPresetParam(PRESET.slug);

    render(<SchemeVisualiser />);

    // While the account's schemes are still loading, nothing has been seeded and
    // nothing has been written.
    await waitFor(() => expect(screen.getByLabelText("Scheme name")).toBeTruthy());
    expect(createScheme).not.toHaveBeenCalled();
    expect(editorTitle()).toBe("");

    const saved = row("saved-1", "Saved earlier", scheme("Saved earlier"), "2026-01-02T00:00:00.000Z");
    await act(async () => {
      release([saved]);
    });

    // Reconciliation loaded the saved scheme first, so the example is a genuine
    // replacement and lands as exactly ONE new row — not two.
    await waitFor(() => expect(editorTitle()).toBe(PRESET.title));
    expect(createScheme).toHaveBeenCalledTimes(1);
    expect(createScheme.mock.calls[0][2]).toBe(PRESET.title);
  });

  it("still strips the param", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    currentUser = { id: "u1" };
    withPresetParam(PRESET.slug);

    render(<SchemeVisualiser />);

    await waitFor(() => expect(presetParam()).toBeNull());
  });
});
