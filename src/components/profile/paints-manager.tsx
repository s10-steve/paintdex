"use client";

/**
 * `/my-paints` — the paints you own and the ones you want to buy.
 *
 * Structured like `schemes-manager`: an auth gate around a list that may assume
 * a user, a loading panel, an empty state that points somewhere useful, and one
 * error string for the page.
 *
 * Two things differ from the schemes page, both because of what the database
 * stores. A row is a catalogue id and nothing else, so everything shown here —
 * name, brand, hex — is joined on from the browse index at render time, and the
 * page can't draw until both have arrived. And an id can outlive its paint, so
 * "not in the index" is a real state with its own row rather than an assertion
 * failure.
 *
 * Filter state is **local React state, not the URL**, which is the opposite of
 * `/paints` and the alternatives panel. The URL is the source of truth there
 * because those views are shareable; this one is `noindex`, per-user, and a link
 * to it means nothing to anyone else, so there is nothing for the URL to buy.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SignedInGate } from "@/components/profile/signed-in-gate";
import { AlertBanner } from "@/components/alert-banner";
import { useAuth } from "@/components/auth/auth-provider";
import { useCollection } from "@/components/collection/collection-provider";
import { useBrowseIndex } from "@/hooks/use-browse-index";
import { PaintFacets } from "@/components/paint-facets";
import { facetOptions } from "@/lib/paints/facet-availability";
import { filterPaints } from "@/lib/paints/filter";
import { PAINT_TYPES, type BrowsePaint, type PaintType } from "@/lib/paints/types";
import type { MetallicFilter } from "@/lib/paints/filter-params";
import type { PaintStatus } from "@/lib/supabase/types";
import { clearCollection, importCollection } from "@/lib/data/paint-collection";
import {
  COLLECTION_FILENAME,
  exportCollectionJSON,
  parseCollectionJSON,
} from "@/lib/paints/collection-io";
import { downloadJSON } from "@/lib/download";

export function PaintsManager() {
  return (
    <SignedInGate>
      <CollectionManager />
    </SignedInGate>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-card p-4 shadow-sm">{children}</div>;
}

/** One list's paints, plus the ids in it that no longer name a real paint. */
interface Bucket {
  paints: BrowsePaint[];
  stale: string[];
}

const EMPTY_BUCKET: Bucket = { paints: [], stale: [] };

const BUTTON =
  "rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50";

