"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertBanner } from "./alert-banner";
import { Bar, useBarHover } from "./scheme-bars";
import { ElementCard, type ElementHandlers } from "./scheme/element-card";
import { PosterStudio } from "./scheme/poster-studio";
import { useAuth } from "./auth/auth-provider";
import { useBrowseIndex } from "@/hooks/use-browse-index";
import { useLocalScheme } from "@/hooks/use-local-scheme";
import { useSchemeNew } from "@/hooks/use-scheme-new";
import { useSchemePreset } from "@/hooks/use-scheme-preset";
import { useSchemeShare } from "@/hooks/use-scheme-share";
import { useSchemeSync } from "@/hooks/use-scheme-sync";
import {
  emptyScheme,
  MAX_SCHEME_TITLE,
  type Scheme,
  type SchemeElement,
  type SchemePaint,
  type SchemeRole,
} from "@/lib/scheme/types";
import { moveItem } from "@/lib/scheme/bars";
import { schemeHasContent } from "@/lib/scheme/sync";
import { exportSchemeJSON, importScheme, schemeSlug } from "@/lib/scheme/io";
import { uid } from "@/lib/scheme/uid";
/**
 * The scheme visualiser (`/visualiser`) — the editor for a paint scheme.
 *
 * This file is now the wiring: it composes four hooks, turns their state into
 * the editor's mutations, and renders. Here's where everything lives.
 *
 * **State, by concern — each its own hook**
 * - `useLocalScheme()` — the scheme document, the `blend` view preference
 *   (deliberately NOT part of a saved scheme) and the `mounted` gate, backed by
 *   `localStorage`. Always on, even when signed in: it's the anonymous fallback
 *   and the source the account layer migrates from on first login.
 * - `useBrowseIndex()` — the paint catalogue, from the same static
 *   `browse-index.json` the browse page uses, so it stays out of the JS bundle.
 * - `useSchemeSync()` — accounts: the user's saved schemes, the sign-in
 *   reconciliation, the debounced Supabase autosave, `?scheme=` deep links. The
 *   subtlest code in the feature; its own doc comment has the details, and
 *   `test/scheme-visualiser.test.tsx` pins the behaviour that must not regress
 *   (work built while signed out is adopted as a NEW scheme, never overwritten).
 * - `useSchemeShare()` — publishing the active scheme under an unguessable link.
 *
 * Everything left in this file is either a `setScheme` wrapper (the immutable
 * element/paint updates, grouped into `elementHandlers`), the JSON import/export
 * pair, or JSX.
 *
 * **The presentational pieces** live in `./scheme/`, all driven by props:
 * `ElementCard` (one element and its paint rows; it declares the
 * `ElementHandlers` type this file fills in), `LayerRow` (a single paint within
 * an element), `AddPaint` (the paint search / custom-colour entry form),
 * `IconBtn`, and `RoleTag` (shared with the read-only `scheme-view`).
 *
 * **About the `eslint-disable`s.** They live in the hooks now, not here, and
 * they're deliberate: this feature reads client-only sources — `localStorage`,
 * `window.location`, the auth session — which can't be touched during SSR
 * without a hydration mismatch, hence the `mounted` gate and setting state from
 * effects. The two `exhaustive-deps` suppressions keep the sign-in and deep-link
 * effects from re-firing on every scheme edit. Each site has its own inline
 * comment; read that before removing one, and don't treat removing them as a
 * goal in itself — forcing it tends to reintroduce hydration bugs.
 */

