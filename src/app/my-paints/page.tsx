import type { Metadata } from "next";
import { PaintsPlaceholder } from "@/components/profile/paints-placeholder";

export const metadata: Metadata = {
  title: "My paints",
  description: "Track the paints you own (coming soon).",
  alternates: { canonical: "/my-paints" },
  // Personal, per-user page — nothing to index.
  robots: { index: false, follow: false },
};

export default function MyPaintsPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">My paints</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The paints you own — for suggesting colours from your collection.
      </p>
      <div className="mt-6">
        <PaintsPlaceholder />
      </div>
    </main>
  );
}
