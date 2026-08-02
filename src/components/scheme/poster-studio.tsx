"use client";

/**
 * The share-image studio: a modal over the visualiser that turns the current
 * scheme plus one photo of the model into a 4:5 PNG for social media.
 *
 * Everything happens in the browser — the photo is never uploaded. State lives
 * in `usePoster`; the pixels come from `drawPoster`, shared with `PosterCanvas`
 * so the preview and the export cannot diverge.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { PosterCanvas } from "./poster-canvas";
import { usePoster } from "@/hooks/use-poster";
import { useModalDialog } from "@/hooks/use-modal-dialog";
import {
  layoutPoster,
  POSTER_SIZE,
  type PhotoFraming,
  type PosterOmission,
  type PosterSide,
} from "@/lib/scheme/poster";
import { drawPoster, resolveFontFamily, type PosterPhoto } from "@/lib/scheme/poster-draw";
import { schemeSlug } from "@/lib/scheme/io";
import type { Scheme } from "@/lib/scheme/types";

/** Logical → exported pixels. 2 gives 2160×2700, comfortably above Instagram's 1080. */
const EXPORT_SCALE = 2;

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

const OMISSION_TEXT: Record<PosterOmission["reason"], string> = {
  unplaced: "not placed yet",
  "no-paints": "has no paints",
  "off-frame": "outside the current framing",
  "no-space": "no room left on the poster",
};

