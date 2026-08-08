/**
 * @vitest-environment jsdom
 *
 * Paint editing — mixes, ratios and notes.
 *
 * This is the first coverage of the editing UI at all: `scheme-visualiser.test`
 * exercises sync and account wiring and deliberately stubs the paint picker out.
 * `ElementCard` is rendered directly with a stub handler bag, so nothing here
 * needs auth or Supabase mocked.
 *
 * The updaters themselves are exercised through `useSchemeEditor`, because the
 * thing most worth pinning is a *deletion*: an entry that stops being a mix has
 * to lose `mix`, `parts` and `medium`, or its document never again equals the
 * `syncedCanon` it was saved with and every load looks like unflushed edits.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act, within } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { useState } from "react";
import { ElementCard, type ElementHandlers } from "@/components/scheme/element-card";
import { useSchemeEditor } from "@/hooks/use-scheme-editor";
import type { BrowsePaint } from "@/lib/paints/types";
import {
  MAX_MIX_COMPONENTS,
  MAX_NOTE,
  emptyScheme,
  type Scheme,
  type SchemeElement,
  type SchemePaint,
} from "@/lib/scheme/types";

afterEach(cleanup);

const AGRAX: SchemePaint = {
  id: "p1",
  name: "Agrax Earthshade",
  brand: "Citadel",
  range: "Shade",
  hex: "#3C3C28",
  role: "wash",
};

const LAHMIAN: BrowsePaint = {
  id: "citadel-lahmian-medium",
  name: "Lahmian Medium",
  brand: "Citadel",
  range: "Technical",
  type: "technical",
  hex: "#F9F9F9",
  discontinued: false,
  metallic: false,
  family: "neutral",
  l: 97,
} as BrowsePaint;

function handlerSpies() {
  return {
    rename: vi.fn(),
    move: vi.fn(),
    remove: vi.fn(),
    addPaint: vi.fn(),
    movePaint: vi.fn(),
    removePaint: vi.fn(),
    setRole: vi.fn(),
    setParts: vi.fn(),
    setMedium: vi.fn(),
    addMixComponent: vi.fn(),
    removeMixComponent: vi.fn(),
    setNote: vi.fn(),
  } satisfies ElementHandlers;
}

function renderCard(paints: SchemePaint[], handlers: ElementHandlers) {
  const element: SchemeElement = { id: "e1", name: "Armour", paints };
  render(
    <ElementCard
      element={element}
      index={0}
      count={1}
      dbPaints={[LAHMIAN]}
      loadError={false}
      hovered={null}
      hover={{ enter: () => {}, move: () => {}, leave: () => {}, mark: () => {}, unmark: () => {} }}
      handlers={handlers}
    />,
  );
  return element;
}

const mixed = (over: Partial<SchemePaint> = {}): SchemePaint => ({
  ...AGRAX,
  parts: 1,
  mix: [
    {
      name: "Lahmian Medium",
      brand: "Citadel",
      range: "Technical",
      hex: "#F9F9F9",
      parts: 1,
    },
  ],
  ...over,
});

describe("the weight slider is gone", () => {
  it("offers no weight control on a paint row", () => {
    renderCard([AGRAX], handlerSpies());
    expect(screen.queryByLabelText(/weight/i)).toBeNull();
    // The role select is what sizes a band now, and it stays.
    expect(screen.getByLabelText("Layer role")).toBeTruthy();
  });
});

describe("building a mix", () => {
  it("adds a picked paint as a component, without its role", async () => {
    const handlers = handlerSpies();
    renderCard([AGRAX], handlers);

    fireEvent.click(screen.getByLabelText("Add a paint to the Agrax Earthshade mix"));
    const search = screen.getByLabelText("Search paints to mix in");
    fireEvent.change(search, { target: { value: "lahmian" } });
    fireEvent.mouseDown(await screen.findByText("Lahmian Medium"));

    expect(handlers.addMixComponent).toHaveBeenCalledWith("e1", "p1", {
      name: "Lahmian Medium",
      brand: "Citadel",
      range: "Technical",
      hex: "#F9F9F9",
    });
  });

  it("names the mix and shows its ratio once there are two paints", () => {
    renderCard([mixed()], handlerSpies());
    expect(screen.getByText("Agrax Earthshade + Lahmian Medium")).toBeTruthy();
    expect(screen.getByText("1:1")).toBeTruthy();
  });

  it("lets each ingredient's share be set, primary included", () => {
    const handlers = handlerSpies();
    renderCard([mixed()], handlers);

    fireEvent.change(screen.getByLabelText("Parts of Agrax Earthshade"), {
      target: { value: "2" },
    });
    expect(handlers.setParts).toHaveBeenCalledWith("e1", "p1", 0, 2);

    fireEvent.change(screen.getByLabelText("Parts of Lahmian Medium"), {
      target: { value: "3" },
    });
    // Slot 1 is `mix[0]` — the primary occupies slot 0.
    expect(handlers.setParts).toHaveBeenCalledWith("e1", "p1", 1, 3);
  });

  it("never writes NaN from an emptied parts input", () => {
    // An emptied number input reads as "", and NaN would divide the blend by zero.
    const handlers = handlerSpies();
    renderCard([mixed()], handlers);
    fireEvent.change(screen.getByLabelText("Parts of Agrax Earthshade"), {
      target: { value: "" },
    });
    expect(handlers.setParts).not.toHaveBeenCalled();
  });

  it("flags an ingredient as a medium", () => {
    const handlers = handlerSpies();
    renderCard([mixed()], handlers);
    fireEvent.click(
      screen.getByLabelText("Lahmian Medium is a medium or thinner — thins without tinting"),
    );
    expect(handlers.setMedium).toHaveBeenCalledWith("e1", "p1", 1, true);
  });

  it("removes a component but not the primary", () => {
    const handlers = handlerSpies();
    renderCard([mixed()], handlers);
    expect(screen.queryByLabelText("Remove Agrax Earthshade from the mix")).toBeNull();
    fireEvent.click(screen.getByLabelText("Remove Lahmian Medium from the mix"));
    expect(handlers.removeMixComponent).toHaveBeenCalledWith("e1", "p1", 0);
  });

  const mixBox = () => screen.queryByLabelText("Search paints to mix in");

  it("collapses the picker when focus leaves it", () => {
    renderCard([AGRAX], handlerSpies());
    fireEvent.click(screen.getByLabelText("Add a paint to the Agrax Earthshade mix"));
    expect(mixBox()).toBeTruthy();

    fireEvent.blur(mixBox() as HTMLElement, { relatedTarget: document.body });
    expect(mixBox()).toBeNull();
  });

  it("stays open while focus moves between the picker's own parts", () => {
    // The search box and the "+ Custom" toggle are siblings inside it — tabbing
    // from one to the other must not count as leaving.
    renderCard([AGRAX], handlerSpies());
    fireEvent.click(screen.getByLabelText("Add a paint to the Agrax Earthshade mix"));
    // Scoped to the picker: the element's own AddPaint has a "+ Custom" too.
    const custom = within(mixBox()?.parentElement as HTMLElement).getByTitle(
      "Add a colour that isn't in the database",
    );

    fireEvent.blur(mixBox() as HTMLElement, { relatedTarget: custom });
    expect(mixBox()).toBeTruthy();
  });

  it("still closes when the + Mix button itself is clicked", () => {
    const handlers = handlerSpies();
    renderCard([AGRAX], handlers);
    const btn = screen.getByLabelText("Add a paint to the Agrax Earthshade mix");
    fireEvent.click(btn);
    expect(mixBox()).toBeTruthy();

    fireEvent.blur(mixBox() as HTMLElement, { relatedTarget: btn });
    fireEvent.click(btn);
    expect(mixBox()).toBeNull();
  });

  it("stays open when the window loses focus rather than the panel", () => {
    // An OS colour picker or an alt-tab reports no relatedTarget, same as a
    // click on the page background — but leaves activeElement inside the panel.
    renderCard([AGRAX], handlerSpies());
    fireEvent.click(screen.getByLabelText("Add a paint to the Agrax Earthshade mix"));
    const search = mixBox() as HTMLElement;
    search.focus();

    fireEvent.blur(search, { relatedTarget: null });
    expect(mixBox()).toBeTruthy();
  });

  it("stops offering + Mix at the cap", () => {
    const full = mixed({
      mix: Array.from({ length: MAX_MIX_COMPONENTS }, (_, i) => ({
        name: `Extra ${i}`,
        brand: "Citadel",
        range: "Layer",
        hex: "#FFFFFF",
        parts: 1,
      })),
    });
    renderCard([full], handlerSpies());
    expect(screen.queryByLabelText(/Add a paint to the .* mix/)).toBeNull();
    expect(screen.getByText("Mix full")).toBeTruthy();
  });
});

describe("notes", () => {
  it("writes what the user types, capped at the importer's limit", () => {
    const handlers = handlerSpies();
    renderCard([AGRAX], handlers);

    fireEvent.click(screen.getByLabelText("Add a note for Agrax Earthshade"));
    const box = screen.getByLabelText("Note for Agrax Earthshade") as HTMLTextAreaElement;
    // The browser must stop at the same number the importer silently enforces,
    // or the tail of a long note vanishes on the next load.
    expect(box.maxLength).toBe(MAX_NOTE);

    fireEvent.change(box, { target: { value: "airbrush over the upper 75%" } });
    expect(handlers.setNote).toHaveBeenCalledWith("e1", "p1", "airbrush over the upper 75%");
  });

  it("shows an existing note without needing to open the editor", () => {
    renderCard([{ ...AGRAX, note: "glaze into the lips" }], handlerSpies());
    expect(screen.getByText("glaze into the lips")).toBeTruthy();
  });

  const noteBox = () =>
    screen.queryByRole("textbox", { name: "Note for Agrax Earthshade" });

  it("collapses the editor when focus leaves it", () => {
    renderCard([{ ...AGRAX, note: "glaze into the lips" }], handlerSpies());
    fireEvent.click(screen.getByLabelText("Edit a note for Agrax Earthshade"));
    expect(noteBox()).toBeTruthy();

    // Focus moving anywhere else — a click on the page, Tab to the next row.
    fireEvent.blur(noteBox() as HTMLElement, { relatedTarget: document.body });
    expect(noteBox()).toBeNull();
    // The note itself is untouched; it just goes back to being read-only text.
    expect(screen.getByText("glaze into the lips")).toBeTruthy();
  });

  it("still closes when the Note button itself is clicked", () => {
    // Blur runs before the button's click, so a naive onBlur would close the
    // editor and let the toggle immediately reopen it.
    renderCard([{ ...AGRAX, note: "glaze into the lips" }], handlerSpies());
    const btn = screen.getByLabelText("Edit a note for Agrax Earthshade");
    fireEvent.click(btn);
    expect(noteBox()).toBeTruthy();

    fireEvent.blur(noteBox() as HTMLElement, { relatedTarget: btn });
    fireEvent.click(btn);
    expect(noteBox()).toBeNull();
  });

  it("leaves nothing behind when an empty note is abandoned", () => {
    renderCard([AGRAX], handlerSpies());
    fireEvent.click(screen.getByLabelText("Add a note for Agrax Earthshade"));
    fireEvent.blur(noteBox() as HTMLElement, { relatedTarget: document.body });
    expect(noteBox()).toBeNull();
    expect(screen.getByLabelText("Add a note for Agrax Earthshade")).toBeTruthy();
  });
});

/** Drives the real updaters over a real document. */
function editorHarness(paint: SchemePaint) {
  return renderHook(() => {
    const [scheme, setScheme] = useState<Scheme>({
      ...emptyScheme(),
      elements: [{ id: "e1", name: "Armour", paints: [paint] }],
    });
    return { scheme, editor: useSchemeEditor(setScheme) };
  });
}