function CollectionManager() {
  const { user } = useAuth();
  const { entries, ready, setStatus, remove, reload } = useCollection();
  const { paints, loading: indexLoading, loadError } = useBrowseIndex();

  const [search, setSearch] = useState("");
  const [brands, setBrands] = useState<Set<string>>(new Set());
  const [ranges, setRanges] = useState<Set<string>>(new Set());
  const [types, setTypes] = useState<Set<PaintType>>(new Set());
  const [families, setFamilies] = useState<Set<string>>(new Set());
  const [metallic, setMetallic] = useState<MetallicFilter>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  /**
   * The collection joined against the catalogue, split by list.
   *
   * `includeDiscontinued` is hard-wired true and the facet is hidden. The
   * default elsewhere is false, which is right for browsing — but a collection
   * is a record of what you have, and plenty of it is discontinued. Filtering
   * those out here would quietly hide paints the user definitely owns, with a
   * control they'd have to find to explain it.
   */
  const { owned, wishlist, total } = useMemo(() => {
    if (!paints) return { owned: EMPTY_BUCKET, wishlist: EMPTY_BUCKET, total: 0 };

    const byId = new Map(paints.map((p) => [p.id, p]));
    const buckets: Record<PaintStatus, Bucket> = {
      owned: { paints: [], stale: [] },
      wishlist: { paints: [], stale: [] },
    };

    for (const [paintId, status] of entries) {
      const paint = byId.get(paintId);
      if (paint) buckets[status].paints.push(paint);
      else buckets[status].stale.push(paintId);
    }

    const apply = (bucket: Bucket): Bucket => ({
      ...bucket,
      paints: filterPaints(bucket.paints, {
        search,
        brands: [...brands],
        ranges: [...ranges],
        types: [...types],
        families: [...families],
        includeDiscontinued: true,
        metallic: metallic || undefined,
      }),
    });

    return {
      owned: apply(buckets.owned),
      wishlist: apply(buckets.wishlist),
      total: entries.size,
    };
  }, [paints, entries, search, brands, ranges, types, families, metallic]);

  /**
   * Facet options come from the collection, not the whole catalogue — offering
   * all 40-odd brands when you own paints from three would be a list of dead
   * ends. Unlike the browse sidebar there is no availability pruning pass: the
   * set is already small enough to show whole.
   */
  const options = useMemo(() => {
    const mine = paints
      ? [...entries.keys()]
          .map((id) => paints.find((p) => p.id === id))
          .filter((p): p is BrowsePaint => Boolean(p))
      : [];
    const uniq = (vs: string[]) => [...new Set(vs)].sort((a, b) => a.localeCompare(b));
    const present = new Set(mine.map((p) => p.type));
    return {
      brands: facetOptions(uniq(mine.map((p) => p.brand)), null, brands, "brands"),
      ranges: facetOptions(uniq(mine.map((p) => p.range)), null, ranges, "ranges"),
      types: facetOptions(
        PAINT_TYPES.filter((t) => present.has(t)),
        null,
        types,
        "types",
      ),
      families: facetOptions(uniq(mine.map((p) => p.family)), null, families, "families"),
    };
  }, [paints, entries, brands, ranges, types, families]);

  const toggleFacet = useCallback(
    (key: "brands" | "ranges" | "types" | "families", value: string) => {
      const setter = { brands: setBrands, ranges: setRanges, types: setTypes, families: setFamilies }[key];
      // One generic updater over four sets of different element types; the cast
      // is contained to this line rather than spread across four handlers.
      (setter as (fn: (prev: Set<string>) => Set<string>) => void)((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      });
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setSearch("");
    setBrands(new Set());
    setRanges(new Set());
    setTypes(new Set());
    setFamilies(new Set());
    setMetallic("");
  }, []);

  const filterCount =
    brands.size + ranges.size + types.size + families.size + (metallic ? 1 : 0) + (search ? 1 : 0);

  const doExport = useCallback(() => {
    downloadJSON(
      exportCollectionJSON([...entries].map(([paintId, status]) => ({ paintId, status }))),
      COLLECTION_FILENAME,
    );
  }, [entries]);

  const doImport = useCallback(
    async (file: File) => {
      if (!user) return;
      setBusy(true);
      setError(null);
      try {
        const parsed = parseCollectionJSON(await file.text());
        if (parsed.length === 0) {
          setError("That file didn't contain any paints we could read.");
          return;
        }
        // Replace is destructive and irreversible, so it is the branch that has
        // to be chosen — cancelling the prompt merges rather than aborting,
        // because merging is the safe outcome and the file is already open.
        const replace =
          entries.size > 0 &&
          window.confirm(
            `Import ${parsed.length} paints.\n\n` +
              "OK: replace your collection with this file.\n" +
              "Cancel: merge it into what you already have.",
          );
        if (replace) await clearCollection(user.id);
        await importCollection(user.id, parsed);
        await reload();
      } catch (e) {
        // `parseCollectionJSON` throws messages written for the user ("That
        // file isn't valid JSON"), so they're shown as-is; anything else is a
        // network or database failure and gets the generic line.
        setError(e instanceof Error ? e.message : "Couldn't import that file.");
      } finally {
        setBusy(false);
      }
    },
    [entries.size, reload, user],
  );

  if (!user) return null; // Guard keeps TypeScript happy; the gate handles it.

  if (!ready || indexLoading) {
    return (
      <Panel>
        <p className="text-sm text-muted-foreground">Loading your paints…</p>
      </Panel>
    );
  }

  if (loadError) {
    return (
      <Panel>
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load the paint database, so your collection can&apos;t be
          shown. Check your connection and try refreshing the page.
        </p>
      </Panel>
    );
  }

  if (total === 0) {
    return (
      <>
        <Panel>
          <h2 className="text-lg font-semibold">No paints yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add paints from the browse grid or any paint&apos;s page — the ✓ and ☆
            buttons put one in the paints you own or on your wishlist.
          </p>
          <Link
            href="/paints"
            className="mt-3 inline-block rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Browse paints
          </Link>
        </Panel>
        <div className="mt-4">
          <ImportControl busy={busy} inputRef={fileInput} onFile={doImport} />
        </div>
        {error ? <AlertBanner message={error} onDismiss={() => setError(null)} /> : null}
      </>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-[224px_minmax(0,1fr)]">
      <aside className="md:sticky md:top-4 md:self-start">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Filters{filterCount ? ` (${filterCount})` : ""}</h2>
          {filterCount > 0 ? (
            <button type="button" onClick={clearFilters} className="text-xs text-primary hover:underline">
              Clear all
            </button>
          ) : null}
        </div>
        <label className="mt-3 block">
          <span className="sr-only">Search your paints</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your paints"
            className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <div className="mt-2">
          <PaintFacets
            options={options}
            selected={{
              brands,
              ranges,
              types,
              families,
              metallic,
              // Never applied here — see the `includeDiscontinued` note above —
              // and the control is hidden, so this value is inert.
              includeDiscontinued: true,
            }}
            onToggle={toggleFacet}
            onMetallic={setMetallic}
            onDiscontinued={() => {}}
            show={{ discontinued: false }}
          />
        </div>
      </aside>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()} paint{total === 1 ? "" : "s"} in your collection
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={doExport} className={BUTTON}>
              Export
            </button>
            <ImportControl busy={busy} inputRef={fileInput} onFile={doImport} />
          </div>
        </div>

        <PaintSection
          title="Paints you own"
          list="owned"
          bucket={owned}
          filtered={filterCount > 0}
          onMove={(id) => void setStatus(id, "wishlist")}
          onRemove={(id) => void remove(id)}
        />
        <PaintSection
          title="Wishlist"
          list="wishlist"
          bucket={wishlist}
          filtered={filterCount > 0}
          onMove={(id) => void setStatus(id, "owned")}
          onRemove={(id) => void remove(id)}
        />
      </div>

      {error ? <AlertBanner message={error} onDismiss={() => setError(null)} /> : null}
    </div>
  );
}

