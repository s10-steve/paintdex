/**
 * @vitest-environment jsdom
 *
 * The visualiser's paint search is a combobox.
 *
 * It was a list of plain buttons with no roles: a screen reader heard nothing
 * while arrowing, and Tab walked onto results that the input's blur then
 * closed. It now keeps the invariants the browse search keeps (see
 * `paint-suggestions.tsx`): options that aren't focusable, driven from the
 * input with `aria-activedescendant`.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AddPaint } from "@/components/scheme/add-paint";
import type { BrowsePaint } from "@/lib/paints/types";

const paint = (id: string, name: string): BrowsePaint =>
  ({
    id,
    name,
    brand: "Warhammer",
    range: "Base",
    type: "opaque",
    hex: "#123456",
    discontinued: false,
    family: "blue",
    l: 40,
  }) as BrowsePaint;

const PAINTS = [paint("a", "Blue Horror"), paint("b", "Blue Tone")];

afterEach(() => cleanup());

describe("AddPaint search", () => {
  it("walks the results with the arrows and picks with Enter", () => {
    const onAdd = vi.fn();
    render(<AddPaint dbPaints={PAINTS} loadError={false} defaultRole="base" onAdd={onAdd} />);
    const input = screen.getByRole("combobox", { name: "Search paints to add" });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "blue" } });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    // Nothing in the list is a tab stop — the keyboard path is the input.
    expect(options.every((o) => o.tabIndex < 0)).toBe(true);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const activeId = input.getAttribute("aria-activedescendant");
    expect(activeId).toBe(options[1].id);
    expect(options[1].getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: "Blue Tone", role: "base" }));
  });

  it("closes on Escape even when nothing matched", () => {
    render(<AddPaint dbPaints={PAINTS} loadError={false} defaultRole="base" onAdd={() => {}} />);
    const input = screen.getByRole("combobox", { name: "Search paints to add" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(input.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
