"use client";

/**
 * Shared auth gate for the profile pages (`/my-schemes`, `/my-paints`). Renders
 * the appropriate prompt when accounts are unavailable, still loading, or the
 * user is signed out — and its children only once signed in. Keeps the two
 * profile pages gating identically.
 */
import type { ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-provider";

function Panel({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-border bg-card p-4 shadow-sm">{children}</div>;
}

export function SignedInGate({ children }: { children: ReactNode }) {
  const { configured, user, loading } = useAuth();

  if (!configured) {
    return (
      <Panel>
        <p className="text-sm text-muted-foreground">
          Accounts aren&apos;t enabled on this deployment. Your schemes save in this
          browser only — use the Visualiser&apos;s Export button to back them up.
        </p>
      </Panel>
    );
  }

  if (loading) {
    return (
      <Panel>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </Panel>
    );
  }

  if (!user) {
    return (
      <Panel>
        <h2 className="text-lg font-semibold">Sign in to see this page</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use the sign-in button at the top right. Once signed in, your saved
          work appears here.
        </p>
      </Panel>
    );
  }

  return <>{children}</>;
}
