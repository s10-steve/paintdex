/**
 * @vitest-environment jsdom
 *
 * The collection's shared state layer.
 *
 * This is the only place that knows what's in the collection, so the four views
 * that show a toggle agree by construction. What's worth pinning is everything
 * around the happy path: that a failed write puts the old value back rather
 * than leaving the UI claiming a change that never happened, that nothing is
 * fetched before auth has settled or after it settles signed-out, and that a
 * refreshed auth token doesn't re-fetch the whole collection.
 *
 * The data layer and the auth provider are mocked; the Supabase client never
 * is, per the convention in `scheme-visualiser.test.tsx`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import type { PaintCollectionRow, PaintStatus } from "@/lib/supabase/types";

let currentUser: { id: string } | null = null;
let authLoading = false;
let configured = true;

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    configured,
    googleEnabled: true,
    gisReady: true,
    session: currentUser ? {} : null,
    user: currentUser,
    loading: authLoading,
    signOut: async () => {},
  }),
}));

const listCollection = vi.fn<(userId: string) => Promise<PaintCollectionRow[]>>();
const setPaintStatus = vi.fn();
const removePaint = vi.fn();

// Every export the module has: one absent from the factory is `undefined`, and
// a test that reaches it dies on the call rather than on its assertion.
vi.mock("@/lib/data/paint-collection", () => ({
  listCollection: (...a: unknown[]) => listCollection(...(a as [string])),
  setPaintStatus: (...a: unknown[]) => setPaintStatus(...a),
  removePaint: (...a: unknown[]) => removePaint(...a),
  importCollection: vi.fn(),
  clearCollection: vi.fn(),
}));

const { CollectionProvider, useCollection } = await import(
  "@/components/collection/collection-provider"
);

const row = (paintId: string, status: PaintStatus): PaintCollectionRow => ({
  id: `row-${paintId}`,
  user_id: "user-1",
  paint_id: paintId,
  status,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

/** Surfaces the parts of the context the assertions need, plus two buttons. */
function Probe({ paintId = "p1" }: { paintId?: string }) {
  const { enabled, ready, statusOf, setStatus, remove } = useCollection();
  return (
    <div>
      <span data-testid="enabled">{String(enabled)}</span>
      <span data-testid="ready">{String(ready)}</span>
      <span data-testid="status">{statusOf(paintId) ?? "none"}</span>
      <button onClick={() => void setStatus(paintId, "owned")}>own</button>
      <button onClick={() => void remove(paintId)}>forget</button>
    </div>
  );
}

const renderProvider = () =>
  render(
    <CollectionProvider>
      <Probe />
    </CollectionProvider>,
  );

const statusText = () => screen.getByTestId("status").textContent;
const flush = () => act(async () => {});

beforeEach(() => {
  currentUser = { id: "user-1" };
  authLoading = false;
  configured = true;
  listCollection.mockReset();
  setPaintStatus.mockReset();
  removePaint.mockReset();
  listCollection.mockResolvedValue([]);
  setPaintStatus.mockResolvedValue(row("p1", "owned"));
  removePaint.mockResolvedValue({ matched: true });
});

afterEach(() => cleanup());

