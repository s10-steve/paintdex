"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { travelQuery } from "@/lib/paints/filter-params";

/**
 * "← Back to all paints", carrying the paint page's current filters so the round
 * trip loses nothing.
 *
 * It needs no plumbing from the alternatives panel, because of an invariant the
 * panel already maintains: every filter change is written with
 * `history.replaceState`, so `window.location.search` *is* the live filter state.
 * That's why this is a five-line component rather than a context provider — the
 * alternative was hoisting the panel's whole state machine above the fold just to
 * inform one anchor.
 *
 * Deliberately **not** `useSearchParams`: this page has no Suspense boundary, and
 * adding one would push the alternatives section out of the prerendered HTML on
 * all 4,961 paint pages.
 */
export function BackToBrowse() {
  const pathname = usePathname();
  const router = useRouter();
  // Starts bare, which is also what we want in the prerendered HTML: the static
  // markup keeps clean hrefs and nothing query-bearing is crawlable.
  const [href, setHref] = useState("/paints");

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    // Upgrade after mount so middle-click, ⌘-click and "Copy link address" get
    // the filtered URL rather than a bare one. It has to be after hydration: the
    // prerendered HTML can't know the query, and must keep a clean href anyway.
    setHref(`/paints${travelQuery(new URLSearchParams(window.location.search))}`);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [pathname]);

  return (
    <Link
      href={href}
      onClick={(e) => {
        // The effect runs once per navigation, but the panel keeps rewriting the
        // URL as facets are ticked. Recompute at click time so a filter set after
        // mount still travels.
        const live = `/paints${travelQuery(new URLSearchParams(window.location.search))}`;
        if (live !== href) {
          e.preventDefault();
          setHref(live);
          router.push(live);
        }
      }}
      className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      ← Back to all paints
    </Link>
  );
}
