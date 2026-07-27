"use client";

/**
 * Header auth control. Signed out, it shows the official Google Identity
 * Services button (rendered from our own origin, so the consent screen is
 * branded to paintdex.app); signed in, an account menu.
 *
 * The Google button is rendered into a persistent container that is merely
 * hidden when signed in — never unmounted. Google mutates the DOM inside that
 * node, so letting React swap it out would leave a stray iframe; keeping it
 * mounted (and the avatar as a separate sibling) avoids that. Google renders
 * its own iframe that CSS can't reach, so dark mode is handled by re-rendering
 * the button with the matching `theme` whenever the resolved theme changes.
 *
 * The container also carries `gsi-host`, which the one rule we *can* apply to
 * that iframe hangs off — see the "Google sign-in button" block in
 * `globals.css` for why it's needed (it stops the browser painting a white box
 * behind the button in dark mode). Keep the two in step.
 */
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useAuth } from "./auth-provider";

export function SignInButton() {
  const { configured, googleEnabled, gisReady, user, loading, signOut } = useAuth();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const gsiRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // The full "Sign in with Google" pill is too wide for a phone header, so below
  // the `sm` breakpoint render the shorter "Sign in" label instead. Track the
  // viewport so the button re-renders when it crosses the breakpoint.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setCompact(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Close the account menu on an outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // (Re-)render the Google button whenever it, its container, or the resolved
  // theme changes. Google's button is an iframe we can't style with CSS, so the
  // only way to follow dark mode is to re-render it with the matching `theme`.
  // The container is cleared first so we never stack multiple buttons.
  useEffect(() => {
    if (!mounted || !gisReady || !gsiRef.current || !window.google) return;
    gsiRef.current.innerHTML = "";
    window.google.accounts.id.renderButton(gsiRef.current, {
      type: "standard",
      theme: resolvedTheme === "dark" ? "filled_black" : "outline",
      size: "large",
      shape: "pill",
      // Shorter "Sign in" on mobile so the pill fits the phone header; the full
      // "Sign in with Google" at sm+. (The icon-only variant rendered blank.)
      text: compact ? "signin" : "signin_with",
      logo_alignment: "left",
    });
  }, [gisReady, mounted, loading, user, resolvedTheme, compact]);

  // Accounts unavailable, or before the first client-side session check.
  if (!configured || !mounted || loading) {
    return <span className="h-10 w-10" aria-hidden="true" />;
  }

  const label = user?.email ?? "Account";
  const initial = (label[0] ?? "?").toUpperCase();

  return (
    <div className="flex items-center">
      {/* Google button: rendered once, hidden (not unmounted) when signed in. */}
      {googleEnabled && (
        <div
          ref={gsiRef}
          className={user ? "gsi-host hidden" : "gsi-host"}
          aria-hidden={Boolean(user)}
        />
      )}

      {/* Account menu, shown when signed in. */}
      {user && (
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={label}
          >
            {initial}
          </button>
          {open && (
            <div
              role="menu"
              className="absolute right-0 z-40 mt-2 w-56 rounded-md border border-border bg-card p-1 shadow-lg"
            >
              <p className="truncate px-3 py-2 text-xs text-muted-foreground" title={label}>
                {label}
              </p>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  void signOut();
                }}
                className="block w-full rounded-sm px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
