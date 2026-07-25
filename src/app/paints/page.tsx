import { Suspense } from "react";
import type { Metadata } from "next";
import { PaintsBrowser } from "@/components/paints-browser";
import { BROWSE_INDEX_URL } from "@/lib/paints/browse-index";
import { getAllPaints, getBrands } from "@/lib/paints/load";

export const metadata: Metadata = {
  title: "Browse paints",
  description:
    "Search and filter miniature paints by brand, range, type, colour family and hex value.",
  // Filters/search live in query params (?q=, ?brand=…); canonicalise to the
  // bare path so those permutations don't fragment as duplicate content.
  alternates: { canonical: "/paints" },
};

export default function PaintsPage() {
  const total = getAllPaints().length;
  const brandCount = getBrands().length;
  return (
    <main>
      {/* Preload the dataset so it downloads in parallel with the JS bundle
          instead of waiting for the client component to mount and fetch it
          (avoids a request waterfall on first load). Hoisted to <head>. */}
      <link
        rel="preload"
        href={BROWSE_INDEX_URL}
        as="fetch"
        crossOrigin="anonymous"
      />
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <h1 className="text-2xl font-bold tracking-tight">Browse paints</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total.toLocaleString()} paints across {brandCount} brands.
        </p>
      </div>
      <Suspense>
        <PaintsBrowser />
      </Suspense>
    </main>
  );
}
