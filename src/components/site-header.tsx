import Link from "next/link";
import { SignInButton } from "./auth/sign-in-button";
import { MobileNav } from "./mobile-nav";
import { LogoMark } from "./logo-mark";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <LogoMark className="h-5 w-5" />
          <span>Paintdex</span>
        </Link>
        {/* Inline links on ≥ sm; on mobile they collapse into the menu below. */}
        <nav className="ml-2 hidden items-center gap-1 text-sm sm:flex">
          <Link
            href="/paints"
            className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Paints
          </Link>
          <Link
            href="/visualiser"
            className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Visualiser
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <SignInButton />
          <MobileNav className="sm:hidden" />
        </div>
      </div>
    </header>
  );
}
