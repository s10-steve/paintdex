/**
 * @vitest-environment jsdom
 *
 * The public share page's read-only view, specifically the model photo.
 *
 * The photo arrives as a signed URL the server minted, and only for a published
 * scheme whose owner added one — so "no photo" is the common case, and rendering
 * an `<img>` with no `src` for it would be a broken image on every share link
 * that has never seen the studio.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SchemeView } from "@/components/scheme-view";
import { emptyScheme, type Scheme } from "@/lib/scheme/types";

// The view's "Save a copy" button needs the auth context; nothing here exercises
// it, and an unconfigured provider is what a signed-out visitor gets anyway.
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ configured: false, user: null }),
}));

// `SaveCopyButton` reaches for the App Router, which has no provider here.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const scheme: Scheme = { ...emptyScheme(), title: "Death Guard" };

afterEach(cleanup);

describe("SchemeView photo", () => {
  it("renders no image when the scheme has no photo", () => {
    render(<SchemeView scheme={scheme} />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders the signed URL, named after the scheme", () => {
    render(<SchemeView scheme={scheme} photoUrl="https://example.supabase.co/signed.jpg?token=x" />);
    const img = screen.getByRole("img");
    expect(img).toHaveProperty("src", "https://example.supabase.co/signed.jpg?token=x");
    // The alt text has to say what the picture is *of*, and the title is the
    // only thing here that identifies it.
    expect(img.getAttribute("alt")).toMatch(/Death Guard/);
  });

  it("falls back to generic alt text for an untitled scheme", () => {
    render(<SchemeView scheme={{ ...scheme, title: "" }} photoUrl="https://example.test/p.jpg" />);
    expect(screen.getByRole("img").getAttribute("alt")).toBe("The painted model for this scheme");
  });
});
