import type { Metadata } from "next";
import { SchemesManager } from "@/components/profile/schemes-manager";

export const metadata: Metadata = {
  title: "My schemes",
  description: "Manage your saved paint schemes: rename, duplicate, delete and share.",
  alternates: { canonical: "/my-schemes" },
  // Personal, per-user page — nothing to index.
  robots: { index: false, follow: false },
};

export default function MySchemesPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">My schemes</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage your saved paint schemes and share them with others.
      </p>
      <div className="mt-6">
        <SchemesManager />
      </div>
    </main>
  );
}
