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
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
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

  it("gives each button a tooltip saying exactly what it announces", () => {
    // One string for both. Built separately they drift, and a control that
    // announces something other than what it shows is worse than either alone.
    render(<CollectionToggle paintId="p1" paintName="Abaddon Black" />);
    for (const button of screen.getAllByRole("button")) {
      expect(button.getAttribute("title")).toBe(button.getAttribute("aria-label"));
    }
    expect(
      screen.getByLabelText("Add Abaddon Black to your wishlist").getAttribute("title"),
    ).toBe("Add Abaddon Black to your wishlist");
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

describe("the pointer-only variant", () => {
  // For the search suggestions, whose rows are `role="option"`. ARIA forbids
  // focusable descendants there and makes an option's children presentational,
  // so this variant takes itself out of the tab order and out of the
  // accessibility tree rather than claiming a semantic it can't have.
  it("is not focusable and not exposed to assistive tech", () => {
    const { container } = render(
      <CollectionToggle paintId="p1" paintName="Abaddon Black" interactive="pointer" />,
    );

    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button.getAttribute("tabindex")).toBe("-1");
    }
    expect(container.querySelector("span[aria-hidden='true']")).not.toBeNull();
    // Out of the accessibility tree: a role query, which does consult it, finds
    // nothing even though the buttons are plainly in the DOM above.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("still carries a tooltip, which is the pointer user's only hint", () => {
    const { container } = render(<CollectionToggle paintId="p1" interactive="pointer" />);
    expect(container.querySelector("button")?.getAttribute("title")).toBe(
      "Add to paints you own",
    );
  });

  it("acts on mousedown without reaching the row underneath", () => {
    // The suggestion row has its own `onMouseDown` that picks the paint and
    // closes the dropdown. Without stopPropagation, clicking ✓ would add the
    // paint *and* navigate away from the search.
    const rowMouseDown = vi.fn();
    const { container } = render(
      <div onMouseDown={rowMouseDown}>
        <CollectionToggle paintId="p1" interactive="pointer" />
      </div>,
    );

    const own = container.querySelector("button")!;
    fireEvent.mouseDown(own);

    expect(setStatus).toHaveBeenCalledWith("p1", "owned");
    expect(rowMouseDown).not.toHaveBeenCalled();
  });

  it("does nothing on a plain click, so the row's mousedown owns the gesture", () => {
    const { container } = render(<CollectionToggle paintId="p1" interactive="pointer" />);
    fireEvent.click(container.querySelector("button")!);
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("renders nothing when the collection is switched off", () => {
    enabled = false;
    const { container } = render(<CollectionToggle paintId="p1" interactive="pointer" />);
    expect(container.innerHTML).toBe("");
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
