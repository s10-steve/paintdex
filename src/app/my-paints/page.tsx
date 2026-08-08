import type { Metadata } from "next";
import { PaintsManager } from "@/components/profile/paints-manager";

export const metadata: Metadata = {
  title: "My paints",
  description: "The paints you own, and the ones you still want to buy.",
  alternates: { canonical: "/my-paints" },
  // Personal, per-user page — nothing to index.
  robots: { index: false, follow: false },
};

export default function MyPaintsPage() {
  return (
    // Wider than the other profile page: this one has a filter sidebar beside
    // the lists, where `/my-schemes` is a single column of cards.
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">My paints</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The paints you own, and the ones you still want to buy.
      </p>
      <div className="mt-6">
        <PaintsManager />
      </div>
    </main>
  );
}
