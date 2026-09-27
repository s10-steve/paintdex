"use client";

/**
 * "Your paints for this scheme": which of the scheme's paints you own, which
 * are on your wishlist, which you'd need to buy — with "add all to wishlist" and,
 * for each one you haven't got, the closest paint you own.
 *
 * The rules live in `lib/scheme/shopping-list.ts`; this is presentation.
 *
 * - **Signed out it renders nothing**, like every other collection control: the
 *   feature is accounts-only and the visualiser already has its own sign-in
 *   nudge.
 * - **It waits for both the collection and the catalogue.** With the catalogue
 *   still loading every paint would resolve to no id and land in "not in the
 *   catalogue", which is a wrong answer shown confidently.
 * - **Collapsed by default** (a native `<details>`), so it costs one line of an
 *   editor that's already long; the summary carries the counts, so the answer
 *   to "have I got everything?" is visible without opening it.
 * - **"Add all to wishlist" never demotes an owned paint**: it acts on the
 *   `needed` group, which by construction holds only paints in neither list,
 *   and the provider skips anything already at that status.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import type { BrowsePaint } from "@/lib/paints/types";
import type { Scheme } from "@/lib/scheme/types";
import {
  shoppingList,
  type ClosestOwned,
  type NeededItem,
  type ShoppingItem,
  type UnmatchedItem,
} from "@/lib/scheme/shopping-list";
import { useCollection } from "@/components/collection/collection-provider";
import { CollectionToggle } from "@/components/collection/collection-toggle";
import { MatchBadge } from "@/components/match-badge";

export function ShoppingListCard({
  scheme,
  dbPaints,
  loadError,
}: {
  scheme: Scheme;
  dbPaints: BrowsePaint[] | null;
  loadError: boolean;
}) {
  const { enabled, phase, entries, setStatusMany } = useCollection();
  const [busy, setBusy] = useState(false);

  const hasPaints = scheme.elements.some((e) => e.paints.length > 0);
  const list = useMemo(
    () =>
      enabled && phase === "ready" && dbPaints && hasPaints
        ? shoppingList(scheme, dbPaints, entries)
        : null,
    [enabled, phase, dbPaints, hasPaints, scheme, entries],
  );

  if (!enabled || !hasPaints) return null;

  if (!list) {
    return (
      <div className="mb-5 rounded-md border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground">
        {loadError
          ? "Couldn’t load the paint database, so this scheme can’t be checked against your paints."
          : phase === "failed"
            ? "Couldn’t load your paints to check this scheme against them."
            : "Checking this scheme against your paints…"}
      </div>
    );
  }

  const { owned, wishlist, needed, unmatched } = list;

  const addAll = async () => {
    setBusy(true);
    try {
      await setStatusMany(
        needed.map((n) => n.paintId),
        "wishlist",
      );
    } finally {
      setBusy(false);
    }
  };

  const summary = [
    `${owned.length} owned`,
    wishlist.length ? `${wishlist.length} on wishlist` : null,
    needed.length ? `${needed.length} to buy` : null,
    unmatched.length ? `${unmatched.length} not in the catalogue` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <details className="group mb-5 rounded-md border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="text-xs text-muted-foreground transition-transform group-open:rotate-90"
        >
          ▶
        </span>
        <span className="font-medium">Your paints for this scheme</span>
        <span className="ml-auto text-xs text-muted-foreground">{summary}</span>
      </summary>

      <div className="space-y-4 border-t border-border px-3 pb-3 pt-3">
        {needed.length > 0 ? (
          <Group
            title="To buy"
            action={
              <button
                type="button"
                onClick={() => void addAll()}
                disabled={busy}
                className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                {busy ? "Adding…" : "Add all to wishlist"}
              </button>
            }
          >
            {needed.map((item) => (
              <PaintRow key={item.paintId} item={item} closest={item.closestOwned} />
            ))}
          </Group>
        ) : null}

        {wishlist.length > 0 ? (
          <Group title="On your wishlist">
            {wishlist.map((item) => (
              <PaintRow key={item.paintId} item={item} closest={item.closestOwned} />
            ))}
          </Group>
        ) : null}

        {unmatched.length > 0 ? (
          <Group title="Not in the catalogue">
            {unmatched.map((item) => (
              <UnmatchedRow key={`${item.brand}|${item.name}|${item.hex}`} item={item} />
            ))}
          </Group>
        ) : null}

        {owned.length > 0 ? (
          <Group title="You own">
            {owned.map((item) => (
              <PaintRow key={item.paintId} item={item} />
            ))}
          </Group>
        ) : null}

        {needed.length === 0 && wishlist.length === 0 && unmatched.length === 0 ? (
          <p className="text-xs text-muted-foreground">You own every paint in this scheme.</p>
        ) : null}
      </div>
    </details>
  );
}

function Group({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <div className="mb-1.5 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      <ul className="space-y-1.5">{children}</ul>
    </section>
  );
}

const Swatch = ({ hex }: { hex: string }) => (
  <span
    aria-hidden
    className="h-6 w-6 flex-none rounded-md ring-1 ring-inset ring-black/15"
    style={{ background: hex }}
  />
);

function PaintRow({
  item,
  closest,
}: {
  item: ShoppingItem | NeededItem;
  closest?: ClosestOwned | null;
}) {
  const { paint } = item;
  return (
    <li className="rounded-md bg-muted/40 px-2 py-1.5">
      <div className="flex items-center gap-2">
        <Swatch hex={paint.hex} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/paints/${paint.id}`}
            prefetch={false}
            className="block truncate text-[13px] font-medium hover:underline"
          >
            {paint.name}
          </Link>
          <span className="block truncate text-[11.5px] text-muted-foreground">
            {paint.brand} · {paint.range}
            {paint.discontinued ? " · Discontinued" : ""} — {item.elements.join(", ")}
          </span>
        </div>
        <CollectionToggle paintId={paint.id} paintName={paint.name} size="sm" />
      </div>
      {closest !== undefined ? <Closest closest={closest} forId={paint.id} /> : null}
    </li>
  );
}

function UnmatchedRow({ item }: { item: UnmatchedItem }) {
  return (
    <li className="rounded-md bg-muted/40 px-2 py-1.5">
      <div className="flex items-center gap-2">
        <Swatch hex={item.hex} />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{item.name}</span>
          <span className="block truncate text-[11.5px] text-muted-foreground">
            {item.reason === "custom"
              ? "Custom colour — mix it yourself"
              : `${item.brand} — not found in the catalogue`}{" "}
            — {item.elements.join(", ")}
          </span>
        </div>
      </div>
      <Closest closest={item.closestOwned} />
    </li>
  );
}

/**
 * The closest owned paint, by colour. Said as "closest colour you own" rather
 * than "substitute", because ΔE knows nothing about whether a wash can stand in
 * for a base.
 */
function Closest({ closest, forId }: { closest: ClosestOwned | null; forId?: string }) {
  if (!closest) {
    return (
      <p className="mt-1 pl-8 text-[11.5px] text-muted-foreground">
        Nothing you own to compare it with yet.
      </p>
    );
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-8 text-[11.5px] text-muted-foreground">
      <span>Closest colour you own:</span>
      <span
        aria-hidden
        className="h-3.5 w-3.5 flex-none rounded ring-1 ring-inset ring-black/15"
        style={{ background: closest.paint.hex }}
      />
      <Link
        href={`/paints/${closest.paint.id}`}
        prefetch={false}
        className="font-medium text-foreground hover:underline"
      >
        {closest.paint.name}
      </Link>
      <MatchBadge distance={closest.distance} />
      {forId ? (
        // Ties back to "Your paints" on the paint page: the whole ranked list of
        // what you own, not just the one nearest.
        <Link
          href={`/paints/${forId}?mine=owned`}
          prefetch={false}
          className="text-primary hover:underline"
        >
          Compare with all yours →
        </Link>
      ) : null}
    </div>
  );
}