describe("loading", () => {
  it("loads the collection once signed in", async () => {
    listCollection.mockResolvedValue([row("p1", "owned"), row("p2", "wishlist")]);
    renderProvider();
    await flush();

    expect(listCollection).toHaveBeenCalledWith("user-1");
    expect(statusText()).toBe("owned");
    expect(screen.getByTestId("ready").textContent).toBe("true");
  });

  it("fetches nothing while auth is still resolving", async () => {
    // `!user` means "unknown" here, not "signed out" — treating it as settled
    // would flash the toggles out of existence on every cold load.
    authLoading = true;
    currentUser = null;
    renderProvider();
    await flush();

    expect(listCollection).not.toHaveBeenCalled();
    expect(screen.getByTestId("enabled").textContent).toBe("false");
  });

  it("fetches nothing when settled signed-out", async () => {
    currentUser = null;
    renderProvider();
    await flush();

    expect(listCollection).not.toHaveBeenCalled();
    expect(screen.getByTestId("enabled").textContent).toBe("false");
  });

  it("is disabled when Supabase isn't configured", async () => {
    configured = false;
    renderProvider();
    await flush();

    expect(listCollection).not.toHaveBeenCalled();
    expect(screen.getByTestId("enabled").textContent).toBe("false");
  });

  it("doesn't refetch when auth hands back a fresh user object with the same id", async () => {
    // A token refresh does exactly this, roughly hourly. Keying the effect on
    // `user` instead of `user.id` would re-read the whole collection each time.
    const { rerender } = renderProvider();
    await flush();
    expect(listCollection).toHaveBeenCalledTimes(1);

    currentUser = { id: "user-1" };
    rerender(
      <CollectionProvider>
        <Probe />
      </CollectionProvider>,
    );
    await flush();

    expect(listCollection).toHaveBeenCalledTimes(1);
  });

  it("clears the map when the user signs out", async () => {
    listCollection.mockResolvedValue([row("p1", "owned")]);
    const { rerender } = renderProvider();
    await flush();
    expect(statusText()).toBe("owned");

    currentUser = null;
    rerender(
      <CollectionProvider>
        <Probe />
      </CollectionProvider>,
    );
    await flush();

    // A second account on a shared browser must not see the first one's paints.
    expect(statusText()).toBe("none");
  });

  it("reports a failed load without wedging", async () => {
    listCollection.mockRejectedValue(new Error("network"));
    renderProvider();
    await flush();

    expect(screen.getByRole("alert").textContent).toMatch(/Couldn't load your paints/);
  });
});

describe("optimistic writes", () => {
  it("applies a change immediately and keeps it when the write succeeds", async () => {
    renderProvider();
    await flush();

    await act(async () => screen.getByText("own").click());

    expect(setPaintStatus).toHaveBeenCalledWith("user-1", "p1", "owned");
    expect(statusText()).toBe("owned");
  });

  it("rolls back and reports when the write fails", async () => {
    // The failure mode the feature can least afford: a toggle that flipped,
    // failed silently, and reverted on the next page load.
    setPaintStatus.mockRejectedValue(new Error("offline"));
    renderProvider();
    await flush();

    await act(async () => screen.getByText("own").click());

    expect(statusText()).toBe("none");
    expect(screen.getByRole("alert").textContent).toMatch(/Couldn't save that change/);
  });

  it("restores the previous list, not just 'absent', when a move fails", async () => {
    listCollection.mockResolvedValue([row("p1", "wishlist")]);
    setPaintStatus.mockRejectedValue(new Error("offline"));
    renderProvider();
    await flush();

    await act(async () => screen.getByText("own").click());

    expect(statusText()).toBe("wishlist");
  });

  it("removes a paint, and puts it back if the delete fails", async () => {
    listCollection.mockResolvedValue([row("p1", "owned")]);
    removePaint.mockRejectedValue(new Error("offline"));
    renderProvider();
    await flush();

    await act(async () => screen.getByText("forget").click());

    expect(removePaint).toHaveBeenCalledWith("user-1", "p1");
    expect(statusText()).toBe("owned");
  });

  it("treats an already-gone row as a successful delete", async () => {
    // `matched: false` is the desired end state for a delete, not a failure —
    // a second click must not raise an error banner.
    listCollection.mockResolvedValue([row("p1", "owned")]);
    removePaint.mockResolvedValue({ matched: false });
    renderProvider();
    await flush();

    await act(async () => screen.getByText("forget").click());

    expect(statusText()).toBe("none");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does nothing when the paint is already in that list", async () => {
    listCollection.mockResolvedValue([row("p1", "owned")]);
    renderProvider();
    await flush();

    await act(async () => screen.getByText("own").click());

    expect(setPaintStatus).not.toHaveBeenCalled();
  });
});

describe("without a provider", () => {
  it("renders inert rather than throwing", async () => {
    // What lets a toggle be dropped into any tree — including a test — without
    // scaffolding, the way `useAuth` behaves.
    render(<Probe />);
    expect(screen.getByTestId("enabled").textContent).toBe("false");
    expect(statusText()).toBe("none");
  });
});
