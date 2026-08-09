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
import { useCallback, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SignedInGate } from "@/components/profile/signed-in-gate";
import { AlertBanner } from "@/components/alert-banner";
import { useAuth } from "@/components/auth/auth-provider";
import { useCollection } from "@/components/collection/collection-provider";
import { LISTS } from "@/components/collection/collection-toggle";
import { useBrowseIndex } from "@/hooks/use-browse-index";
import { PaintFacets } from "@/components/paint-facets";
import { facetOptions } from "@/lib/paints/facet-availability";
import { filterPaints } from "@/lib/paints/filter";
import {
  COLLECTION_SORTS,
  GROUP_AXES,
  MAX_GROUP_AXES,
  groupCollection,
  type CollectionSort,
  type GroupAxis,
  type PaintGroup,
} from "@/lib/paints/collection-view";
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

/**
 * One list, ready to render: its paints already sorted and split into headings
 * (a single unlabelled group when grouping is off), plus the ids in it that no
 * longer name a real paint.
 */
interface Bucket {
  groups: PaintGroup[];
  count: number;
  stale: string[];
}

const EMPTY_BUCKET: Bucket = { groups: [], count: 0, stale: [] };

const BUTTON =
  "rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50";

/** An action on a card: 24px, the WCAG 2.5.8 floor the rest of the app sizes to. */
const ICON_BUTTON =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border text-[11px] font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const AXIS_LABELS: Record<GroupAxis, string> = {
  brand: "Brand",
  range: "Range",
  type: "Type",
  family: "Colour family",
};

const SORT_LABELS: Record<CollectionSort, string> = {
  name: "Sort: name (A–Z)",
  hue: "Sort: hue",
  chroma: "Sort: saturation",
  lightness: "Sort: lightness",
};

const SELECT =
  "rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Two columns, never three. Three fitted, but a name long enough to wrap makes
 * its card taller than its neighbours, and at three columns that happens in
 * most rows — the grid looked ragged rather than dense.
 */
const CARD_GRID = "mt-3 grid gap-2 sm:grid-cols-2";

/**
 * The name/meta column, with the second line of the name reserved whether or not
 * it's used (`min-h-10` = two `text-sm` lines).
 *
 * That's what actually makes the cards a uniform height: grid rows stretch to
 * their tallest card, so one wrapped name sets the height for its whole row and
 * the rows differ from each other. Reserving the line costs ~16px on a
 * short-named card and leaves every card identical.
 */
