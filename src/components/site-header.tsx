import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span
            className="inline-block h-5 w-5 rounded-full"
            style={{
              background:
                "conic-gradient(#ef4444,#f59e0b,#eab308,#22c55e,#06b6d4,#3b82f6,#8b5cf6,#ec4899,#ef4444)",
            }}
            aria-hidden="true"
          />
          <span>Paintdex</span>
        </Link>
        <nav className="ml-2 flex items-center gap-1 text-sm">
          <Link
            href="/paints"
            className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Browse paints
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <a
            href="https://github.com/s10-steve/paintdex"
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-block"
          >
            GitHub
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
