/**
 * @vitest-environment jsdom
 *
 * The share card's two calls to action. Only the image button's verb is
 * interesting: "Create" promises a blank studio, so a scheme that already has a
 * photo should say "Edit" instead of surprising you with your own model.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ShareCard } from "@/components/scheme/share-card";
import type { SchemeRow } from "@/lib/supabase/types";

const noop = () => {};

function card(props: Partial<React.ComponentProps<typeof ShareCard>> = {}) {
  render(
    <ShareCard
      activeRow={null}
      signedIn={false}
      canMakeImage
      hasImage={false}
      shareBusy={false}
      copied={false}
      onOpenStudio={noop}
      onTogglePublished={noop}
      onCopyLink={noop}
      {...props}
    />,
  );
}

afterEach(cleanup);

describe("ShareCard image button", () => {
  it("offers to create one when there is no image", () => {
    card();
    expect(screen.getByRole("button", { name: "Create shareable image" })).toBeTruthy();
  });

  it("offers to edit the one that exists", () => {
    card({ hasImage: true });
    expect(screen.getByRole("button", { name: "Edit shareable image" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create shareable image" })).toBeNull();
  });

  it("is disabled for an empty scheme, whichever verb it shows", () => {
    // Nothing to put on the poster, so the studio would open onto an empty one.
    card({ canMakeImage: false, hasImage: true });
    const button = screen.getByRole("button", { name: "Edit shareable image" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the link button's wording independent of the image", () => {
    // Two different artefacts sharing one card; an image must not make the link
    // button claim a link exists.
    const row = { id: "r1", is_public: false, share_slug: null, title: "s" } as SchemeRow;
    card({ hasImage: true, activeRow: row, signedIn: true });
    expect(screen.getByRole("button", { name: "Create shareable link" })).toBeTruthy();
  });
});
