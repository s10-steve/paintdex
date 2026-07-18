import { Suspense } from "react";
import type { Metadata } from "next";
import { PaintsBrowser } from "@/components/paints-browser";
import { getAllPaints, getBrands } from "@/lib/paints/load";

export const metadata: Metadata = {
  title: "Browse paints",
  description:
    "Search and filter miniature paints by brand, range, type, colour family and hex value.",
};

export default function PaintsPage() {
  const total = getAllPaints().length;
  const brandCount = getBrands().length;
  return (
    <main>
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
