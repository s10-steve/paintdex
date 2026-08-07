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

/** A scheme whose one layer is a noted 2:1 mix with a medium in it. */
const recipe: Scheme = {
  ...emptyScheme(),
  title: "Death Guard",
  elements: [
    {
      id: "e1",
      name: "Armour",
      paints: [
        {
          id: "p1",
          name: "Agrax Earthshade",
          brand: "Citadel",
          range: "Shade",
          hex: "#3C3C28",
          role: "wash",
          parts: 2,
          note: "glaze into the recesses",
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
        },
      ],
    },
  ],
};

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

/**
 * The share page's recipe list is where a mix and a note have to survive: the
 * poster deliberately carries neither in full, so this is the only place a
 * reader gets the whole instruction.
 */
describe("SchemeView recipe", () => {
  it("names both paints in a mix, with the ratio", () => {
    render(<SchemeView scheme={recipe} />);
    expect(screen.getByText("Agrax Earthshade + Lahmian Medium")).toBeTruthy();
    expect(screen.getByText("2:1")).toBeTruthy();
  });

  it("breaks the mix out into its ingredients and marks the medium", () => {
    render(<SchemeView scheme={recipe} />);
    expect(screen.getByText("×2")).toBeTruthy();
    expect(screen.getByText("thins")).toBeTruthy();
  });

  it("shows the layer note", () => {
    render(<SchemeView scheme={recipe} />);
    expect(screen.getByText("glaze into the recesses")).toBeTruthy();
  });

  it("reads the whole recipe out to a screen reader from the bar band", () => {
    // Every solid band is a `role="img"` carrying `paintLabel`, and that is the
    // only route by which a note reaches a screen reader — the tooltip beside
    // it is pointer-only. (It's also why the photo tests above use an empty
    // scheme: a scheme with elements has a band per paint, so their singular
    // `getByRole("img")` would find those instead.)
    render(<SchemeView scheme={recipe} />);
    expect(
      screen.getByLabelText(
        "Wash: 2:1 Agrax Earthshade + Lahmian Medium (#3C3C28). Note: glaze into the recesses",
      ),
    ).toBeTruthy();
  });

  it("finds the photo by its alt text even among the bar bands", () => {
    render(<SchemeView scheme={recipe} photoUrl="https://example.test/p.jpg" />);
    expect(screen.getByAltText(/Death Guard/)).toHaveProperty(
      "src",
      "https://example.test/p.jpg",
    );
  });
});