/** The file picker, as a label wrapping a visually hidden input. */
function ImportControl({
  busy,
  inputRef,
  onFile,
}: {
  busy: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void | Promise<void>;
}) {
  return (
    <label className={`${BUTTON} cursor-pointer ${busy ? "opacity-50" : ""}`}>
      {busy ? "Importing…" : "Import"}
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        disabled={busy}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared so picking the same file twice fires `change` again — the
          // second attempt after a failed import is the case that needs it.
          e.target.value = "";
          if (file) void onFile(file);
        }}
      />
    </label>
  );
}

function PaintSection({
  title,
  list,
  bucket,
  filtered,
  onMove,
  onRemove,
}: {
  title: string;
  list: PaintStatus;
  bucket: Bucket;
  filtered: boolean;
  onMove: (paintId: string) => void;
  onRemove: (paintId: string) => void;
}) {
  const count = bucket.paints.length + bucket.stale.length;
  const moveLabel = list === "owned" ? "Move to wishlist" : "Move to owned";

  return (
    <section aria-label={title} className="mt-6">
      <h2 className="text-lg font-semibold">
        {title} <span className="text-sm font-normal text-muted-foreground">({count})</span>
      </h2>

      {count === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {filtered ? "Nothing here matches these filters." : "Nothing here yet."}
        </p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {bucket.paints.map((paint) => (
            // Two rows, not one. Side by side, "Move to wishlist" and "Remove"
            // took about 250px of a ~370px card and truncated most names to a
            // few characters — "Abaddon Bl…", "Agrax Earth…". Dropping them to
            // their own line gives the name the full width and costs one line
            // of card height, which is the cheaper of the two.
            <li
              key={paint.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm"
            >
              <span className="flex items-center gap-3">
                <span
                  className="h-12 w-12 shrink-0 rounded-md border border-border"
                  style={{ backgroundColor: paint.hex }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/paints/${paint.id}`}
                    className="block text-sm font-medium [overflow-wrap:anywhere] line-clamp-2 hover:text-primary"
                  >
                    {paint.name}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {paint.brand} · {paint.range}
                    {paint.discontinued ? " · discontinued" : ""}
                  </span>
                </span>
              </span>
              <span className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => onMove(paint.id)}
                  aria-label={`${moveLabel}: ${paint.name}`}
                  className={BUTTON}
                >
                  {moveLabel}
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(paint.id)}
                  aria-label={`Remove ${paint.name} from your collection`}
                  className={`${BUTTON} text-red-600 dark:text-red-400`}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}

          {/* Ids with no paint behind them any more — a rename, or a brand
              dropped from the catalogue. Shown rather than silently skipped:
              the count would otherwise not add up, and the only way to clear
              one is a Remove button, which needs a row to sit on. */}
          {bucket.stale.map((paintId) => (
            // Same two-row shape as a real paint's card, so the two sit level
            // in the grid rather than one being visibly shorter.
            <li
              key={paintId}
              className="flex flex-col gap-2 rounded-xl border border-dashed border-border bg-card p-3"
            >
              <span className="flex items-center gap-3">
                <span
                  className="h-12 w-12 shrink-0 rounded-md border border-dashed border-border"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-xs [overflow-wrap:anywhere] line-clamp-2">
                    {paintId}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    No longer in the catalogue
                  </span>
                </span>
              </span>
              <span className="flex justify-end">
                <button
                  type="button"
                  onClick={() => onRemove(paintId)}
                  aria-label={`Remove ${paintId} from your collection`}
                  className={`${BUTTON} text-red-600 dark:text-red-400`}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
