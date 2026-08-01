"use client";

/**
 * The app's one notice format: a red box pinned to the bottom-centre of the
 * viewport.
 *
 * Errors used to render wherever their state happened to live, which is how the
 * "deleted on another device" notice ended up inside the signed-in-only "My
 * schemes" card — set by a hook that runs regardless of whether that card is on
 * screen, so on a scrolled page it was announced to nobody. Fixed positioning
 * decouples where a message is *owned* from where it is *seen*.
 *
 * Presentational only, and deliberately not a toast provider. Every caller
 * already owns the state (`use-scheme-sync` has `notice`, `schemes-manager` has
 * `error`), so a context would add plumbing to a static site and buy nothing.
 * The trade-off is that two banners from two owners would stack on top of each
 * other; nothing renders two at once today.
 */

export type AlertTone = "error" | "warning";

export function AlertBanner({
  message,
  tone = "error",
  onDismiss,
}: {
  message: string;
  /**
   * `error` is announced assertively; `warning` is for "something happened to
   * your data elsewhere" — worth interrupting for, but not a failure the user
   * caused. Both look the same; only the ARIA role differs.
   */
  tone?: AlertTone;
  onDismiss?: () => void;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      // No portal: `layout.tsx` puts no transformed ancestor between here and
      // the body, so `fixed` already escapes the page flow, and a portal would
      // cost a mount effect for nothing.
      className="fixed bottom-6 left-1/2 z-50 flex max-w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-2 rounded-lg border border-red-500/40 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg dark:bg-red-950 dark:text-red-300"
    >
      <span aria-hidden className="leading-tight">
        ⚠️
      </span>
      <span className="min-w-0 flex-1">{message}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="flex-none rounded-md px-1.5 py-0.5 text-red-700/70 transition-colors hover:bg-red-500/10 hover:text-red-700 dark:text-red-300/70 dark:hover:text-red-300"
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
