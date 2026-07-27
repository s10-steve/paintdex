/**
 * @vitest-environment jsdom
 *
 * The two pieces of the filter round trip that a refactor could silently break
 * without any test noticing, and that are awkward to reason about from the code:
 *
 * - `BackToBrowse` must render a **bare** href first (the prerendered HTML has to
 *   stay crawlable and query-free) and only then upgrade — while still honouring a
 *   filter ticked after mount, which the mount effect can't see.
 * - `PaintFacets` must give each of its two on-page copies a **distinct** radio
 *   group name. Both sidebars are in the DOM at once (the desktop one is `hidden
 *   md:block`, not unmounted), so a shared name made them one group and clicking
 *   in the mobile drawer moved the hidden desktop control instead.
 *
 * The rest of the round trip is covered by the pure codec suite
 * (`filter-params.test.ts`), which is where the serialisation rules live.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { BackToBrowse } from "@/components/back-to-browse";
import { PaintFacets } from "@/components/paint-facets";
import { emptySharedFacets } from "@/lib/paints/filter-params";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/paints/citadel-mephiston-red",
  useRouter: () => ({ push }),
}));

/** Point the jsdom document at a URL carrying `search`. */
const setSearch = (search: string) => {
  window.history.replaceState(null, "", `/paints/citadel-mephiston-red${search}`);
};

beforeEach(() => {
  push.mockClear();
  setSearch("");
});
afterEach(cleanup);

describe("BackToBrowse", () => {
  // Note: that the *prerendered* href is bare is not asserted here — jsdom can't
  // cleanly observe the render before effects flush, and the real guarantee is
  // about the server's HTML. It's checked by fetching the built page and matching
  // for a query-bearing /paints/ href (see the plan's verification steps).
  it("stays bare when there is nothing to carry", () => {
    render(<BackToBrowse />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/paints");
  });

  it("upgrades after mount to carry the travel params", () => {
    setSearch("?brand=Vallejo&q=red&sort=lightness");
    render(<BackToBrowse />);
    const href = screen.getByRole("link").getAttribute("href")!;
    expect(href.startsWith("/paints?")).toBe(true);
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("brand")).toBe("Vallejo");
    expect(params.get("q")).toBe("red");
    expect(params.get("sort")).toBe("lightness");
  });

  it("leaves tracking params behind", () => {
    setSearch("?brand=Vallejo&utm_source=news&fbclid=abc");
    render(<BackToBrowse />);
    const href = screen.getByRole("link").getAttribute("href")!;
    expect(href).toContain("brand=Vallejo");
    expect(href).not.toContain("utm_source");
    expect(href).not.toContain("fbclid");
  });

  it("honours a filter ticked after mount", () => {
    // The panel keeps rewriting the URL with replaceState, but this component's
    // effect only ran once. The click-time recompute is what saves it.
    render(<BackToBrowse />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/paints");

    setSearch("?brand=Citadel");
    fireEvent.click(screen.getByRole("link"));
    expect(push).toHaveBeenCalledWith("/paints?brand=Citadel");
  });

  it("does not intercept the click when the href is already current", () => {
    setSearch("?brand=Vallejo");
    render(<BackToBrowse />);
    fireEvent.click(screen.getByRole("link"));
    // Nothing to correct, so it lets the <Link> do its normal job.
    expect(push).not.toHaveBeenCalled();
  });
});

describe("PaintFacets", () => {
  const options = {
    brands: [{ value: "Citadel", label: "Citadel" }],
    ranges: [{ value: "Base", label: "Base" }],
    types: [{ value: "layer", label: "layer" }],
    families: [{ value: "red", label: "red" }],
  };
  const selected = { ...emptySharedFacets(), families: new Set<string>() };
  const noop = () => {};

  const renderFacets = (show?: { family?: boolean; discontinued?: boolean }) =>
    render(
      <PaintFacets
        options={options}
        selected={selected}
        onToggle={noop}
        onMetallic={noop}
        onDiscontinued={noop}
        show={show}
      />,
    );

  it("shows every group by default", () => {
    renderFacets();
    for (const t of ["Brand", "Colour family", "Type", "Finish", "Range"]) {
      expect(screen.getByText(t)).toBeTruthy();
    }
    expect(screen.getByLabelText("Include discontinued")).toBeTruthy();
  });

  it("omits colour family when the page has no such control", () => {
    renderFacets({ family: false });
    expect(screen.queryByText("Colour family")).toBeNull();
    // ...without disturbing the groups around it.
    expect(screen.getByText("Brand")).toBeTruthy();
    expect(screen.getByText("Type")).toBeTruthy();
  });

  it("gives two copies distinct radio group names", () => {
    // The bug this pins: one shared name made the hidden desktop sidebar and the
    // mobile drawer a single radio group.
    const { container } = render(
      <>
        <PaintFacets
          options={options}
          selected={selected}
          onToggle={noop}
          onMetallic={noop}
          onDiscontinued={noop}
        />
        <PaintFacets
          options={options}
          selected={selected}
          onToggle={noop}
          onMetallic={noop}
          onDiscontinued={noop}
        />
      </>,
    );
    const names = new Set(
      [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map(
        (el) => el.name,
      ),
    );
    expect(names.size).toBe(2);
  });

  it("reports the finish the user picked, in the shared vocabulary", () => {
    const onMetallic = vi.fn();
    render(
      <PaintFacets
        options={options}
        selected={selected}
        onToggle={noop}
        onMetallic={onMetallic}
        onDiscontinued={noop}
      />,
    );
    fireEvent.click(screen.getByLabelText("Metallic only"));
    expect(onMetallic).toHaveBeenCalledWith("only");
  });

  it("uses browse's wording for the metallic option on both pages", () => {
    renderFacets({ family: false });
    expect(screen.getByLabelText("Metallic only")).toBeTruthy();
  });
});
