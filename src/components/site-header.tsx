import Link from "next/link";
import { SignInButton } from "./auth/sign-in-button";
import { MobileNav } from "./mobile-nav";
import { ProfileNav } from "./profile-nav";
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
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <a
            href="https://github.com/s10-steve/paintdex"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Paintdex on GitHub"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.27-.01-1.17-.02-2.13-3.2.7-3.87-1.36-3.87-1.36-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.12 3.04.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.07.78 2.15 0 1.55-.01 2.8-.01 3.18 0 .31.21.67.8.56A10.53 10.53 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
            </svg>
          </a>
          {/* Signed-in-only profile links, grouped with the account icon on the
              right so they read as logged-in features (hidden when signed out). */}
          <ProfileNav />
          <SignInButton />
          <MobileNav className="sm:hidden" />
        </div>
      </div>
    </header>
  );
}
