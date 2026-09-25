/**
 * @vitest-environment jsdom
 *
 * A failed sign-in has to be visible.
 *
 * Google's half of the flow can succeed while ours fails: the button greets you
 * by name, the ID token arrives, and only the exchange with Supabase breaks.
 * With a paused Supabase project that exchange failed on every click and the
 * only trace was a console line, so sign-in simply did nothing. These pin that
 * each way it can fail — an error returned, or a rejection thrown — reaches the
 * banner, and that a retry clears a stale one.
 *
 * The Supabase client is mocked here, unlike the data-layer suites: the auth
 * provider has no data module in between, and the token exchange is the thing
 * under test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { AuthRetryableFetchError } from "@supabase/supabase-js";

vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "test-client-id");

const signInWithIdToken = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithIdToken: (...a: unknown[]) => signInWithIdToken(...a),
    },
  }),
}));

const { AuthProvider } = await import("@/components/auth/auth-provider");

let gisCallback: ((r: { credential: string }) => Promise<void>) | null = null;

beforeEach(() => {
  gisCallback = null;
  window.google = {
    accounts: {
      id: {
        initialize: (config: { callback: typeof gisCallback }) => {
          gisCallback = config.callback;
        },
        renderButton: () => {},
        disableAutoSelect: () => {},
      },
    },
  } as unknown as typeof window.google;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  signInWithIdToken.mockReset();
  vi.restoreAllMocks();
});

async function mountAndSignIn() {
  render(
    <AuthProvider>
      <p>page</p>
    </AuthProvider>,
  );
  // `init` awaits the nonce digest before it hands Google the callback.
  await vi.waitFor(() => expect(gisCallback).not.toBeNull());
  await act(() => gisCallback!({ credential: "id-token" }));
}

describe("AuthProvider sign-in errors", () => {
  it("shows no banner when the exchange succeeds", async () => {
    signInWithIdToken.mockResolvedValue({ data: {}, error: null });
    await mountAndSignIn();
    expect(signInWithIdToken).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says the service is unreachable when the exchange can't connect", async () => {
    signInWithIdToken.mockResolvedValue({
      data: {},
      error: new AuthRetryableFetchError("Failed to fetch", 0),
    });
    await mountAndSignIn();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't reach the sign-in service/i);
  });

  it("shows a banner for a rejected token too", async () => {
    signInWithIdToken.mockResolvedValue({ data: {}, error: new Error("Invalid nonce") });
    await mountAndSignIn();
    expect(screen.getByRole("alert").textContent).toMatch(/sign-in didn't work/i);
  });

  it("shows a banner when the call throws rather than returning an error", async () => {
    signInWithIdToken.mockRejectedValue(new TypeError("Failed to fetch"));
    await mountAndSignIn();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't reach/i);
  });

  it("clears a stale banner when the next attempt succeeds", async () => {
    signInWithIdToken.mockResolvedValueOnce({ data: {}, error: new Error("nope") });
    await mountAndSignIn();
    expect(screen.getByRole("alert")).toBeTruthy();

    signInWithIdToken.mockResolvedValueOnce({ data: {}, error: null });
    await act(() => gisCallback!({ credential: "id-token" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