export function PosterStudio({
  scheme,
  scope,
  onClose,
}: {
  scheme: Scheme;
  /** Which scheme's poster state to load — see `usePoster`. */
  scope?: string;
  onClose: () => void;
}) {
  const {
    photo,
    framing,
    setFraming,
    anchors,
    setAnchor,
    clearAnchor,
    clearAllAnchors,
    options,
    setOptions,
    loadPhoto,
    clearPhoto,
    error,
  } = usePoster(scheme.elements, scope);

  const [armed, setArmed] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Modal behaviour — scroll lock, focus trap, Escape, focus restore — lives in
  // `useModalDialog`, shared with the browse page's filter drawer.
  const dialogRef = useModalDialog({
    onClose,
    initialFocus: closeRef,
    // Escape backs out of placement first, so it can't be a one-way trip that
    // closes the whole studio mid-task.
    onEscape: () => {
      if (armed === null) return false;
      setArmed(null);
      return true;
    },
  });

  // Memoised, not just derived: a fresh object each render would defeat the
  // `layout` memo below, and the canvas redraws whenever `layout` changes — so
  // every keystroke in the handle field would re-render the whole poster.
  const photoFraming: PhotoFraming | null = useMemo(
    () =>
      photo
        ? { naturalWidth: photo.naturalWidth, naturalHeight: photo.naturalHeight, ...framing }
        : null,
    [photo, framing],
  );

  const posterPhoto: PosterPhoto | null = useMemo(
    () => (photo && photoFraming ? { image: photo.image, ...photoFraming } : null),
    [photo, photoFraming],
  );

  const layout = useMemo(
    () =>
      layoutPoster({
        elements: scheme.elements,
        // Anchors are meaningless without a photo to hang them on.
        anchors: photoFraming ? anchors : {},
        photo: photoFraming,
        // Showing manufacturers makes every paint row taller, so the packer
        // needs the options too — it derives the row pitch the renderer reads
        // back off `layout.rowHeight`.
        options,
      }),
    [scheme.elements, anchors, photoFraming, options],
  );

  const placedCount = layout.callouts.length;

  const setSide = (index: number, side: PosterSide | undefined) => {
    const a = anchors[index];
    if (a) setAnchor(index, { ...a, side });
  };

  const download = useCallback(async () => {
    setBusy(true);
    setDownloadError(null);
    try {
      // Geist is loaded through next/font; drawing before it resolves silently
      // exports in the platform sans instead.
      await document.fonts.ready;
      const canvas = document.createElement("canvas");
      canvas.width = POSTER_SIZE.width * EXPORT_SCALE;
      canvas.height = POSTER_SIZE.height * EXPORT_SCALE;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setDownloadError("Couldn't render the image in this browser.");
        return;
      }

      drawPoster(ctx, {
        layout,
        options,
        photo: posterPhoto,
        fontFamily: resolveFontFamily(),
        scale: EXPORT_SCALE,
      });

      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (!blob) {
        setDownloadError("Couldn't render the image — it may be too large for this browser.");
        return;
      }
      // Same download idiom as the scheme's JSON export in `scheme-visualiser`.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${schemeSlug(scheme.title)}.paintdex.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Deferred: revoking synchronously after `click()` has historically
      // aborted the download in Firefox and Safari, which read the blob
      // asynchronously.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      // There was `try/finally` but no `catch`, and the call site is
      // `void download()` — so a rejection from `document.fonts.ready` or a
      // throw inside `drawPoster` flipped the button back from "Rendering…"
      // with no PNG and no message, which reads as the button not working.
      setDownloadError("Couldn't render the image. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [layout, options, posterPhoto, scheme.title]);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Share image"
      className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm"
    >
      <header className="flex flex-none items-center gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Share image</h2>
        <span className="text-xs text-muted-foreground">
          {placedCount} of {scheme.elements.length} elements labelled
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="ml-auto rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:bg-muted"
        >
          Close
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Preview */}
        <div className="mx-auto w-full max-w-[520px]">
          {photo ? (
            <PosterCanvas
              canvasRef={canvasRef}
              layout={layout}
              options={options}
              photo={posterPhoto}
              framing={photoFraming}
              anchors={anchors}
              armed={armed}
              highlight={highlight}
              onPlace={setAnchor}
              onPlaced={() => setArmed(null)}
              onPan={(dx, dy) =>
                setFraming((f) => ({ ...f, offsetX: f.offsetX + dx, offsetY: f.offsetY + dy }))
              }
              onHighlight={setHighlight}
            />
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-[1.5px] border-dashed border-input px-6 text-center transition-colors hover:border-primary hover:bg-accent"
              style={{ aspectRatio: `${POSTER_SIZE.width} / ${POSTER_SIZE.height}` }}
            >
              <span className="text-sm font-medium">Upload a photo of your model</span>
              <span className="max-w-[34ch] text-xs text-muted-foreground">
                A plain, evenly lit background works best. The photo stays on your device — it
                is never uploaded.
              </span>
            </button>
          )}
          {photo && (
            <p className="mt-2 text-xs text-muted-foreground">
              {armed !== null
                ? `Click the model to label ${scheme.elements[armed]?.name || "this element"}.`
                : placedCount === 0
                  ? "Press Place next to an element on the right, then click that part of the model."
                  : "Drag a marker to move it, or drag the background to reposition the photo."}
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="space-y-5 text-sm">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void loadPhoto(file);
              e.target.value = "";
            }}
          />

          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:bg-muted"
              >
                {photo ? "Replace photo" : "Choose photo"}
              </button>
              {photo && (
                <button
                  type="button"
                  onClick={clearPhoto}
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Remove
                </button>
              )}
            </div>
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            )}
            {photo && (
              <div className="flex items-center gap-2">
                <label htmlFor="poster-zoom" className="text-xs text-muted-foreground">
                  Zoom
                </label>
                <input
                  id="poster-zoom"
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={framing.zoom}
                  onChange={(e) => setFraming((f) => ({ ...f, zoom: Number(e.target.value) }))}
                  className="sv-weight min-w-0 flex-1"
                />
                <button
                  type="button"
                  onClick={() => setFraming({ zoom: 1, offsetX: 0, offsetY: 0 })}
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Recentre
                </button>
              </div>
            )}
          </section>

          <section className="space-y-2 border-t border-border pt-4">
            <label htmlFor="poster-handle" className="block text-xs font-medium">
              Your handle <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <input
              id="poster-handle"
              value={options.handle}
              onChange={(e) => setOptions((o) => ({ ...o, handle: e.target.value }))}
              placeholder="tom_paints_"
              spellCheck={false}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs">
              <input
                type="checkbox"
                checked={options.showBrands}
                onChange={(e) => setOptions((o) => ({ ...o, showBrands: e.target.checked }))}
              />
              Show paint manufacturer
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={options.showRoles}
                onChange={(e) => setOptions((o) => ({ ...o, showRoles: e.target.checked }))}
              />
              Show roles (base, wash…) after each paint
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={options.theme === "light"}
                onChange={(e) =>
                  setOptions((o) => ({ ...o, theme: e.target.checked ? "light" : "dark" }))
                }
              />
              Light theme (suits photos on pale backgrounds)
            </label>
          </section>

          <section className="space-y-1.5 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold">Labels</h3>
              <button
                type="button"
                onClick={clearAllAnchors}
                className="ml-auto rounded-md px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Clear all
              </button>
            </div>

            {scheme.elements.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Add some elements to your scheme first.
              </p>
            )}

            <ul className="space-y-1">
              {scheme.elements.map((element, i) => {
                const placed = Boolean(anchors[i]);
                const omission = layout.omitted.find((o) => o.elementIndex === i);
                return (
                  <li
                    key={element.id}
                    onPointerEnter={() => setHighlight(i)}
                    onPointerLeave={() => setHighlight(null)}
                    // Keyboard equivalent of the hover highlight: tabbing onto
                    // any control in this row lights up the matching callout,
                    // and selects it for the canvas's arrow-key nudges.
                    onFocus={() => setHighlight(i)}
                    onBlur={() => setHighlight(null)}
                    className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {element.name}
                      {omission && (
                        <span className="ml-1 text-muted-foreground">
                          — {OMISSION_TEXT[omission.reason]}
                        </span>
                      )}
                    </span>

                    {placed && (
                      <div className="flex flex-none overflow-hidden rounded border border-border">
                        {(["left", "right"] as const).map((side) => (
                          <button
                            key={side}
                            type="button"
                            title={`Put this callout on the ${side}`}
                            // The visible text is a single letter, so the name
                            // has to come from here — and it has to say which
                            // element, since the row's name isn't announced
                            // with it.
                            aria-label={`Put the ${element.name} callout on the ${side}`}
                            aria-pressed={anchors[i]?.side === side}
                            onClick={() => setSide(i, anchors[i]?.side === side ? undefined : side)}
                            className={`px-1.5 py-0.5 text-[10px] uppercase transition-colors ${
                              anchors[i]?.side === side
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {side[0]}
                          </button>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={!photo || element.paints.length === 0}
                      onClick={() => {
                        const next = armed === i ? null : i;
                        setArmed(next);
                        // Move focus to the surface the next step happens on,
                        // so "Place" → Enter → arrows works without hunting for
                        // it. Pointer users are unaffected.
                        if (next !== null) canvasRef.current?.focus();
                      }}
                      className={`flex-none rounded border px-1.5 py-0.5 text-[10px] transition-colors disabled:opacity-40 ${
                        armed === i
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {armed === i ? "Pick a spot" : placed ? "Move" : "Place"}
                    </button>

                    {placed && (
                      <button
                        type="button"
                        onClick={() => clearAnchor(i)}
                        title="Remove this label"
                        aria-label={`Remove the ${element.name} label`}
                        className="flex-none rounded px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        ✕
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="border-t border-border pt-4">
            <button
              type="button"
              onClick={() => void download()}
              disabled={busy || !photo || placedCount === 0}
              className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Rendering…" : "Download PNG"}
            </button>
            {downloadError ? (
              <p className="mt-1.5 text-center text-[11px] text-red-600 dark:text-red-400" role="alert">
                {downloadError}
              </p>
            ) : (
              <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
                {POSTER_SIZE.width * EXPORT_SCALE} × {POSTER_SIZE.height * EXPORT_SCALE} · 4:5
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