export function SchemeVisualiser() {
  // The scheme document plus its localStorage layer (always on — see above).
  const { scheme, setScheme, blend, setBlend, mounted } = useLocalScheme();
  // Bar hover + tooltip live in a shared hook so the read-only viewer can reuse
  // the same visualisation; here we additionally link hover to the editor rows.
  const { hovered, hover, tooltip } = useBarHover();
  // Paint database, fetched from the same static asset the browse page uses.
  const { paints: dbPaints, loadError } = useBrowseIndex();
  // Accounts: the user's saved schemes, reconciliation on sign-in, autosave.
  const {
    savedSchemes,
    activeSchemeId,
    activeRow,
    syncState,
    setSyncState,
    notice,
    dismissNotice,
    selectScheme,
    newScheme,
    adoptScheme,
    ready,
    patchRow,
  } = useSchemeSync({ scheme, setScheme, mounted });
  // Publishing the active scheme under an unguessable share link.
  const { shareBusy, copied, togglePublished, copyShareLink } = useSchemeShare({
    activeRow,
    patchRow,
    onError: () => setSyncState("error"),
  });
  const { user, configured, googleEnabled } = useAuth();
  // `?new=1` — "+ New scheme" on /my-schemes. Same gates as the preset hook.
  useSchemeNew({
    setScheme,
    mounted,
    ready,
    signedIn: Boolean(user),
    newScheme,
    hasContent: () => schemeHasContent(scheme),
  });
  // `?preset=<slug>` — the homepage carousel's "Open in the designer" link. Gated
  // on `ready` so it can't race the sign-in reconciliation; see the hook.
  useSchemePreset({
    scheme,
    setScheme,
    paints: dbPaints,
    mounted,
    ready,
    signedIn: Boolean(user),
    adoptScheme,
  });

  /* ---- immutable scheme updates ---- */
  const mutateElement = (eid: string, fn: (e: SchemeElement) => SchemeElement) =>
    setScheme((s) => ({ ...s, elements: s.elements.map((e) => (e.id === eid ? fn(e) : e)) }));
  const mutatePaints = (eid: string, fn: (paints: SchemePaint[]) => SchemePaint[]) =>
    mutateElement(eid, (e) => ({ ...e, paints: fn(e.paints) }));

  const setTitle = (title: string) => setScheme((s) => ({ ...s, title }));
  const renameElement = (eid: string, name: string) => mutateElement(eid, (e) => ({ ...e, name }));
  const removeElement = (eid: string) =>
    setScheme((s) => ({ ...s, elements: s.elements.filter((e) => e.id !== eid) }));
  const moveElement = (eid: string, dir: -1 | 1) =>
    setScheme((s) => ({ ...s, elements: moveItem(s.elements, eid, dir) }));
  const addElement = () =>
    setScheme((s) => ({
      ...s,
      elements: [...s.elements, { id: uid(), name: "New element", paints: [] }],
    }));

  const addPaint = (eid: string, paint: Omit<SchemePaint, "id">) =>
    mutatePaints(eid, (paints) => [...paints, { ...paint, id: uid() }]);
  const removePaint = (eid: string, pid: string) =>
    mutatePaints(eid, (paints) => paints.filter((p) => p.id !== pid));
  const movePaint = (eid: string, pid: string, dir: -1 | 1) =>
    mutatePaints(eid, (paints) => moveItem(paints, pid, dir));
  const setRole = (eid: string, pid: string, role: SchemeRole) =>
    mutatePaints(eid, (paints) =>
      paints.map((p) => (p.id === pid ? { ...p, role, weight: undefined } : p)),
    );
  const setWeight = (eid: string, pid: string, weight: number) =>
    mutatePaints(eid, (paints) => paints.map((p) => (p.id === pid ? { ...p, weight } : p)));

  // Handed to every `ElementCard` as one object. Deliberately not memoised: the
  // updaters above are re-created each render anyway (they only ever call
  // `setScheme` with an updater, so they never go stale) and `ElementCard` isn't
  // memoised either, so this is exactly what the per-row arrow props cost before.
  const elementHandlers: ElementHandlers = {
    rename: renameElement,
    move: moveElement,
    remove: removeElement,
    addPaint,
    movePaint,
    removePaint,
    setRole,
    setWeight,
  };

  /**
   * Replace the editor's document with `next`.
   *
   * The signed-in branch is the important one, and it's the same rule
   * `useSchemePreset` and `useSchemeNew` already follow: go through
   * `adoptScheme`, which saves `next` as a **new** row. Calling `setScheme`
   * directly leaves the debounced autosave to write `next` over whatever row is
   * active — so "Reset" silently blanked a saved scheme and "Import" silently
   * replaced one with the contents of a file.
   *
   * It also decides who needs a confirm. Signed in, nothing is lost (the old
   * scheme stays saved and selectable), so prompting would be asking permission
   * for something that isn't happening. Signed out, `localStorage` is the only
   * copy and this really is destructive.
   */
  const replaceScheme = (next: Scheme, confirmMessage: string) => {
    if (user && activeSchemeId) {
      void adoptScheme(next);
      setBlend(false);
      return;
    }
    if (schemeHasContent(scheme) && !window.confirm(confirmMessage)) return;
    setScheme(next);
    setBlend(false);
  };

  const reset = () =>
    replaceScheme(
      emptyScheme(),
      "Clear this scheme and start fresh? It isn't saved to an account, so this can't be undone.",
    );

  /* ---- export / import (no accounts — a JSON file is the save format) ---- */
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // The share-image studio. Mounted only while open so its canvas, its photo
  // and the localStorage read behind it cost nothing on a normal visit.
  const [studioOpen, setStudioOpen] = useState(false);

  const doExport = () => {
    const blob = new Blob([exportSchemeJSON(scheme)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${schemeSlug(scheme.title)}.paintdex.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const doImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = importScheme(String(reader.result), uid);
        setImportError(null);
        replaceScheme(
          imported,
          "Replace the scheme you're working on with this file? It isn't saved to an account, so this can't be undone.",
        );
      } catch (err) {
        setImportError(err instanceof Error ? err.message : "Couldn't import that file.");
      }
    };
    reader.onerror = () => setImportError("Couldn't read that file.");
    reader.readAsText(file);
  };

  const paintCount = useMemo(
    () => scheme.elements.reduce((n, e) => n + e.paints.length, 0),
    [scheme],
  );

  return (
    <div className="mx-auto max-w-[1420px] px-4 pb-16">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)]">
        {/* Guidance — its own grid item so all the intro text stays together.
            On mobile (single column) `order` keeps it above the visualisation;
            on desktop explicit grid placement puts it at the top of the left
            column, above the editor. */}
        <div className="order-1 max-w-[62ch] space-y-2 text-sm text-muted-foreground lg:order-none lg:col-start-1 lg:row-start-1">
          <p>
            Enter your paints grouped by element,
            then see how the whole miniature&apos;s colours read next to each
            other. Export them as a JSON file, or <b className="font-semibold text-foreground">
            log in to save and share them via unique URLs.</b>
          </p>
          <p>
            Give each a  <b className="font-semibold text-foreground">role</b>: base, layer,
            highlight and drybrush build the tonal ramp; wash, glaze and weathering sit over
            it. The{" "}
            <b className="font-semibold text-foreground">weight</b> slider sets how much of
            the bar a layer takes.
          </p>
          <p>
            Order elements by how much of the model they cover —{" "}
            <b className="font-semibold text-foreground">largest first</b> (armour), smallest
            last (lenses). Bar widths follow the order; use the ↑↓ buttons to rearrange.
          </p>
        </div>

        {/* LEFT — editor. Last on mobile (order-3), left column below the
            guidance on desktop. */}
        <section
          aria-label="Paint entry"
          className="order-3 lg:order-none lg:col-start-1 lg:row-start-2"
        >
          {user && (
            // Wider bottom margin than the rest of the column: this is what
            // holds the share calls to action apart from the scheme picker, so
            // they read as their own thing rather than part of "My schemes".
            <div className="mb-6 rounded-md border border-border bg-card">
              {/* Pick / create the scheme being edited. */}
              <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                <label htmlFor="saved-schemes" className="text-xs font-medium text-muted-foreground">
                  My schemes
                </label>
                <select
                  id="saved-schemes"
                  value={activeSchemeId ?? ""}
                  onChange={(e) => selectScheme(e.target.value)}
                  disabled={savedSchemes.length === 0}
                  className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {savedSchemes.length === 0 && <option value="">No saved schemes</option>}
                  {savedSchemes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title || "Untitled scheme"}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void newScheme()}
                  className="rounded-md border border-border px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted"
                >
                  New
                </button>
                <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
                  {syncState === "saving" && "Saving…"}
                  {syncState === "saved" && "Saved"}
                  {syncState === "error" && (
                    <span className="text-red-600 dark:text-red-400">Sync error</span>
                  )}
                  {syncState === "limit" && (
                    <span className="text-red-600 dark:text-red-400">
                      Scheme limit reached — delete one to add another.
                    </span>
                  )}
                </span>
              </div>

            </div>
          )}

          {/* Share — its own card, deliberately separated from "My schemes"
              above so the two calls to action are the first thing you see.
              Always rendered: the image studio works signed out (it reads the
              localStorage scheme), so gating the whole box on an account would
              hide the feature from exactly the people most likely to try it. */}
          <div className="mb-5 rounded-md border border-border bg-card px-3 py-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setStudioOpen(true)}
                disabled={scheme.elements.length === 0}
                className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Create shareable image
              </button>
              <button
                type="button"
                onClick={() => void togglePublished()}
                disabled={!activeRow || shareBusy || activeRow.is_public}
                className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Create shareable link
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {!activeRow && (
                <span className="text-muted-foreground">
                  A shareable image is made in your browser.{" "}
                  {user
                    ? "Save this scheme to create a link as well."
                    : "Sign in to create a shareable link as well."}
                </span>
              )}
              {activeRow?.is_public && activeRow.share_slug && (
                <>
                  <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
                    <span aria-hidden>●</span> Public — anyone with the link can view
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyShareLink()}
                    className="rounded-md border border-border px-2 py-1 text-foreground transition-colors hover:bg-muted"
                  >
                    {copied ? "Copied!" : "Copy link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void togglePublished()}
                    disabled={shareBusy}
                    className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Stop sharing
                  </button>
                </>
              )}
              {activeRow && !activeRow.is_public && (
                <span className="text-muted-foreground">Private to your account.</span>
              )}
              {activeRow && (
                <Link
                  href="/my-schemes"
                  className="ml-auto text-primary underline-offset-2 hover:underline"
                >
                  Manage in My schemes →
                </Link>
              )}
            </div>
          </div>

          {mounted && configured && googleEnabled && !user && (
            <div className="mb-3.5 flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              <span aria-hidden className="text-sm leading-none">💾</span>
              <span>
                <b className="font-medium text-foreground">Sign in to save your schemes.</b>{" "}
                Use the sign-in button at the top right to keep your schemes on your
                account and sync them across devices. Until then, they&apos;re saved in
                this browser only.
              </span>
            </div>
          )}

          <div className="mb-4">
            <input
              value={scheme.title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Scheme name"
              // Matches the column's check constraint, so a long title is
              // stopped here rather than coming back as an opaque sync error.
              maxLength={MAX_SCHEME_TITLE}
              spellCheck={false}
              placeholder="Untitled scheme"
              className="w-full bg-transparent py-0.5 text-3xl font-bold tracking-tight outline-none sm:text-4xl"
            />
            <div className="mt-1 h-0.5 rounded bg-gradient-to-r from-primary to-transparent" />
          </div>

          <div className="mb-3.5 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            <h2 className="text-[15px] font-semibold tracking-tight">Elements &amp; paints</h2>
            <span className="text-xs text-muted-foreground">base → highlight, top to bottom</span>
            <div className="ml-auto flex flex-none items-center gap-0.5">
              <button
                onClick={() => fileRef.current?.click()}
                title="Load a scheme from a .json file"
                className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Import
              </button>
              <button
                onClick={doExport}
                title="Download this scheme as a .json file (your backup / to share)"
                className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Export
              </button>
              <button
                onClick={reset}
                title="Clear the scheme and start fresh"
                className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Reset
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) doImportFile(file);
                e.target.value = "";
              }}
            />
          </div>
          {importError && (
            <p className="mb-2 text-xs text-red-600 dark:text-red-400" role="alert">
              {importError}
            </p>
          )}

          <div className="flex flex-col gap-3.5">
            {scheme.elements.map((element, i) => (
              <ElementCard
                key={element.id}
                element={element}
                index={i}
                count={scheme.elements.length}
                dbPaints={dbPaints}
                loadError={loadError}
                hovered={hovered}
                hover={hover}
                handlers={elementHandlers}
              />
            ))}
          </div>

          <button
            onClick={addElement}
            className="mt-3.5 w-full rounded-xl border-[1.5px] border-dashed border-input py-3 text-[13.5px] font-medium text-muted-foreground transition-colors hover:border-primary hover:bg-accent hover:text-accent-foreground"
          >
            + Add element
          </button>
        </section>

        {/* RIGHT — visualisation */}
        {/* RIGHT — visualisation. Placed between the guidance and the editor
            on mobile (order-2) so the result sits near the top; spans the full
            right column on desktop. */}
        <section
          aria-label="Colour visualisation"
          className="order-2 lg:order-none lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-[4.75rem]"
        >
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center gap-3.5 border-b border-border bg-muted px-4 py-3.5">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{scheme.title || "Your scheme"}</h2>
                <div className="text-xs text-muted-foreground">Every element, side by side</div>
              </div>
              <label className="ml-auto inline-flex cursor-pointer select-none items-center gap-2 text-[13px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={blend}
                  onChange={(e) => setBlend(e.target.checked)}
                  className="peer sr-only"
                />
                <span className="relative h-[22px] w-[38px] flex-none rounded-full border border-input bg-muted transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:border-primary peer-checked:bg-primary peer-checked:after:translate-x-4 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring" />
                <span className="font-medium text-foreground">{blend ? "Blended" : "Banded"}</span>
              </label>
            </div>

            <div className="overflow-x-auto px-4 pb-2 pt-5">
              <div className="flex min-h-[360px] items-start gap-3">
                <div className="flex h-[340px] flex-none flex-col items-end justify-between pr-1">
                  <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] uppercase tracking-widest text-muted-foreground">
                    highlight → base
                  </span>
                </div>
                {scheme.elements.map((element, i) => (
                  <Bar
                    key={element.id}
                    element={element}
                    index={i}
                    blend={blend}
                    hovered={hovered}
                    hover={hover}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2 border-t border-border px-4 pb-3.5 pt-2.5 text-xs text-muted-foreground">
              <span>
                <b className="font-semibold text-foreground">{scheme.elements.length}</b> elements
              </span>
              <span>
                <b className="font-semibold text-foreground">{paintCount}</b> paints
              </span>
              <span className="ml-auto flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <i
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ background: "linear-gradient(to top, var(--role-base), var(--role-highlight))" }}
                  />
                  base · layer · highlight · drybrush
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i
                    className="inline-block h-2.5 w-2.5 rounded-sm ring-1 ring-inset ring-[var(--role-wash)]"
                    style={{ background: "repeating-linear-gradient(45deg, var(--role-wash), var(--role-wash) 2px, transparent 2px, transparent 4px)" }}
                  />
                  wash · glaze · weathering (overlay)
                </span>
              </span>
            </div>
          </div>
        </section>
      </div>

      {studioOpen && <PosterStudio scheme={scheme} onClose={() => setStudioOpen(false)} />}

      {/* Something happened to this user's data on another device. Deliberately
          not part of the sync status, which the next keystroke overwrites with
          "Saving…" a second later — and deliberately out here rather than inside
          the signed-in-only "My schemes" card, which is often scrolled off.

          Not while the studio is open: it's a `fixed inset-0` modal on the same
          layer, so a later-in-DOM banner painted over it, and the modal's Tab
          trap cycles within its own subtree — leaving Dismiss on screen with no
          keyboard path to it. `notice` is state, so it reappears on close. */}
      {notice && !studioOpen && (
        <AlertBanner message={notice} tone="warning" onDismiss={dismissNotice} />
      )}

      {/* Shared hover tooltip (positioned imperatively; see useBarHover). */}
      {tooltip}
    </div>
  );
}
