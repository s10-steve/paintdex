"use client";

/**
 * Mobile-only nav: a hamburger button that opens the site links in a dropdown,
 * so the header fits a phone width. Hidden at `sm` and up, where the links sit
 * inline in the header instead. A disclosure rather than an ARIA menu — see
 * `use-disclosure` — sharing its open/close behaviour with the account menu in
 * `auth/sign-in-button`.
 */
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./auth/auth-provider";
import { PROFILE_LINKS } from "./profile-nav";
import { useDisclosure } from "@/hooks/use-disclosure";

const LINKS = [
  { href: "/paints", label: "Paints" },
  { href: "/visualiser", label: "Visualiser" },
];

export function MobileNav({ className }: { className?: string }) {
  const { open, close, rootRef, buttonProps, panelProps } = useDisclosure();
  const pathname = usePathname();
  const { user } = useAuth();

  // Close when the route changes (a link was followed).
  useEffect(() => close(), [pathname, close]);

  return (
    <div className={`relative ${className ?? ""}`} ref={rootRef}>
      <button
        {...buttonProps}
        aria-label="Menu"
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
        <nav
          {...panelProps}
          aria-label="Site"
          className="absolute right-0 z-40 mt-2 w-44 rounded-md border border-border bg-card p-1 shadow-lg"
        >
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="block rounded-sm px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              {l.label}
            </Link>
          ))}
          {/* Signed-in profile pages, grouped under their own heading. */}
          {user && (
            <>
              <div className="my-1 border-t border-border" />
              <p className="px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Your profile
              </p>
              {PROFILE_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="block rounded-sm px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                >
                  {l.label}
                </Link>
              ))}
            </>
          )}
        </nav>
      )}
    </div>
  );
}
