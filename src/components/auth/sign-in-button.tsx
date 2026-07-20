"use client";

/**
 * Header auth control. Signed out, it shows the official Google Identity
 * Services button (rendered from our own origin, so the consent screen is
 * branded to paintdex.app); signed in, an account menu.
 *
 * The Google button is rendered exactly once into a persistent container that
 * is merely hidden when signed in — never unmounted. Google mutates the DOM
 * inside that node, so letting React swap it out would leave a stray iframe;
 * keeping it mounted (and the avatar as a separate sibling) avoids that.
 */
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-provider";

export function SignInButton() {
  const { configured, googleEnabled, gisReady, user, loading, signOut } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const gsiRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

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

  // Render the Google button once, when it and its container are ready.
  useEffect(() => {
    if (renderedRef.current || !gisReady || !gsiRef.current || !window.google) return;
    renderedRef.current = true;
    window.google.accounts.id.renderButton(gsiRef.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "pill",
      text: "signin_with",
      logo_alignment: "left",
    });
  }, [gisReady, loading, user]);

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
        <div ref={gsiRef} className={user ? "hidden" : undefined} aria-hidden={Boolean(user)} />
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
