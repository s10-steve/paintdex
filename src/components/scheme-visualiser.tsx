"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { BROWSE_INDEX_URL } from "./paints-browser";
import { filterPaints } from "@/lib/paints/filter";
import type { BrowsePaint } from "@/lib/paints/types";
import {
  ROLES,
  ROLE_KEYS,
  roleOf,
  weightOf,
  emptyScheme,
  type Scheme,
  type SchemeElement,
  type SchemePaint,
  type SchemeRole,
} from "@/lib/scheme/types";
import {
  barModel,
  rampGradient,
  overlayCenter,
  clamp,
  elementSize,
  moveItem,
} from "@/lib/scheme/bars";
import {
  exportSchemeJSON,
  importScheme,
  importSchemeObject,
  schemeSlug,
  toExportShape,
} from "@/lib/scheme/io";
import { planSignInScheme } from "@/lib/scheme/sync";
import { useAuth } from "./auth/auth-provider";
import {
  listSchemes,
  createScheme,
  updateScheme,
  deleteScheme,
} from "@/lib/data/schemes";
import type { SchemeRow } from "@/lib/supabase/types";

const STORE = "paintdex-scheme-v1";

/**
 * True when a Supabase error is the per-account scheme-count cap firing (the
 * `enforce_scheme_quota` trigger in supabase/schema.sql raises a message
 * starting "Scheme limit reached"). Lets the picker show a specific,
 * actionable message rather than the generic "Sync error".
 */
function isSchemeLimitError(err: unknown): boolean {
  const message =
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message ?? "")
      : "";
  return message.toLowerCase().includes("scheme limit reached");
}

/** Runtime-unique id for paints/elements added after load. */
let counter = 0;
const uid = () => `u${++counter}`;

/** CSS var wiring for the colour-mixed role tag. */
function roleVarStyle(role: SchemeRole): CSSProperties {
  return { ["--role-c" as string]: ROLES[role].cssVar } as CSSProperties;
}

/** First paint in an element is a base; subsequent additions default to layer. */
function defaultRole(element: SchemeElement): SchemeRole {
  return element.paints.some((p) => roleOf(p).solid) ? "layer" : "base";
}

type HoverHandlers = {
  /** Bar segment: show the tooltip and highlight the matching row. */
  enter: (paint: SchemePaint, e: ReactPointerEvent) => void;
  move: (e: ReactPointerEvent) => void;
  leave: () => void;
  /** Editor row: highlight the matching bar band (no tooltip). */
  mark: (pid: string) => void;
  unmark: () => void;
};

