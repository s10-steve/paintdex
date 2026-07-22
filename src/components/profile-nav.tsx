"use client";

/**
 * Signed-in-only header links to the profile pages (My schemes / My paints),
 * shown inline on desktop. On mobile these collapse into `mobile-nav` instead.
 * Rendered nothing when signed out, so the account icon stays purely for
 * signing in/out.
 */
import Link from "next/link";
import { useAuth } from "./auth/auth-provider";

export const PROFILE_LINKS = [
  { href: "/my-schemes", label: "My schemes" },
  { href: "/my-paints", label: "My paints" },
];

export function ProfileNav() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <>
      {PROFILE_LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {l.label}
        </Link>
      ))}
    </>
  );
}
