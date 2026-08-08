import type { Metadata } from "next";
import { SchemeVisualiser } from "@/components/scheme-visualiser";
import { BROWSE_INDEX_URL } from "@/lib/paints/browse-index";

const TITLE = "Scheme visualiser";
const DESCRIPTION =
  "Plan a miniature paint scheme: group paints by element and see every element's colours as vertical bars, side by side.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/visualiser" },
  // `openGraph` is inherited wholesale from the root layout when a page omits
  // it, so without this a shared /visualiser link previewed as the homepage —
  // its title, and its `url: "/"`. `/paints/[id]` has always done this.
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/visualiser" },
};

export default function VisualiserPage() {
  return (
    <main>
      {/* Preload the paint database so it downloads alongside the JS bundle
          (same cached asset the browse page uses). */}
      <link rel="preload" href={BROWSE_INDEX_URL} as="fetch" />
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
