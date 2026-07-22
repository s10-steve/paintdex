import type { Metadata } from "next";
import { SchemeVisualiser } from "@/components/scheme-visualiser";
import { BROWSE_INDEX_URL } from "@/components/paints-browser";

export const metadata: Metadata = {
  title: "Scheme visualiser",
  description:
    "Plan a miniature paint scheme: group paints by element and see every element's colours as blended vertical bars, side by side.",
  alternates: { canonical: "/visualiser" },
};

export default function VisualiserPage() {
  return (
    <main>
      {/* Preload the paint database so it downloads alongside the JS bundle
          (same cached asset the browse page uses). */}
      <link rel="preload" href={BROWSE_INDEX_URL} as="fetch" crossOrigin="anonymous" />
      <div className="mx-auto max-w-[1420px] px-4 pt-6">
        {/* The descriptive intro lives with the guidance block in
            scheme-visualiser.tsx (one place, consistent spacing, correct
            stacking order on mobile). */}
        <h1 className="text-2xl font-bold tracking-tight">Scheme visualiser</h1>
      </div>
      <SchemeVisualiser />
    </main>
  );
}