export function SchemeVisualiser() {
  const [scheme, setScheme] = useState<Scheme>(() => emptyScheme());
  const [blend, setBlend] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tipPaint, setTipPaint] = useState<SchemePaint | null>(null);

  // Paint database, fetched from the same static asset the browse page uses.
  const [dbPaints, setDbPaints] = useState<BrowsePaint[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(BROWSE_INDEX_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<BrowsePaint[]>;
      })
      .then((data) => {
        if (!cancelled) setDbPaints(data);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
          setDbPaints([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // After mount, restore any saved scheme (localStorage is client-only, so this
  // can't run during SSR without a hydration mismatch — hence the mount gate).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setMounted(true);
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const parsed = JSON.parse(raw) as { scheme?: Scheme; blend?: boolean };
        if (parsed?.scheme) {
          // Route restored data through the same sanitiser the file-import path
          // uses, so a corrupted shape can't reach `.map(...)` during render and
          // white-screen the page — it throws here and we fall back to the seed.
          const restored = importSchemeObject(parsed.scheme, uid);
          if (typeof parsed.scheme.title === "string") restored.title = parsed.scheme.title;
          setScheme(restored);
        }
        if (typeof parsed?.blend === "boolean") setBlend(parsed.blend);
      }
    } catch {
      /* ignore corrupt storage */
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Autosave to localStorage. This is always on — it's the anonymous fallback
  // and the source for first-login migration, so it stays even when signed in.
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(STORE, JSON.stringify({ scheme, blend }));
    } catch {
      /* quota / private mode — non-fatal */
    }
  }, [scheme, blend, mounted]);

  /* ---- account sync (only active when signed in) ---- */
  const { user, configured, googleEnabled } = useAuth();
  const [savedSchemes, setSavedSchemes] = useState<SchemeRow[]>([]);
  const [activeSchemeId, setActiveSchemeId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<
    "idle" | "saving" | "saved" | "error" | "limit"
  >("idle");
  // Live handle on the current scheme, so the login effect can migrate it
  // without depending on `scheme` (which would re-run it on every edit).
  const schemeRef = useRef(scheme);
  useEffect(() => {
    schemeRef.current = scheme;
  }, [scheme]);
  // Set true just before we load a scheme into state programmatically, so the
  // debounced autosave doesn't immediately re-write what we just fetched.
  const skipSaveRef = useRef(false);

  // On sign-in: load the user's schemes (migrating the local one the first
  // time). On sign-out: drop server state; the localStorage path takes over
  // again, exactly as before accounts existed.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!mounted) return;
    if (!user) {
      setSavedSchemes([]);
      setActiveSchemeId(null);
      setSyncState("idle");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await listSchemes();
        if (cancelled) return;
        const local = schemeRef.current;
        // Decide what to do with the scheme currently in the editor. Crucially,
        // if the user built something while signed out that isn't already
        // saved, we adopt it as a NEW scheme rather than overwriting it with a
        // saved one — otherwise that work would be silently lost on sign-in.
        if (planSignInScheme(rows.map((r) => r.data), local) === "adopt-local") {
          const row = await createScheme(
            user.id,
            toExportShape(local),
            local.title || "Untitled scheme",
          );
          if (cancelled) return;
          // The editor already shows `local`, so don't touch `scheme`; just
          // make the new row the active, top-of-list saved scheme.
          skipSaveRef.current = true;
          setSavedSchemes([row, ...rows]);
          setActiveSchemeId(row.id);
        } else {
          setSavedSchemes(rows);
          const first = rows[0];
          const restored = importSchemeObject(first.data, uid);
          restored.title = first.title;
          skipSaveRef.current = true;
          setScheme(restored);
          setActiveSchemeId(first.id);
        }
        setSyncState("idle");
      } catch {
        if (!cancelled) setSyncState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, mounted]);

  // Debounced autosave to the account for the active scheme. Blend is a view
  // preference and isn't part of the stored scheme, so it's excluded here.
  useEffect(() => {
    if (!mounted || !user || !activeSchemeId) return;
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    setSyncState("saving");
    const title = scheme.title || "Untitled scheme";
    const timer = setTimeout(async () => {
      try {
        await updateScheme(activeSchemeId, toExportShape(scheme), title);
        setSyncState("saved");
        // Reflect the new title and bump updated_at so the picker keeps the
        // same most-recently-updated-first order a reload would show.
        setSavedSchemes((rows) => {
          const now = new Date().toISOString();
          return rows
            .map((r) => (r.id === activeSchemeId ? { ...r, title, updated_at: now } : r))
            .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
        });
      } catch {
        setSyncState("error");
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [scheme, user, activeSchemeId, mounted]);

  /* ---- saved-scheme picker handlers ---- */
  const loadSchemeRow = (row: SchemeRow) => {
    try {
      const restored = importSchemeObject(row.data, uid);
      restored.title = row.title;
      skipSaveRef.current = true;
      setScheme(restored);
      setActiveSchemeId(row.id);
      setSyncState("idle");
    } catch {
      setSyncState("error");
    }
  };

  const selectScheme = (id: string) => {
    if (id === activeSchemeId) return;
    const row = savedSchemes.find((r) => r.id === id);
    if (row) loadSchemeRow(row);
  };

  const newScheme = async () => {
    if (!user) return;
    try {
      const fresh = emptyScheme();
      const row = await createScheme(user.id, toExportShape(fresh), "Untitled scheme");
      skipSaveRef.current = true;
      setSavedSchemes((rows) => [row, ...rows]);
      setActiveSchemeId(row.id);
      setScheme(fresh);
      setSyncState("idle");
    } catch (e) {
      setSyncState(isSchemeLimitError(e) ? "limit" : "error");
    }
  };

  const deleteActiveScheme = async () => {
    if (!user || !activeSchemeId) return;
    const id = activeSchemeId;
    try {
      await deleteScheme(id);
      const remaining = savedSchemes.filter((r) => r.id !== id);
      setSavedSchemes(remaining);
      if (remaining.length > 0) {
        loadSchemeRow(remaining[0]);
      } else {
        // No active scheme left, so the autosave effect early-returns and won't
        // consume a skip flag — clear it so it can't leak into a later save.
        skipSaveRef.current = false;
        setScheme(emptyScheme());
        setActiveSchemeId(null);
        setSyncState("idle");
      }
    } catch {
      setSyncState("error");
    }
  };

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

  const reset = () => {
    // Guard against wiping real work: only confirm when there's something to lose.
    const hasContent = scheme.title.trim() !== "" || scheme.elements.length > 0;
    if (hasContent && !window.confirm("Clear this scheme and start fresh? This can't be undone.")) {
      return;
    }
    setScheme(emptyScheme());
    setBlend(true);
  };

  /* ---- export / import (no accounts — a JSON file is the save format) ---- */
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

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
        setScheme(importScheme(String(reader.result), uid));
        setImportError(null);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : "Couldn't import that file.");
      }
    };
    reader.onerror = () => setImportError("Couldn't read that file.");
    reader.readAsText(file);
  };

  /* ---- tooltip (imperative, so mousemove doesn't re-render the tree) ---- */
  const tipRef = useRef<HTMLDivElement>(null);
  const hover: HoverHandlers = useMemo(
    () => ({
      enter(paint, e) {
        // Content comes from React (see the tooltip JSX); only position and
        // visibility are set imperatively so mousemove doesn't re-render.
        setHovered(paint.id);
        setTipPaint(paint);
        const tip = tipRef.current;
        if (!tip) return;
        tip.style.left = `${e.clientX}px`;
        tip.style.top = `${e.clientY - 14}px`;
        tip.style.opacity = "1";
      },
      move(e) {
        const tip = tipRef.current;
        if (!tip) return;
        tip.style.left = `${e.clientX}px`;
        tip.style.top = `${e.clientY - 14}px`;
      },
      leave() {
        setHovered(null);
        setTipPaint(null);
        if (tipRef.current) tipRef.current.style.opacity = "0";
      },
      mark(pid) {
        setHovered(pid);
      },
      unmark() {
        setHovered(null);
      },
    }),
    [],
  );

  const paintCount = useMemo(
    () => scheme.elements.reduce((n, e) => n + e.paints.length, 0),
    [scheme],
  );

  return (
    <div className="mx-auto max-w-[1420px] px-4 pb-16">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)]">
        {/* LEFT — editor */}
        <section aria-label="Paint entry">
          <div className="mb-5 max-w-[62ch] space-y-2 text-sm text-muted-foreground">
            <p>Group your paints by element, in the order you apply them.</p>
            <p>
              Give each a <b className="font-semibold text-foreground">role</b>: base, layer
              and highlight build the tonal ramp; wash, glaze and weathering sit over it. The{" "}
              <b className="font-semibold text-foreground">weight</b> slider sets how much of
              the bar a layer takes.
            </p>
            <p>
              Order elements by how much of the model they cover —{" "}
              <b className="font-semibold text-foreground">largest first</b> (armour), smallest
              last (lenses). Bar widths follow the order; use the ↑↓ buttons to rearrange.
            </p>
          </div>

          {user && (
            <div className="mb-3.5 flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
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
              <button
                type="button"
                onClick={() => void deleteActiveScheme()}
                disabled={!activeSchemeId}
                className="rounded-md border border-border px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete
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
          )}

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
                onRename={(name) => renameElement(element.id, name)}
                onMove={(dir) => moveElement(element.id, dir)}
                onRemove={() => removeElement(element.id)}
                onAddPaint={(p) => addPaint(element.id, p)}
                onMovePaint={(pid, dir) => movePaint(element.id, pid, dir)}
                onRemovePaint={(pid) => removePaint(element.id, pid)}
                onSetRole={(pid, role) => setRole(element.id, pid, role)}
                onSetWeight={(pid, w) => setWeight(element.id, pid, w)}
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
        <section
          aria-label="Colour visualisation"
          className="order-first lg:order-none lg:sticky lg:top-[4.75rem]"
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
                  base · layer · highlight
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

      {/* Tooltip: content from React (no innerHTML); position/opacity set
          imperatively in hover.* so mousemove never re-renders. No inline
          left/top here, or a re-render would clobber the imperative position. */}
      <div
        ref={tipRef}
        className="pointer-events-none fixed left-0 top-0 z-50 -translate-x-1/2 -translate-y-2 whitespace-nowrap rounded-md bg-foreground px-2 py-1.5 text-xs text-background opacity-0 shadow-xl transition-opacity"
      >
        {tipPaint && (
          <>
            <span
              className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-baseline ring-1 ring-white/30"
              style={{ background: tipPaint.hex }}
            />
            <span
              className="mr-1.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ color: roleOf(tipPaint).cssVar }}
            >
              {roleOf(tipPaint).label}
            </span>
            {tipPaint.name}
            <span className="ml-1.5 font-mono opacity-70">{tipPaint.hex.toUpperCase()}</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Element */

function ElementCard({
  element,
  index,
  count,
  dbPaints,
  loadError,
  hovered,
  hover,
  onRename,
  onMove,
  onRemove,
  onAddPaint,
  onMovePaint,
  onRemovePaint,
  onSetRole,
  onSetWeight,
}: {
  element: SchemeElement;
  index: number;
  count: number;
  dbPaints: BrowsePaint[] | null;
  loadError: boolean;
  hovered: string | null;
  hover: HoverHandlers;
  onRename: (name: string) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onAddPaint: (p: Omit<SchemePaint, "id">) => void;
  onMovePaint: (pid: string, dir: -1 | 1) => void;
  onRemovePaint: (pid: string) => void;
  onSetRole: (pid: string, role: SchemeRole) => void;
  onSetWeight: (pid: string, weight: number) => void;
}) {
  const swatches = element.paints.length ? element.paints.map((p) => p.hex) : ["var(--muted)"];
  return (
    <div className="relative rounded-xl border border-border bg-card shadow-sm focus-within:z-10">
      <div className="flex items-center gap-2.5 rounded-t-xl border-b border-border bg-muted px-3 py-3">
        <span className="flex h-[22px] w-10 flex-none overflow-hidden rounded-md ring-1 ring-inset ring-black/10">
          {swatches.map((hex, i) => (
            <i key={i} className="flex-1" style={{ background: hex }} />
          ))}
        </span>
        <input
          value={element.name}
          onChange={(e) => onRename(e.target.value)}
          aria-label="Element name"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1 text-[15px] font-semibold tracking-tight outline-none hover:bg-card focus:bg-card focus:ring-1 focus:ring-inset focus:ring-input"
        />
        <span
          className="flex-none text-xs tabular-nums text-muted-foreground"
          title={`${element.paints.length} ${element.paints.length === 1 ? "paint" : "paints"}`}
        >
          {element.paints.length}
        </span>
        <div className="flex flex-none items-center gap-0.5">
          <IconBtn
            label="Move element earlier (larger area)"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            ↑
          </IconBtn>
          <IconBtn
            label="Move element later (smaller area)"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            ↓
          </IconBtn>
          <IconBtn label="Remove element" danger onClick={onRemove}>
            ✕
          </IconBtn>
        </div>
      </div>

      {element.paints.length > 0 && (
        <div className="flex justify-between px-3 pt-1 text-[10.5px] tracking-wide text-muted-foreground">
          <span>▲ base</span>
          <span>highlight ▼</span>
        </div>
      )}

      <ul className="flex flex-col gap-0.5 p-2">
        {element.paints.map((paint, i) => (
          <LayerRow
            key={paint.id}
            paint={paint}
            index={i}
            count={element.paints.length}
            hot={hovered === paint.id}
            hover={hover}
            onMove={(dir) => onMovePaint(paint.id, dir)}
            onRemove={() => onRemovePaint(paint.id)}
            onSetRole={(role) => onSetRole(paint.id, role)}
            onSetWeight={(w) => onSetWeight(paint.id, w)}
          />
        ))}
      </ul>

      <AddPaint
        dbPaints={dbPaints}
        loadError={loadError}
        defaultRole={defaultRole(element)}
        onAdd={onAddPaint}
      />
    </div>
  );
}

/* -------------------------------------------------------------------- Row */

function LayerRow({
  paint,
  index,
  count,
  hot,
  hover,
  onMove,
  onRemove,
  onSetRole,
  onSetWeight,
}: {
  paint: SchemePaint;
  index: number;
  count: number;
  hot: boolean;
  hover: HoverHandlers;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onSetRole: (role: SchemeRole) => void;
  onSetWeight: (weight: number) => void;
}) {
  const role = roleOf(paint);
  const meta =
    paint.custom && (!paint.brand || paint.brand === "custom")
      ? "Custom colour"
      : paint.brand + (paint.range && paint.range !== "custom" ? ` · ${paint.range}` : "");
  const showCustom = paint.custom && paint.brand && paint.brand !== "custom";

  return (
    <li
      className={`group grid grid-cols-[auto_1fr_auto] items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${hot ? "bg-muted" : "hover:bg-muted"}`}
      onPointerEnter={() => hover.mark(paint.id)}
      onPointerLeave={hover.unmark}
    >
      <span
        className="mt-0.5 h-[26px] w-[26px] flex-none rounded-md ring-1 ring-inset ring-black/15"
        style={{ background: paint.hex }}
      />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-medium">
          <span className="min-w-0 truncate">{paint.name}</span>
          <span
            className="sv-role-tag inline-flex flex-none items-center rounded-full px-1.5 text-[9.5px] font-bold uppercase leading-normal tracking-wide"
            style={roleVarStyle(paint.role)}
          >
            {role.label}
          </span>
        </div>
        <div className="truncate text-[11.5px] text-muted-foreground">
          {meta}{" "}
          <span className="font-mono tabular-nums text-muted-foreground/80">
            {paint.hex.toUpperCase()}
          </span>
          {showCustom && <span className="text-muted-foreground/70"> · custom</span>}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <select
            value={paint.role}
            onChange={(e) => onSetRole(e.target.value as SchemeRole)}
            aria-label="Layer role"
            className="rounded-md border border-input bg-muted px-1 py-0.5 text-[11px] text-muted-foreground"
          >
            {ROLE_KEYS.map((k) => (
              <option key={k} value={k}>
                {ROLES[k].label}
              </option>
            ))}
          </select>
          <div className="flex min-w-0 max-w-[150px] flex-1 items-center gap-1.5">
            <span className="whitespace-nowrap text-[10px] tracking-wide text-muted-foreground">
              {role.solid ? "weight" : "amount"}
            </span>
            <input
              type="range"
              min={0.3}
              max={2.5}
              step={0.05}
              value={weightOf(paint)}
              onChange={(e) => onSetWeight(parseFloat(e.target.value))}
              aria-label="Layer weight"
              className="sv-weight w-full"
            />
          </div>
        </div>
      </div>
      <div className="flex flex-none gap-0.5 opacity-40 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <IconBtn label="Move up (towards base)" disabled={index === 0} onClick={() => onMove(-1)}>
          ↑
        </IconBtn>
        <IconBtn
          label="Move down (towards highlight)"
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        >
          ↓
        </IconBtn>
        <IconBtn label="Remove paint" danger onClick={onRemove}>
          ✕
        </IconBtn>
      </div>
    </li>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[13px] text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:opacity-25 disabled:hover:bg-transparent ${danger ? "hover:!text-red-600 dark:hover:!text-red-400" : ""}`}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------- Add paint */

function AddPaint({
  dbPaints,
  loadError,
  defaultRole: role,
  onAdd,
}: {
  dbPaints: BrowsePaint[] | null;
  loadError: boolean;
  defaultRole: SchemeRole;
  onAdd: (p: Omit<SchemePaint, "id">) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customHex, setCustomHex] = useState("#6d4aa8");

  const loading = dbPaints === null;
  const results = useMemo(() => {
    const q = query.trim();
    if (q.length < 2 || !dbPaints) return [];
    return filterPaints(dbPaints, { search: q }).slice(0, 60);
  }, [query, dbPaints]);

  const pick = (p: BrowsePaint) => {
    onAdd({ name: p.name, brand: p.brand, range: p.range, hex: p.hex, role });
    setQuery("");
    setOpen(false);
    setActive(-1);
  };

  const addCustom = () => {
    onAdd({
      name: customName.trim() || "Custom colour",
      brand: "custom",
      range: "custom",
      hex: customHex.toUpperCase(),
      role,
      custom: true,
    });
    setCustomName("");
    setShowCustom(false);
  };

  return (
    <div className="relative px-2.5 pb-3 pt-1.5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (!results.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              pick(results[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={
            loading
              ? "Loading paint database…"
              : "Add a paint — search across 11 brands…"
          }
          aria-label="Search paints to add"
          className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus:border-primary focus:ring-2 focus:ring-accent sm:text-[13px]"
        />
        <button
          onClick={() => setShowCustom((v) => !v)}
          title="Add a colour that isn't in the database"
          className="flex-none whitespace-nowrap px-0.5 py-1 text-[12.5px] font-semibold text-accent-foreground hover:underline"
        >
          + Custom
        </button>
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute inset-x-2.5 top-[calc(100%-6px)] z-20 max-h-72 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-xl">
          {results.length === 0 ? (
            <div className="p-3 text-center text-[12.5px] text-muted-foreground">
              {loadError
                ? "Paint database unavailable. Use + Custom to add it by hand."
                : "No match. Use + Custom to add it by hand."}
            </div>
          ) : (
            results.map((p, i) => (
              <button
                key={p.id}
                // onMouseDown (not onClick) so it fires before the input's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left ${i === active ? "bg-accent" : "hover:bg-accent"}`}
              >
                <span
                  className="h-[22px] w-[22px] flex-none rounded-md ring-1 ring-inset ring-black/15"
                  style={{ background: p.hex }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{p.name}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {p.brand} · {p.range}
                  </span>
                </span>
                <span className="ml-auto flex-none font-mono text-[11px] text-muted-foreground">
                  {p.hex}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {showCustom && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-input bg-muted p-2.5">
          <input
            type="color"
            value={customHex}
            onChange={(e) => setCustomHex(e.target.value)}
            aria-label="Pick custom colour"
            className="sv-swatch-input h-[34px] w-[34px] flex-none rounded-lg border border-input bg-card"
          />
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustom()}
            placeholder="Colour name (e.g. AK Black Purple)"
            className="min-w-0 flex-1 rounded-md border border-input bg-card px-2.5 py-1.5 text-[13px] outline-none focus:border-primary"
          />
          <button
            onClick={addCustom}
            className="flex-none rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:opacity-90"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- Bar */

function Bar({
  element,
  index,
  blend,
  hovered,
  hover,
}: {
  element: SchemeElement;
  index: number;
  blend: boolean;
  hovered: string | null;
  hover: HoverHandlers;
}) {
  const { segs, overlays } = useMemo(() => barModel(element.paints), [element.paints]);
  const empty = element.paints.length === 0;

  // Bars share the row's fixed width in proportion to their position — earlier
  // (larger-area) elements read wider, later ones narrower — so the ordering
  // does the sizing. A min-width keeps the thinnest bars usable.
  return (
    <div
      className="flex min-w-[46px] flex-col items-center gap-2.5"
      style={{ flexGrow: elementSize(index), flexBasis: 0 }}
    >
      <div
        className="relative flex h-[340px] w-full flex-col-reverse overflow-hidden rounded-[9px] shadow-sm ring-1 ring-inset ring-black/10 [isolation:isolate]"
        style={empty ? EMPTY_BAR_STYLE : { background: rampGradient(segs, blend) }}
      >
        {segs.map((s) => (
          <div
            key={s.paint.id}
            role="img"
            aria-label={paintLabel(s.paint)}
            className="relative min-h-0"
            style={{
              flexGrow: s.frac,
              flexBasis: 0,
              boxShadow: hovered === s.paint.id ? "inset 0 0 0 2px rgba(255,255,255,.7)" : undefined,
            }}
            onPointerEnter={(e) => hover.enter(s.paint, e)}
            onPointerMove={hover.move}
            onPointerLeave={hover.leave}
          />
        ))}
        {overlays.map((ov) => {
          const center = overlayCenter(ov, segs);
          // Blended → a soft, feathered translucent band. Banded → the overlay
          // collapses to a thin crisp line at its boundary, matching the ramp's
          // hard steps when blending is off.
          let placement: CSSProperties;
          if (blend) {
            const thick = clamp(weightOf(ov.paint) * 0.15, 0.08, 0.4);
            const bottom = clamp(center - thick / 2, 0, 1 - thick);
            placement = {
              bottom: `${(bottom * 100).toFixed(2)}%`,
              height: `${(thick * 100).toFixed(2)}%`,
              background: `linear-gradient(to top, transparent, ${ov.paint.hex} 50%, transparent)`,
            };
          } else {
            placement = {
              bottom: `calc(${(center * 100).toFixed(2)}% - 4px)`,
              height: "8px",
              background: ov.paint.hex,
            };
          }
          return (
            <div
              key={ov.paint.id}
              role="img"
              aria-label={paintLabel(ov.paint)}
              className="absolute inset-x-0 mix-blend-multiply"
              style={{
                ...placement,
                opacity: roleOf(ov.paint).opacity,
                boxShadow: hovered === ov.paint.id ? "inset 0 0 0 2px rgba(255,255,255,.7)" : undefined,
              }}
              onPointerEnter={(e) => hover.enter(ov.paint, e)}
              onPointerMove={hover.move}
              onPointerLeave={hover.leave}
            />
          );
        })}
      </div>
      <div className="w-full break-words text-center text-xs font-medium leading-tight [text-wrap:balance]">
        {element.name}
        <span className="mt-0.5 block text-[10.5px] font-normal text-muted-foreground">
          {element.paints.length} {element.paints.length === 1 ? "paint" : "paints"}
        </span>
      </div>
    </div>
  );
}

const EMPTY_BAR_STYLE: CSSProperties = {
  background:
    "repeating-linear-gradient(-45deg, var(--muted), var(--muted) 7px, var(--border) 7px, var(--border) 14px)",
};

/* ------------------------------------------------------------------ utils */

/** Accessible label for a bar band, e.g. "Base: Deck Tan (#ABA390)". */
function paintLabel(p: SchemePaint): string {
  return `${roleOf(p).label}: ${p.name} (${p.hex.toUpperCase()})`;
}
