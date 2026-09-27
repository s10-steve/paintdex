/**
 * @vitest-environment jsdom
 *
 * The header's drop-downs are disclosures, not ARIA menus.
 *
 * They used to claim `role="menu"` and implement none of the menu keyboard
 * model, so what's pinned here is the smaller contract they now keep: no menu
 * roles, Escape closes and hands focus back to the button, and the account
 * button has a name beyond the initial it displays.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";

let user: { id: string; email: string } | null = null;

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    configured: true,
    googleEnabled: false,
    gisReady: false,
    session: user ? {} : null,
    user,
    loading: false,
    signOut: async () => {},
  }),
}));

const { MobileNav } = await import("@/components/mobile-nav");
const { SignInButton } = await import("@/components/auth/sign-in-button");

afterEach(() => {
  cleanup();
  user = null;
  vi.unstubAllGlobals();
});

describe("MobileNav", () => {
  it("opens a plain list of links, with no menu roles", () => {
    render(<MobileNav />);
    const button = screen.getByRole("button", { name: "Menu" });
    expect(button.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("navigation", { name: "Site" })).toBeTruthy();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Paints" })).toBeTruthy();
  });

  it("closes on Escape and returns focus to the button", () => {
    render(<MobileNav />);
    const button = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(button);
    screen.getByRole("link", { name: "Paints" }).focus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("navigation", { name: "Site" })).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("closes when focus moves out of it", () => {
    render(
      <>
        <MobileNav />
        <button type="button">elsewhere</button>
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    act(() => screen.getByRole("button", { name: "elsewhere" }).focus());
    expect(screen.queryByRole("navigation", { name: "Site" })).toBeNull();
  });
});

describe("SignInButton account menu", () => {
  it("names the account button by more than its initial", () => {
    user = { id: "u1", email: "painter@example.com" };
    // jsdom has no matchMedia; the button only uses it to pick Google's label.
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
    render(<SignInButton />);
    const button = screen.getByRole("button", { name: "Account: painter@example.com" });
    fireEvent.click(button);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
