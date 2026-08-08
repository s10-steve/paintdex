/**
 * @vitest-environment jsdom
 *
 * The collection toggle inside a visualiser layer row.
 *
 * Separate from `scheme-editor.test.tsx` because it needs the collection
 * provider mocked as signed-in, and that suite deliberately needs neither auth
 * nor Supabase.
 *
 * What's worth pinning is the join. A `SchemePaint` carries no catalogue id, so
 * the row has to recover one by matching name and maker against the browse
 * index — which means there are three ways to legitimately have no id, and all
 * three must render no button rather than a broken one.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { BrowsePaint } from "@/lib/paints/types";
import type { ElementHandlers } from "@/components/scheme/element-card";
import type { SchemeElement, SchemePaint } from "@/lib/scheme/types";

let enabled = true;

vi.mock("@/components/collection/collection-provider", () => ({
  useCollection: () => ({
    enabled,
    ready: true,
    statusOf: () => null,
    entries: new Map(),
    setStatus: vi.fn(),
    remove: vi.fn(),
    reload: vi.fn(),
    error: null,
    dismissError: () => {},
  }),
}));

const { ElementCard } = await import("@/components/scheme/element-card");

const AGRAX: SchemePaint = {
  id: "p1",
  name: "Agrax Earthshade",
  brand: "Citadel",
  range: "Shade",
  hex: "#3C3C28",
  role: "wash",
};

const CATALOGUE: BrowsePaint[] = [
  {
    id: "citadel-agrax-earthshade",
    name: "Agrax Earthshade",
    brand: "Citadel",
    range: "Shade",
    type: "shade",
    hex: "#3C3C28",
    discontinued: false,
    family: "brown",
    l: 25,
  } as BrowsePaint,
  {
    id: "citadel-lahmian-medium",
    name: "Lahmian Medium",
    brand: "Citadel",
    range: "Technical",
    type: "technical",
    hex: "#F9F9F9",
    discontinued: false,
    family: "neutral",
    l: 97,
  } as BrowsePaint,
];

const handlers: ElementHandlers = {
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
};

function renderCard(paints: SchemePaint[], dbPaints: BrowsePaint[] | null = CATALOGUE) {
  const element: SchemeElement = { id: "e1", name: "Armour", paints };
  render(
    <ElementCard
      element={element}
      index={0}
      count={1}
      dbPaints={dbPaints}
      loadError={false}
      hovered={null}
      hover={{ enter: () => {}, move: () => {}, leave: () => {}, mark: () => {}, unmark: () => {} }}
      handlers={handlers}
    />,
  );
}

const toggleFor = (name: string) =>
  screen.queryByLabelText(`Add ${name} to paints you own`);

beforeEach(() => {
  enabled = true;
});

afterEach(() => cleanup());

describe("a catalogue paint", () => {
  it("gets a toggle, resolved by name and maker", () => {
    renderCard([AGRAX]);
    expect(toggleFor("Agrax Earthshade")).not.toBeNull();
  });

  it("gets none when signed out", () => {
    enabled = false;
    renderCard([AGRAX]);
    expect(toggleFor("Agrax Earthshade")).toBeNull();
  });
});

describe("paints with no catalogue id behind them", () => {
  it("a hand-entered custom colour gets no toggle", () => {
    renderCard([
      { ...AGRAX, id: "p2", name: "My own brown", brand: "custom", range: "custom", custom: true },
    ]);
    expect(toggleFor("My own brown")).toBeNull();
  });

  it("a paint the catalogue no longer has gets no toggle", () => {
    renderCard([{ ...AGRAX, id: "p3", name: "Devlan Mud" }]);
    expect(toggleFor("Devlan Mud")).toBeNull();
    // …and the row itself still renders, rather than the lookup taking it down.
    expect(screen.getByText("Devlan Mud")).toBeTruthy();
  });

  it("nothing gets a toggle while the catalogue is still loading", () => {
    renderCard([AGRAX], null);
    expect(toggleFor("Agrax Earthshade")).toBeNull();
  });
});

describe("mixes", () => {
  const MIXED: SchemePaint = {
    ...AGRAX,
    parts: 1,
    mix: [
      {
        name: "Lahmian Medium",
        brand: "Citadel",
        range: "Technical",
        hex: "#F9F9F9",
        parts: 1,
        medium: true,
      },
    ],
  };

  it("puts a toggle on each ingredient instead of one on the row", () => {
    // A single toggle in the header would have to mean the primary paint
    // specifically, which isn't what "Agrax Earthshade + Lahmian Medium" reads
    // as — and up there it competed with the title, truncating it.
    renderCard([MIXED]);
    expect(toggleFor("Agrax Earthshade")).not.toBeNull();
    expect(toggleFor("Lahmian Medium")).not.toBeNull();
  });

  it("gives a medium one too — you still have to buy it", () => {
    renderCard([MIXED]);
    expect(toggleFor("Lahmian Medium")).not.toBeNull();
  });

  it("counts exactly one toggle pair per ingredient", () => {
    // Guards against the row keeping its own toggle as well, which would offer
    // the primary paint twice.
    renderCard([MIXED]);
    // Two ingredients, two buttons each.
    expect(screen.getAllByRole("button", { name: /to paints you own$/ })).toHaveLength(2);
  });

  it("skips an ingredient the catalogue doesn't have", () => {
    renderCard([
      { ...MIXED, mix: [{ ...MIXED.mix![0], name: "Some Discontinued Medium" }] },
    ]);
    expect(toggleFor("Agrax Earthshade")).not.toBeNull();
    expect(toggleFor("Some Discontinued Medium")).toBeNull();
  });
});
