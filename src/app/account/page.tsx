import type { Metadata } from "next";
import { AccountManager } from "@/components/account/account-manager";

export const metadata: Metadata = {
  title: "My account",
  description: "Manage your saved paint schemes: rename, duplicate, delete and share.",
  alternates: { canonical: "/account" },
  // Personal, per-user page — nothing to index.
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">My account</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage your saved paint schemes and share them with others.
      </p>
      <AccountManager />
    </main>
  );
}
