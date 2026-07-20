"use client";

/**
 * Header auth control. Signed out, it shows the official Google Identity
 * Services button (rendered from our own origin, so the consent screen is
 * branded to paintdex.app); signed in, an account menu. Renders nothing until
 * mounted (auth state is client-only) and nothing when Supabase isn't
 * configured. If no Google client id is set, it falls back to a plain button
 * that uses Supabase's redirect sign-in.
 */
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useAuth } from "./auth-provider";

export function SignInButton() {
  const {
    configured,
    googleEnabled,
    gisReady,
    user,
    loading,
    signInWithGoogleRedirect,
    signOut,
  } = useAuth();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const gsiRef = useRef<HTMLDivElement>(null);

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

  // Render (or re-render on theme change) the Google button while signed out.
  useEffect(() => {
    if (!mounted || user || !gisReady || !gsiRef.current || !window.google) return;
    gsiRef.current.innerHTML = "";
    window.google.accounts.id.renderButton(gsiRef.current, {
      type: "icon",
      shape: "circle",
      size: "large",
      theme: resolvedTheme === "dark" ? "filled_black" : "outline",
    });
  }, [mounted, user, gisReady, resolvedTheme]);

  // Accounts unavailable, or before the first client-side session check.
  if (!configured || !mounted || loading) {
    return <span className="h-9 w-9" aria-hidden="true" />;
  }

  if (!user) {
    if (googleEnabled) {
      // The Google button renders here once GIS is ready; keep a fixed-size
      // slot so the header doesn't shift while it loads.
      return <div ref={gsiRef} className="flex h-10 w-10 items-center justify-center" />;
    }
    // Fallback: no Google client id configured — use Supabase's redirect flow.
    return (
      <button
        type="button"
        onClick={() => void signInWithGoogleRedirect()}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Sign in
      </button>
    );
  }

  const label = user.email ?? "Account";
  const initial = (label[0] ?? "?").toUpperCase();

  return (
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
  );
}
