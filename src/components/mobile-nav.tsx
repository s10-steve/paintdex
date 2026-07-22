"use client";

/**
 * Mobile-only nav: a hamburger button that opens the site links in a dropdown,
 * so the header fits a phone width. Hidden at `sm` and up, where the links sit
 * inline in the header instead. Mirrors the account menu's open/outside-click
 * behaviour in `auth/sign-in-button`.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./auth/auth-provider";

const LINKS = [
  { href: "/paints", label: "Paints" },
  { href: "/visualiser", label: "Visualiser" },
];

export function MobileNav({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { user } = useAuth();

  // Signed-in users get a link to their account page (matching the account
  // menu on ≥ sm, which is off-screen on mobile).
  const links = user ? [...LINKS, { href: "/account", label: "My account" }] : LINKS;

  // Close when the route changes (a link was followed).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOpen(false), [pathname]);

  // Close on an outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className={`relative ${className ?? ""}`} ref={ref}>
      <button
        type="button"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-44 rounded-md border border-border bg-card p-1 shadow-lg"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              role="menuitem"
              className="block rounded-sm px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
