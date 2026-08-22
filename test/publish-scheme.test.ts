/**
 * What `publishScheme` tells the user when its write matches no row.
 *
 * "Matched no row" is two different things wearing the same face: the row was
 * deleted on another device, or this session quietly lapsed to the anon key,
 * where `auth.uid()` is null and RLS hides every row we own. The same select
 * that would settle it runs under the same policies (see `schemeExists`), so the
 * only evidence available is the session itself — the two-step the autosave
 * already does in `use-scheme-sync`.
 *
 * This matters because the message is now shown verbatim: telling someone their
 * scheme was deleted elsewhere when they had merely been logged out is worse
 * than the generic line it replaces, because it is confidently wrong.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

/** The one PostgREST result the fake client hands back, set per test. */
let result: { data: unknown; error: unknown } = { data: [{ id: "row-1" }], error: null };

vi.mock("@/lib/supabase/client", () => ({
  getSupabase: () => ({
    from: () => ({
      update: () => ({
        eq: () => ({
          select: async () => result,
        }),
      }),
    }),
  }),
}));

const hasLiveSession = vi.fn<() => Promise<boolean>>();
vi.mock("@/lib/supabase/session", () => ({
  hasLiveSession: () => hasLiveSession(),
}));

const { publishScheme, SchemeShareError } = await import("@/lib/data/schemes");

/** A regenerate callback that would be used only on a unique-violation retry. */
const regenerate = () => "shared-ffffffffff";

beforeEach(() => {
  result = { data: [{ id: "row-1" }], error: null };
  hasLiveSession.mockReset();
  hasLiveSession.mockResolvedValue(true);
});

describe("publishScheme", () => {
  it("returns the slug that stuck", async () => {
    await expect(publishScheme("row-1", "shared-a1b2c3d4e5", regenerate)).resolves.toBe(
      "shared-a1b2c3d4e5",
    );
    // No round trip to ask about the session on the happy path.
    expect(hasLiveSession).not.toHaveBeenCalled();
  });

  it("blames a deletion elsewhere only when the session is live", async () => {
    result = { data: [], error: null };
    await expect(publishScheme("row-1", "shared-a1b2c3d4e5", regenerate)).rejects.toThrow(
      /deleted on another device/i,
    );
  });

  it("blames the session when there isn't one", async () => {
    result = { data: [], error: null };
    hasLiveSession.mockResolvedValue(false);
    // `.catch()` alone leaves the resolve type in the union, so `err` is
    // `string | Error` and `err.message` doesn't typecheck. `next build` on
    // 16.2 doesn't reach this file and never said so; on 16.3 it does, which is
    // what failed Dependabot's Next bump. `.then()` with both arms fixes the
    // type and says what the test means anyway: this call must reject.
    const err = await publishScheme("row-1", "shared-a1b2c3d4e5", regenerate).then(
      () => {
        throw new Error("publishScheme resolved; it should have rejected");
      },
      (e: unknown) => e as Error,
    );
    expect(err.message).toMatch(/session may have expired/i);
    expect(err.message).not.toMatch(/deleted/i);
  });

  it("marks its messages as fit to show the user", async () => {
    // `useShareActions` shows a `SchemeShareError`'s message verbatim and
    // replaces anything else with a generic line, so the class is the contract.
    result = { data: [], error: null };
    await expect(
      publishScheme("row-1", "shared-a1b2c3d4e5", regenerate),
    ).rejects.toBeInstanceOf(SchemeShareError);
  });

  it("passes a raw PostgREST failure through unmarked", async () => {
    // Not a unique-violation and not "gone": nothing we have words for, and its
    // own message is no use to a user.
    result = { data: null, error: { code: "42501", message: "permission denied" } };
    const err = await publishScheme("row-1", "shared-a1b2c3d4e5", regenerate).catch(
      (e) => e as Error,
    );
    expect(err).not.toBeInstanceOf(SchemeShareError);
    expect(hasLiveSession).not.toHaveBeenCalled();
  });

  it("retries a taken slug once, then gives up with a message of its own", async () => {
    result = { data: null, error: { code: "23505", message: "duplicate key" } };
    await expect(publishScheme("row-1", "shared-a1b2c3d4e5", regenerate)).rejects.toThrow(
      /couldn't create a share link/i,
    );
  });
});
