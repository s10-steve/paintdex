import type { Metadata } from "next";
import { SchemeVisualiser } from "@/components/scheme-visualiser";
import { BROWSE_INDEX_URL } from "@/components/paints-browser";

export const metadata: Metadata = {
  title: "Scheme visualiser",
  description:
    "Plan a miniature paint scheme: group paints by element and see every element's colours as blended vertical bars, side by side.",
};

export default function VisualiserPage() {
  return (
    <main>
      {/* Preload the paint database so it downloads alongside the JS bundle
          (same cached asset the browse page uses). */}
      <link rel="preload" href={BROWSE_INDEX_URL} as="fetch" crossOrigin="anonymous" />
      <div className="mx-auto max-w-[1420px] px-4 pt-6">
        <h1 className="text-2xl font-bold tracking-tight">Scheme visualiser</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Enter your paints grouped by element, then see how the whole
          miniature&apos;s colours read next to each other. Your scheme saves in this
          browser.
        </p>
      </div>
      <SchemeVisualiser />
    </main>
  );
}