describe("useSchemeEditor", () => {
  const paintOf = (r: ReturnType<typeof editorHarness>) =>
    r.result.current.scheme.elements[0].paints[0];

  it("defaults the primary's share when the first component lands", () => {
    const r = editorHarness(AGRAX);
    expect("parts" in paintOf(r)).toBe(false);
    act(() => {
      r.result.current.editor.elementHandlers.addMixComponent("e1", "p1", {
        name: "Lahmian Medium",
        brand: "Citadel",
        range: "Technical",
        hex: "#F9F9F9",
      });
    });
    expect(paintOf(r).parts).toBe(1);
    expect(paintOf(r).mix).toHaveLength(1);
  });

  /**
   * The canon-critical one. A de-mixed entry must serialise back to exactly the
   * bytes a plain paint does, so all three keys have to actually leave.
   */
  it("drops mix, parts and medium when the last component goes", () => {
    const r = editorHarness(mixed({ medium: true }));
    act(() => {
      r.result.current.editor.elementHandlers.removeMixComponent("e1", "p1", 0);
    });
    const p = paintOf(r);
    expect("mix" in p).toBe(false);
    expect("parts" in p).toBe(false);
    expect("medium" in p).toBe(false);
  });

  it("removes the note key when the note is cleared", () => {
    const r = editorHarness({ ...AGRAX, note: "airbrush the top" });
    act(() => {
      r.result.current.editor.elementHandlers.setNote("e1", "p1", "   ");
    });
    expect("note" in paintOf(r)).toBe(false);
  });

  it("unticking a medium removes the key rather than storing false", () => {
    const r = editorHarness(mixed({ medium: true }));
    act(() => {
      r.result.current.editor.elementHandlers.setMedium("e1", "p1", 0, false);
    });
    expect("medium" in paintOf(r)).toBe(false);
  });

  it("ignores an unusable share rather than writing it", () => {
    const r = editorHarness(mixed());
    act(() => {
      r.result.current.editor.elementHandlers.setParts("e1", "p1", 0, 0);
    });
    expect(paintOf(r).parts).toBe(1);
  });

  it("refuses to grow the mix past the cap", () => {
    const full = mixed({
      mix: Array.from({ length: MAX_MIX_COMPONENTS }, (_, i) => ({
        name: `Extra ${i}`,
        brand: "Citadel",
        range: "Layer",
        hex: "#FFFFFF",
        parts: 1,
      })),
    });
    const r = editorHarness(full);
    act(() => {
      r.result.current.editor.elementHandlers.addMixComponent("e1", "p1", {
        name: "One too many",
        brand: "Citadel",
        range: "Layer",
        hex: "#000000",
      });
    });
    expect(paintOf(r).mix).toHaveLength(MAX_MIX_COMPONENTS);
  });
});
