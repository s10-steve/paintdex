/**
 * @vitest-environment jsdom
 *
 * `/my-schemes` — the saved-scheme manager.
 *
 * Two behaviours are pinned, both about a delete actually sticking:
 *
 * - deleting the scheme this browser's visualiser is holding must clear the
 *   *document*, not just its binding. Left behind, the unbound content path
 *   adopts it as a brand-new row on the next visit and the delete undoes itself;
 * - a delete or rename that matched no row (someone else got there first) is
 *   reported honestly rather than optimistically patched into the list.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { SchemeRow } from "@/lib/supabase/types";
import type { Scheme } from "@/lib/scheme/types";
import { toExportShape } from "@/lib/scheme/io";
import { canonicalScheme } from "@/lib/scheme/sync";
import { readLocalDoc, writeLocalDoc } from "@/lib/scheme/local-store";

/* ---- mocks ------------------------------------------------------------- */

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    configured: true,
    googleEnabled: true,
    gisReady: true,
    session: {},
    user: { id: "u1" },
    loading: false,
    signOut: async () => {},
  }),
}));

// The gate would otherwise want the real provider's sign-in machinery.
vi.mock("@/components/profile/signed-in-gate", () => ({
  SignedInGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const listSchemes = vi.fn<(userId: string) => Promise<SchemeRow[]>>();
const deleteScheme = vi.fn<(id: string) => Promise<{ matched: boolean }>>();
const renameScheme = vi.fn<(id: string, title: string) => Promise<{ matched: boolean }>>();

vi.mock("@/lib/data/schemes", () => ({
  listSchemes: (...args: unknown[]) => listSchemes(...(args as [string])),
  deleteScheme: (...args: unknown[]) => deleteScheme(...(args as [string])),
  renameScheme: (...args: unknown[]) => renameScheme(...(args as [string, string])),
  duplicateScheme: vi.fn(),
  publishScheme: vi.fn(),
  unpublishScheme: vi.fn(),
}));

const { SchemesManager } = await import("@/components/profile/schemes-manager");

/* ---- helpers ----------------------------------------------------------- */

const scheme = (title: string): Scheme => ({
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
});

const row = (id: string, title: string): SchemeRow =>
  ({
    id,
    user_id: "u1",
    title,
    data: toExportShape(scheme(title)),
    is_public: false,
    share_slug: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  }) as SchemeRow;

/** The visualiser's document in this browser, bound to `id`. */
function bindLocal(s: Scheme, id: string) {
  writeLocalDoc({
    scheme: s,
    blend: false,
    binding: { id, userId: "u1", syncedCanon: canonicalScheme(s) },
  });
}

async function renderManager(rows: SchemeRow[]) {
  listSchemes.mockResolvedValue(rows);
  render(<SchemesManager />);
  await waitFor(() => expect(screen.getByText(rows[0].title)).toBeTruthy());
}

const deleteButton = () => screen.getAllByRole("button", { name: "Delete" })[0];

beforeEach(() => {
  localStorage.clear();
  listSchemes.mockReset();
  deleteScheme.mockReset();
  renameScheme.mockReset();
  deleteScheme.mockResolvedValue({ matched: true });
  renameScheme.mockResolvedValue({ matched: true });
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* ---- tests ------------------------------------------------------------- */

describe("deleting a scheme", () => {
  it("clears the local document when it is the one being deleted", async () => {
    const doc = scheme("Open in the visualiser");
    bindLocal(doc, "row-1");
    await renderManager([row("row-1", "Open in the visualiser")]);

    await act(async () => {
      fireEvent.click(deleteButton());
    });

    await waitFor(() => expect(deleteScheme).toHaveBeenCalledWith("row-1"));
    const stored = readLocalDoc();
    expect(stored.binding).toBeNull();
    // The content has to go too: an unbound document is adopted as a new row.
    expect(stored.scheme).toEqual({ title: "", elements: [] });
  });

  it("leaves the local document alone when a different scheme is deleted", async () => {
    const doc = scheme("Still editing this one");
    bindLocal(doc, "row-1");
    await renderManager([row("row-2", "Some other scheme")]);

    await act(async () => {
      fireEvent.click(deleteButton());
    });

    await waitFor(() => expect(deleteScheme).toHaveBeenCalledWith("row-2"));
    expect(readLocalDoc().scheme?.title).toBe("Still editing this one");
    expect(readLocalDoc().binding?.id).toBe("row-1");
  });

  it("treats a row that was already gone as deleted, not as an error", async () => {
    deleteScheme.mockResolvedValue({ matched: false });
    await renderManager([row("row-1", "Deleted on the phone")]);

    await act(async () => {
      fireEvent.click(deleteButton());
    });

    await waitFor(() => expect(screen.queryByText("Deleted on the phone")).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("renaming a scheme", () => {
  it("leaves the local document alone when the rename matched no row", async () => {
    // Deliberately unlike delete: "no rows matched" is also what a lapsed
    // session looks like, and blanking a live document on a maybe is the
    // destructive direction. Dropping the card is reversible; this isn't.
    renameScheme.mockResolvedValue({ matched: false });
    const doc = scheme("Open in the visualiser");
    bindLocal(doc, "row-1");
    await renderManager([row("row-1", "Open in the visualiser")]);

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Rename" })[0]);
    });
    const input = screen.getByLabelText("Scheme name") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "New name" } });
      fireEvent.keyDown(input, { key: "Enter" });
    });

    await waitFor(() => expect(renameScheme).toHaveBeenCalled());
    expect(readLocalDoc().scheme?.title).toBe("Open in the visualiser");
    expect(readLocalDoc().binding?.id).toBe("row-1");
  });

  it("says so, and drops the card, when the row no longer exists", async () => {
    renameScheme.mockResolvedValue({ matched: false });
    await renderManager([row("row-1", "Deleted on the phone")]);

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Rename" })[0]);
    });
    const input = screen.getByLabelText("Scheme name") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "New name" } });
      fireEvent.keyDown(input, { key: "Enter" });
    });

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/no longer exists/i));
    expect(screen.queryByText("Deleted on the phone")).toBeNull();
  });
});
