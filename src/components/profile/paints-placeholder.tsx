"use client";

/**
 * Placeholder for the future "My paints" feature (roadmap: save the paints you
 * own so schemes can suggest colours from your collection). Auth-gated like the
 * other profile pages so the navigation and sign-in behaviour are consistent
 * now, with the real inventory UI to follow.
 */
import { SignedInGate } from "@/components/profile/signed-in-gate";

export function PaintsPlaceholder() {
  return (
    <SignedInGate>
      <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center shadow-sm">
        <div aria-hidden className="text-2xl">🎨</div>
        <h2 className="mt-2 text-lg font-semibold tracking-tight">Coming soon</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Soon you&apos;ll be able to track the paints you own here, so the
          visualiser and shared recipes can suggest colours from your own
          collection.
        </p>
      </div>
    </SignedInGate>
  );
}
