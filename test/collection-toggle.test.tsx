/**
 * @vitest-environment jsdom
 *
 * The add-to-collection controls.
 *
 * Three things this pins. That they vanish entirely when the collection is off,
 * because they appear hundreds at a time in the browse grid and a signed-out
 * visitor must not see hundreds of prompts. That one control does add, move and
 * remove — clicking the list a paint is already in takes it out — so there is no
 * third button to find. And that the visible text and the accessible name come
 * from the same source, the `facetLabel` lesson: a control that announces
 * something other than what it shows is worse than either alone.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import type { PaintStatus } from "@/lib/supabase/types";

let enabled = true;
let status: PaintStatus | null = null;
const setStatus = vi.fn();
const remove = vi.fn();

vi.mock("@/components/collection/collection-provider", () => ({
  useCollection: () => ({
    enabled,
    ready: true,
    statusOf: () => status,
    entries: new Map(),
    setStatus: (...a: unknown[]) => setStatus(...a),
    remove: (...a: unknown[]) => remove(...a),
    reload: async () => {},
    error: null,
    dismissError: () => {},
  }),
}));

const { CollectionToggle, CollectionButtons } = await import(
  "@/components/collection/collection-toggle"
);

beforeEach(() => {
  enabled = true;
  status = null;
  setStatus.mockReset();
  remove.mockReset();
});

afterEach(() => cleanup());

describe("CollectionToggle", () => {
  it("renders nothing when the collection is switched off", () => {
    enabled = false;
    const { container } = render(<CollectionToggle paintId="p1" />);
    expect(container.innerHTML).toBe("");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("offers both lists, neither pressed, for a paint not in the collection", () => {
    render(<CollectionToggle paintId="p1" />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(buttons.every((b) => b.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("names the paint and the action it will perform", () => {
    render(<CollectionToggle paintId="p1" paintName="Abaddon Black" />);
    expect(screen.getByLabelText("Add Abaddon Black to paints you own")).toBeTruthy();
    expect(screen.getByLabelText("Add Abaddon Black to your wishlist")).toBeTruthy();
  });

  it("adds to the owned list", async () => {
    render(<CollectionToggle paintId="p1" paintName="Abaddon Black" />);
    await act(async () =>
      screen.getByLabelText("Add Abaddon Black to paints you own").click(),
    );
    expect(setStatus).toHaveBeenCalledWith("p1", "owned");
  });

  it("moves a wishlisted paint to owned in one click", async () => {
    status = "wishlist";
    render(<CollectionToggle paintId="p1" paintName="Abaddon Black" />);
    await act(async () =>
      screen.getByLabelText("Add Abaddon Black to paints you own").click(),
    );
    // The upsert handles the move, so this is a set and never a remove-then-add.
    expect(setStatus).toHaveBeenCalledWith("p1", "owned");
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes when the paint's current list is clicked again", async () => {
    status = "owned";
    render(<CollectionToggle paintId="p1" paintName="Abaddon Black" />);
    const own = screen.getByLabelText("Remove Abaddon Black from paints you own");
    expect(own.getAttribute("aria-pressed")).toBe("true");

    await act(async () => own.click());
    expect(remove).toHaveBeenCalledWith("p1");
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("marks only the list the paint is actually in", () => {
    status = "wishlist";
    render(<CollectionToggle paintId="p1" paintName="Abaddon Black" />);
    expect(
      screen
        .getByLabelText("Remove Abaddon Black from your wishlist")
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByLabelText("Add Abaddon Black to paints you own")
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });
});

describe("CollectionButtons", () => {
  it("renders nothing when the collection is switched off", () => {
    enabled = false;
    render(<CollectionButtons paintId="p1" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("states the current list in words, not just as a highlight", () => {
    status = "owned";
    render(<CollectionButtons paintId="p1" />);
    expect(screen.getByRole("status").textContent).toBe("In the paints you own.");
  });

  it("says so when the paint isn't in the collection", () => {
    render(<CollectionButtons paintId="p1" />);
    expect(screen.getByRole("status").textContent).toBe("Not in your collection.");
  });

  it("shows a visible label matching what it announces", () => {
    render(<CollectionButtons paintId="p1" />);
    const own = screen.getByLabelText("Add to paints you own");
    // The icon is aria-hidden, so the visible word is what remains.
    expect(own.textContent).toContain("Own");
  });
});
