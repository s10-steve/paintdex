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
const importCollection = vi.fn();

// Every export the module has: one absent from the factory is `undefined`, and
// a test that reaches it dies on the call rather than on its assertion.
vi.mock("@/lib/data/paint-collection", () => ({
  listCollection: (...a: unknown[]) => listCollection(...(a as [string])),
  setPaintStatus: (...a: unknown[]) => setPaintStatus(...a),
  removePaint: (...a: unknown[]) => removePaint(...a),
  importCollection: (...a: unknown[]) => importCollection(...a),
  removePaints: vi.fn(),
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
  const { enabled, ready, phase, statusOf, setStatus, remove, reload } = useCollection();
  return (
    <div>
      <span data-testid="enabled">{String(enabled)}</span>
      <span data-testid="ready">{String(ready)}</span>
      <span data-testid="phase">{phase}</span>
      <button onClick={() => void reload()}>reload</button>
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
  importCollection.mockReset().mockResolvedValue(0);
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

  it("says the load failed, distinctly from still loading, until a retry succeeds", async () => {
    // `ready` stays false after a failure, so without `phase` a consumer can't
    // tell "wait" from "retry" — /my-paints showed "Loading…" for good.
    listCollection.mockRejectedValueOnce(new Error("network"));
    renderProvider();
    await flush();
    expect(screen.getByTestId("phase").textContent).toBe("failed");

    listCollection.mockResolvedValue([row("p1", "owned")]);
    await act(async () => screen.getByText("reload").click());
    expect(screen.getByTestId("phase").textContent).toBe("ready");
    expect(statusText()).toBe("owned");
  });

  it("reports each phase: loading while auth resolves, off when signed out", async () => {
    authLoading = true;
    currentUser = null;
    const { rerender } = renderProvider();
    await flush();
    // Loading, not off: a signed-in visitor must never see an "off" frame first.
    expect(screen.getByTestId("phase").textContent).toBe("loading");

    authLoading = false;
    rerender(
      <CollectionProvider>
        <Probe />
      </CollectionProvider>,
    );
    await flush();
    expect(screen.getByTestId("phase").textContent).toBe("off");
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

describe("setStatusMany", () => {
  function Bulk() {
    const { statusOf, setStatusMany } = useCollection();
    return (
      <div>
        <span data-testid="bulk">{["p1", "p2", "p3"].map((id) => statusOf(id) ?? "none").join(",")}</span>
        <button onClick={() => void setStatusMany(["p1", "p2", "p3", "p2"], "wishlist")}>wish all</button>
      </div>
    );
  }
  const renderBulk = () =>
    render(
      <CollectionProvider>
        <Bulk />
      </CollectionProvider>,
    );
  const bulk = () => screen.getByTestId("bulk").textContent;

  it("applies at once, in one request, skipping paints already there", async () => {
    listCollection.mockResolvedValue([row("p1", "wishlist")]);
    renderBulk();
    await flush();
    await act(async () => screen.getByText("wish all").click());

    expect(bulk()).toBe("wishlist,wishlist,wishlist");
    expect(importCollection).toHaveBeenCalledTimes(1);
    expect(importCollection).toHaveBeenCalledWith("user-1", [
      { paintId: "p2", status: "wishlist" },
      { paintId: "p3", status: "wishlist" },
    ]);
  });

  it("rolls back only its own paints and reports once when the write fails", async () => {
    listCollection.mockResolvedValue([row("p1", "owned")]);
    importCollection.mockRejectedValue(new Error("network"));
    renderBulk();
    await flush();
    await act(async () => screen.getByText("wish all").click());

    // p1 was owned and moved; it goes back to owned, the rest back to absent.
    expect(bulk()).toBe("owned,none,none");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});
