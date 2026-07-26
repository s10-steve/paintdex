/**
 * @vitest-environment jsdom
 *
 * The homepage example-scheme carousel. It moves on its own, which is the whole
 * reason it needs tests: the behaviours worth pinning are the ones a visitor
 * can't easily recover from if they break — motion that ignores
 * `prefers-reduced-motion`, and rotation that fights someone who has taken
 * manual control.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, cleanup, fireEvent } from "@testing-library/react";
import { HomeSchemeCarousel } from "@/components/home-scheme-carousel";
import { resolvePresets, SCHEME_PRESETS, type ResolvedPreset } from "@/lib/scheme/presets";

/** Resolve from the presets' own fallbacks — no catalogue needed under jsdom. */
const fallbacks = new Map(
  SCHEME_PRESETS.flatMap((spec) =>
    spec.elements.flatMap((el) => el.paints.map((ref) => [ref.id, ref.fallback] as const)),
  ),
);
const presets: ResolvedPreset[] = resolvePresets((id) => fallbacks.get(id));

/**
 * jsdom's `matchMedia` is missing entirely, so it has to be supplied. The
 * carousel starts with `reduced` true and only rotates once it has *measured*
 * the query, so the stub is what makes rotation possible at all.
 */
function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

const heading = () => screen.getByRole("heading", { level: 3 }).textContent;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("HomeSchemeCarousel", () => {
  it("shows the first scheme, with its designer link", () => {
    stubMatchMedia(false);
    render(<HomeSchemeCarousel presets={presets} />);

    expect(heading()).toBe(presets[0].title);
    expect(
      screen.getByRole("link", { name: /open in the designer/i }).getAttribute("href"),
    ).toBe(`/visualiser?preset=${presets[0].slug}`);
  });

  it("advances on its own", async () => {
    stubMatchMedia(false);
    render(<HomeSchemeCarousel presets={presets} />);
    expect(heading()).toBe(presets[0].title);

    await act(async () => {
      vi.advanceTimersByTime(7000);
    });
    expect(heading()).toBe(presets[1].title);
  });

  it("does not advance when the visitor prefers reduced motion", async () => {
    stubMatchMedia(true);
    render(<HomeSchemeCarousel presets={presets} />);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(heading()).toBe(presets[0].title);
  });

  it("hides the pause control under reduced motion, since nothing moves", () => {
    stubMatchMedia(true);
    render(<HomeSchemeCarousel presets={presets} />);
    expect(screen.queryByRole("button", { name: /rotation/i })).toBeNull();
  });

  it("pauses on hover and resumes on leave", async () => {
    stubMatchMedia(false);
    render(<HomeSchemeCarousel presets={presets} />);
    const region = screen.getByRole("region", { name: "Example paint schemes" });

    fireEvent.mouseEnter(region);
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(heading()).toBe(presets[0].title);

    fireEvent.mouseLeave(region);
    await act(async () => {
      vi.advanceTimersByTime(7000);
    });
    expect(heading()).toBe(presets[1].title);
  });

  it("pauses while a descendant has keyboard focus", async () => {
    stubMatchMedia(false);
    render(<HomeSchemeCarousel presets={presets} />);

    // Focus lands on the link inside the slide, never the region itself — which
    // is why the component listens in the capture phase.
    fireEvent.focus(screen.getByRole("link", { name: /open in the designer/i }));
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(heading()).toBe(presets[0].title);
  });

  it("stops rotating for good once the visitor navigates manually", async () => {
    stubMatchMedia(false);
    render(<HomeSchemeCarousel presets={presets} />);

    fireEvent.click(screen.getByRole("button", { name: "Next scheme" }));
    expect(heading()).toBe(presets[1].title);

    // Mouse away so hover-pause isn't what's being measured.
    fireEvent.mouseLeave(screen.getByRole("region", { name: "Example paint schemes" }));
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(heading()).toBe(presets[1].title);
  });

  it("wraps backwards from the first scheme", () => {
    stubMatchMedia(false);
    render(<HomeSchemeCarousel presets={presets} />);

    fireEvent.click(screen.getByRole("button", { name: "Previous scheme" }));
    expect(heading()).toBe(presets[presets.length - 1].title);
  });

  it("jumps to a scheme from its dot, and marks it current", () => {
    stubMatchMedia(false);
    render(<HomeSchemeCarousel presets={presets} />);

    const target = presets[2];
    const dot = screen.getByRole("button", { name: `Show scheme 3: ${target.title}` });
    fireEvent.click(dot);

    expect(heading()).toBe(target.title);
    expect(dot.getAttribute("aria-current")).toBe("true");
  });

  it("moves with the arrow keys", () => {
    stubMatchMedia(false);
    render(<HomeSchemeCarousel presets={presets} />);
    const region = screen.getByRole("region", { name: "Example paint schemes" });

    fireEvent.keyDown(region, { key: "ArrowRight" });
    expect(heading()).toBe(presets[1].title);
    fireEvent.keyDown(region, { key: "ArrowLeft" });
    expect(heading()).toBe(presets[0].title);
  });

  it("only announces slide changes once rotation has stopped", () => {
    stubMatchMedia(false);
    const { container } = render(<HomeSchemeCarousel presets={presets} />);
    const live = () => container.querySelector("[aria-live]")?.getAttribute("aria-live");

    expect(live()).toBe("off");
    fireEvent.click(screen.getByRole("button", { name: "Next scheme" }));
    expect(live()).toBe("polite");
  });

  it("renders one bar per element of the active scheme", () => {
    stubMatchMedia(false);
    render(<HomeSchemeCarousel presets={presets} />);

    for (const el of presets[0].elements) {
      expect(screen.getByText(el.name)).toBeTruthy();
    }
    // And nothing from the inactive slides is left in the DOM to tab into.
    expect(screen.queryByText(presets[1].elements[0].name)).toBeNull();
  });

  it("renders nothing when given no presets", () => {
    stubMatchMedia(false);
    const { container } = render(<HomeSchemeCarousel presets={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
