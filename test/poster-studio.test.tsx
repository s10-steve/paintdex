/**
 * @vitest-environment jsdom
 *
 * The share-image studio's shape picker is a real radio group.
 *
 * It carried `role="radiogroup"` and a comment promising arrow keys and a
 * single tab stop, and implemented neither — every shape was its own tab stop
 * and the arrows did nothing.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Scheme } from "@/lib/scheme/types";

vi.mock("@/lib/data/scheme-photos", () => ({
  schemePhotoPath: () => "",
  uploadSchemePhoto: vi.fn(),
  downloadSchemePhoto: vi.fn(async () => null),
  deleteSchemePhoto: vi.fn(),
  signSchemePhoto: vi.fn(async () => null),
}));

const { PosterStudio } = await import("@/components/scheme/poster-studio");

const scheme: Scheme = { title: "Test", elements: [] };

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("PosterStudio shape picker", () => {
  it("is one tab stop, and the arrows move the selection with focus", () => {
    render(<PosterStudio scheme={scheme} onClose={() => {}} />);
    const group = screen.getByRole("radiogroup", { name: "Image shape" });
    const radios = () => [...group.querySelectorAll<HTMLElement>('[role="radio"]')];

    expect(radios().map((r) => r.tabIndex)).toEqual([0, -1, -1]);
    expect(radios()[0].getAttribute("aria-checked")).toBe("true");

    radios()[0].focus();
    fireEvent.keyDown(radios()[0], { key: "ArrowRight" });
    expect(radios()[1].getAttribute("aria-checked")).toBe("true");
    expect(radios().map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
    expect(document.activeElement).toBe(radios()[1]);

    // Wraps at both ends, like native radios.
    fireEvent.keyDown(radios()[1], { key: "ArrowLeft" });
    fireEvent.keyDown(radios()[0], { key: "ArrowLeft" });
    expect(radios()[2].getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(radios()[2], { key: "Home" });
    expect(radios()[0].getAttribute("aria-checked")).toBe("true");
  });
});
