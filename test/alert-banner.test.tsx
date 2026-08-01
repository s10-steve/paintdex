/**
 * @vitest-environment jsdom
 *
 * The shared notice format. Only two things here are load-bearing enough to pin:
 * the ARIA role, because two existing suites query these messages by role
 * (`scheme-visualiser.test.tsx` expects `status` for the deleted-scheme notice,
 * `schemes-manager.test.tsx` expects `alert` for its failures), and the dismiss
 * callback, because a banner fixed over the page with no way out is worse than
 * the inline text it replaced.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AlertBanner } from "@/components/alert-banner";

afterEach(cleanup);

describe("AlertBanner", () => {
  it("announces an error assertively", () => {
    render(<AlertBanner message="Couldn't delete that scheme." />);
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't delete/i);
  });

  it("announces a warning politely", () => {
    // The deleted-elsewhere notice isn't a failure the user caused, and
    // `scheme-visualiser.test.tsx` queries it as a status.
    render(<AlertBanner message="Deleted on another device." tone="warning" />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/another device/i);
  });

  it("dismisses when asked, and offers no button when it can't be dismissed", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <AlertBanner message="Boom" onDismiss={onDismiss} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledOnce();

    rerender(<AlertBanner message="Boom" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
