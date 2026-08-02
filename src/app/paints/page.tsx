import { Suspense } from "react";
import type { Metadata } from "next";
import { PaintsBrowser } from "@/components/paints-browser";
import { BROWSE_INDEX_URL } from "@/lib/paints/browse-index";
import { getAllPaints, getBrands } from "@/lib/paints/load";
import { PAINT_TYPES } from "@/lib/paints/types";
import { COLOUR_FAMILIES } from "@/lib/color";

const TITLE = "Compare paints";
const DESCRIPTION =
  "Compare miniature paints by brand, range, type, colour family and hex value — filter the database to find alternatives.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // Filters/search live in query params (?q=, ?brand=…); canonicalise to the
  // bare path so those permutations don't fragment as duplicate content.
  alternates: { canonical: "/paints" },
  // Without this the root layout's `openGraph` is inherited whole, so a shared
  // link previewed as the homepage pointing at "/".
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/paints" },
};

export default function PaintsPage() {
  const catalogue = getAllPaints();
  const total = catalogue.length;
  const brands = getBrands();
  const brandCount = brands.length;

  // The facet universe, computed at build time and handed to the client. Browse
  // used to derive these from the fetched index, which left the sidebar empty
  // until ~1MB of JSON arrived; passing them means it renders immediately, and
  // matches how /paints/[id] has always supplied its facets. Kept in the
  // canonical PAINT_TYPES / COLOUR_FAMILIES order.
  const presentTypes = new Set(catalogue.map((p) => p.type));
  const presentFamilies = new Set(catalogue.map((p) => p.family));
  const ranges = [...new Set(catalogue.map((p) => p.range))].sort((a, b) =>
    a.localeCompare(b),
  );
  return (
    <main>
      {/* Preload the dataset so it downloads in parallel with the JS bundle
          instead of waiting for the client component to mount and fetch it
          (avoids a request waterfall on first load). Hoisted to <head>. */}
      {/* No `crossOrigin`: this is a same-origin asset and `fetchBrowseIndex`
          requests it with default (same-origin) credentials. The two must match
          or the browser keeps two cache entries — and a credentialled request is
          the one that works behind Vercel's Deployment Protection. */}
      <link rel="preload" href={BROWSE_INDEX_URL} as="fetch" />
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <h1 className="text-2xl font-bold tracking-tight">Compare paints</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total.toLocaleString()} paints across {brandCount} brands — filter to
          compare colours and find alternatives.
        </p>
      </div>
      <Suspense>
        <PaintsBrowser
          brands={brands}
          ranges={ranges}
          types={PAINT_TYPES.filter((t) => presentTypes.has(t))}
          families={COLOUR_FAMILIES.filter((f) => presentFamilies.has(f))}
        />
      </Suspense>
    </main>
  );
}