const CARD_TEXT = "min-h-10 min-w-0 flex-1";

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
  // Display options, not filters: they say how to present the page rather than
  // which paints you want, so "Clear all" leaves them alone — the same split
  // browse makes between its facets and its `sort`.
  //
  // An ordered array rather than a Set, because the order is the nesting: the
  // axis ticked first is the outer heading, which is the only way to get both
  // "Citadel → Base" and "Base → Citadel" out of two checkboxes.
  //
  // Brand + hue rather than the old ungrouped A–Z: alphabetical is a list of
  // words, where brand groups sorted round the spectrum are a picture of what
  // you own — which is the whole point of the page.
  const [groupAxes, setGroupAxes] = useState<GroupAxis[]>(["brand"]);
  const [sort, setSort] = useState<CollectionSort>("hue");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // `useId` rather than a literal: `PaintFacets` renders its own controls on the
  // same page, and hardcoded ids are what let two copies of a control collide.
  const sortId = useId();

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
    const raw: Record<PaintStatus, { paints: BrowsePaint[]; stale: string[] }> = {
      owned: { paints: [], stale: [] },
      wishlist: { paints: [], stale: [] },
    };

    for (const [paintId, status] of entries) {
      const paint = byId.get(paintId);
      if (paint) raw[status].paints.push(paint);
      else raw[status].stale.push(paintId);
    }

    // Filter first, then arrange: `filterPaints` decides which paints you want,
    // `groupCollection` decides how they're laid out.
    const apply = ({ paints: mine, stale }: { paints: BrowsePaint[]; stale: string[] }): Bucket => {
      const kept = filterPaints(mine, {
        search,
        brands: [...brands],
        ranges: [...ranges],
        types: [...types],
        families: [...families],
        includeDiscontinued: true,
        metallic: metallic || undefined,
      });
      return { groups: groupCollection(kept, groupAxes, sort), count: kept.length, stale };
    };

    return {
      owned: apply(raw.owned),
      wishlist: apply(raw.wishlist),
      total: entries.size,
    };
  }, [paints, entries, search, brands, ranges, types, families, metallic, groupAxes, sort]);

  /** Tick appends (so tick order is nesting order); untick removes. */
  const toggleAxis = useCallback((axis: GroupAxis) => {
    setGroupAxes((prev) => (prev.includes(axis) ? prev.filter((a) => a !== axis) : [...prev, axis]));
  }, []);

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
          <div className="flex flex-wrap items-center gap-2">
            {/* One set of controls for both lists. Per-section copies would
                double the decisions to make and mean two ids per control. */}
            <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {/* The legend is what a screen reader announces for the group, so
                  it carries the cap in words; the visible hint says the same
                  thing and is hidden from the accessibility tree to avoid
                  announcing it twice. */}
              <legend className="sr-only">Group paints by (up to {MAX_GROUP_AXES})</legend>
              <span aria-hidden className="text-xs text-muted-foreground">
                Group by <span className="text-[10px]">(up to {MAX_GROUP_AXES})</span>
              </span>
              {GROUP_AXES.map((axis) => {
                const checked = groupAxes.includes(axis);
                return (
                  <label
                    key={axis}
                    className={`flex items-center gap-1.5 text-xs ${
                      // Disabled rather than silently dropping the oldest pick:
                      // nothing rearranges behind the user's back, and the hint
                      // above says why before they reach the cap.
                      !checked && groupAxes.length >= MAX_GROUP_AXES
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-[var(--primary)]"
                      checked={checked}
                      disabled={!checked && groupAxes.length >= MAX_GROUP_AXES}
                      onChange={() => toggleAxis(axis)}
                    />
                    {AXIS_LABELS[axis]}
                  </label>
                );
              })}
            </fieldset>
            <label htmlFor={sortId} className="sr-only">
              Sort paints by
            </label>
            <select
              id={sortId}
              value={sort}
              onChange={(e) => setSort(e.target.value as CollectionSort)}
              className={SELECT}
            >
              {COLLECTION_SORTS.map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
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
  const count = bucket.count + bucket.stale.length;
  const moveLabel = list === "owned" ? "Move to wishlist" : "Move to owned";
  // The icon of the list the button moves the paint *to*, from the one place
  // each list is named — so this page and the ✓/☆ toggles everywhere else can't
  // end up using different glyphs for the same two lists.
  const moveIcon = list === "owned" ? LISTS.wishlist.icon : LISTS.owned.icon;

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
        <>
          {bucket.groups.map((group) => (
            <GroupBlock
              key={group.key || "all"}
              group={group}
              depth={0}
              moveLabel={moveLabel}
              moveIcon={moveIcon}
              onMove={onMove}
              onRemove={onRemove}
            />
          ))}

          {/* Ids with no paint behind them any more — a rename, or a brand
              dropped from the catalogue. Shown rather than silently skipped:
              the count would otherwise not add up, and the only way to clear
              one is a Remove button, which needs a row to sit on. Kept out of
              the groups: there's no brand or family to file them under. */}
          {bucket.stale.length > 0 ? (
            <ul className={CARD_GRID}>
              {bucket.stale.map((paintId) => (
                // Same single-row shape as a real paint's card, so the two sit
                // level in the grid rather than one being visibly shorter.
                <li
                  key={paintId}
                  className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-card p-2.5"
                >
                  <span
                    className="h-10 w-10 shrink-0 rounded-md border border-dashed border-border"
                    aria-hidden="true"
                  />
                  <span className={CARD_TEXT}>
                    <span className="block font-mono text-xs [overflow-wrap:anywhere] line-clamp-2">
                      {paintId}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      No longer in the catalogue
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(paintId)}
                    aria-label={`Remove ${paintId} from your collection`}
                    title={`Remove ${paintId} from your collection`}
                    className={`${ICON_BUTTON} text-red-600 dark:text-red-400`}
                  >
                    <span aria-hidden>✕</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * One heading and what's under it — its subgroups, or its paints.
 *
 * Recursive because grouping takes up to two axes, and the two levels differ
 * only in heading level and weight. A group with an empty key is the ungrouped
 * whole, which is why there is one shape here rather than a branch: no key, no
 * heading.
 */
function GroupBlock({
  group,
  depth,
  moveLabel,
  moveIcon,
  onMove,
  onRemove,
}: {
  group: PaintGroup;
  depth: number;
  moveLabel: string;
  moveIcon: string;
  onMove: (paintId: string) => void;
  onRemove: (paintId: string) => void;
}) {
  // Heading level tracks depth, so the page's outline stays h2 → h3 → h4 rather
  // than repeating one level for two different things.
  const Heading = depth === 0 ? "h3" : "h4";

  return (
    <div className={depth > 0 ? "border-l border-border pl-3" : undefined}>
      {group.key ? (
        <Heading
          className={`${depth === 0 ? "mt-4 text-sm" : "mt-3 text-xs"} font-semibold text-muted-foreground`}
        >
          {group.label} <span className="font-normal">({group.paints.length})</span>
        </Heading>
      ) : null}

      {group.groups.length > 0 ? (
        group.groups.map((child) => (
          <GroupBlock
            key={child.key}
            group={child}
            depth={depth + 1}
            moveLabel={moveLabel}
            moveIcon={moveIcon}
            onMove={onMove}
            onRemove={onRemove}
          />
        ))
      ) : (
        <ul className={CARD_GRID}>
          {group.paints.map((paint) => (
            // One row. The two actions used to be full-text buttons on a second
            // line, because side by side with the name they took about 250px of
            // a ~370px card and truncated most of them — "Abaddon Bl…", "Agrax
            // Earth…". As 24px icons they cost ~56px instead, which the name can
            // spare, and the card gets a whole line of height back.
            <li
              key={paint.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 shadow-sm"
            >
              <span
                className="h-10 w-10 shrink-0 rounded-md border border-border"
                style={{ backgroundColor: paint.hex }}
                aria-hidden="true"
              />
              <span className={CARD_TEXT}>
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
              <span className="flex shrink-0 gap-1">
                {/* `title` and `aria-label` are the same string: an icon button
                    that announces something other than what its tooltip says is
                    worse than either alone. */}
                <button
                  type="button"
                  onClick={() => onMove(paint.id)}
                  aria-label={`${moveLabel}: ${paint.name}`}
                  title={`${moveLabel}: ${paint.name}`}
                  className={`${ICON_BUTTON} text-muted-foreground hover:text-foreground`}
                >
                  <span aria-hidden>{moveIcon}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(paint.id)}
                  aria-label={`Remove ${paint.name} from your collection`}
                  title={`Remove ${paint.name} from your collection`}
                  className={`${ICON_BUTTON} text-red-600 dark:text-red-400`}
                >
                  <span aria-hidden>✕</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
