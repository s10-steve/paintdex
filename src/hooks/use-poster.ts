"use client";

/**
 * Poster state for the share-image studio: the photo, how it is framed, where
 * each element's leader lands, and the presentation options.
 *
 * Kept out of the scheme document on purpose. A `Scheme` is portable — it round
 * trips through `toExportShape`, syncs to Supabase and is compared byte-for-byte
 * by `canonicalScheme` — and a megabyte of photo has no business in any of that.
 * Poster state lives in its own `localStorage` key instead, and will move to
 * Supabase Storage when the backend phase lands.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  defaultPosterOptions,
  reconcileAnchors,
  type PhotoFraming,
  type PosterAnchor,
  type PosterAnchors,
  type PosterOptions,
} from "@/lib/scheme/poster";
import type { SchemeElement } from "@/lib/scheme/types";

export const POSTER_STORE_KEY = "paintdex-poster-v1";
/** The photo, stored separately — see `StoredPoster`. */
export const POSTER_PHOTO_KEY = "paintdex-poster-photo-v1";

/** Long edge the uploaded photo is downscaled to before anything else touches it. */
const WORKING_MAX = 2400;
/** Smaller re-encode tried when the working image won't fit in localStorage. */
const FALLBACK_MAX = 1400;

export interface LoadedPhoto {
  image: HTMLImageElement;
  naturalWidth: number;
  naturalHeight: number;
  /** JPEG data URL — what gets persisted, and what the image element holds. */
  dataUrl: string;
}

export const defaultFraming = (): Omit<PhotoFraming, "naturalWidth" | "naturalHeight"> => ({
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
});

/**
 * The small, frequently-changing half of the state. Kept in its own key so that
 * panning the photo — which fires `setFraming` on every `pointermove` —
 * re-serialises a few hundred bytes rather than the megabyte-plus data URL.
 */
interface StoredPoster {
  framing?: ReturnType<typeof defaultFraming>;
  anchors?: PosterAnchors;
  /** Element names the anchors were placed against — see `reconcileAnchors`. */
  names?: string[];
  options?: PosterOptions;
  /** Only present in entries written before the photo moved to its own key. */
  photo?: string;
}

/** Decode a data URL into an `<img>` that is ready to draw. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image."));
    img.src = src;
  });
}

/**
 * Re-encode `img` as a JPEG whose long edge is at most `max` px, or null if the
 * canvas is unavailable. Deliberately not falling back to `img.src`: for a fresh
 * upload that is a `blob:` URL, which would be persisted and then fail to load
 * on the next visit.
 */
function downscale(img: HTMLImageElement, max: number, quality: number): string | null {
  const long = Math.max(img.naturalWidth, img.naturalHeight);
  const s = long > max ? max / long : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * s);
  canvas.height = Math.round(img.naturalHeight * s);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export function usePoster(elements: SchemeElement[]) {
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [framing, setFraming] = useState(defaultFraming);
  const [options, setOptions] = useState<PosterOptions>(defaultPosterOptions);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Stored exactly as persisted — by the index and element name in force when
  // each anchor was placed. Reconciled against the live elements on read.
  const [storedAnchors, setStoredAnchors] = useState<PosterAnchors>({});
  const [storedNames, setStoredNames] = useState<string[]>([]);
  // What is currently in the photo key, so the save effect can skip a rewrite
  // and the restore effect can seed it without triggering one.
  const savedPhotoRef = useRef<string | null>(null);

  // Restore. localStorage is client-only, so this has to wait for mount.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setMounted(true);
    let cancelled = false;
    try {
      const raw = localStorage.getItem(POSTER_STORE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredPoster;
      if (parsed.framing) setFraming({ ...defaultFraming(), ...parsed.framing });
      if (parsed.options) setOptions({ ...defaultPosterOptions(), ...parsed.options });
      if (parsed.anchors) setStoredAnchors(parsed.anchors);
      if (Array.isArray(parsed.names)) setStoredNames(parsed.names);

      // `parsed.photo` is the pre-split layout; read it so an entry written by
      // an earlier build still restores its photo instead of silently losing it.
      const dataUrl = localStorage.getItem(POSTER_PHOTO_KEY) ?? parsed.photo;
      if (dataUrl) {
        savedPhotoRef.current = dataUrl;
        void loadImage(dataUrl).then((image) => {
          if (cancelled) return;
          setPhoto({
            image,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
            dataUrl,
          });
        });
      }
    } catch {
      /* corrupt storage — start clean */
    }
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  /**
   * The anchors to actually draw, keyed by *current* element index. Derived
   * rather than stored so reordering elements in the editor takes effect
   * immediately, without a reconciliation pass having to fire first.
   */
  const anchors = useMemo(
    () => reconcileAnchors(storedAnchors, storedNames, elements),
    [storedAnchors, storedNames, elements],
  );

  // Write anchors back in terms of the live elements, so the next save records
  // the names they are attached to now.
  const commit = useCallback(
    (next: PosterAnchors) => {
      setStoredAnchors(next);
      setStoredNames(elements.map((e) => e.name));
    },
    [elements],
  );

  // Note for anyone adding a bulk caller: this closes over the current `anchors`,
  // so calling it in a loop commits only the last one. Build the whole map and
  // pass it to `commit` in one go instead.
  const setAnchor = useCallback(
    (index: number, anchor: PosterAnchor) => commit({ ...anchors, [index]: anchor }),
    [anchors, commit],
  );

  const clearAnchor = useCallback(
    (index: number) => {
      const next = { ...anchors };
      delete next[index];
      commit(next);
    },
    [anchors, commit],
  );

  const clearAllAnchors = useCallback(() => commit({}), [commit]);

  const loadPhoto = useCallback(async (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("That doesn't look like an image.");
      return;
    }
    // An object URL rather than FileReader: a 12 MP phone photo becomes a ~15 MB
    // base64 string the other way, for an image we are about to shrink anyway.
    const url = URL.createObjectURL(file);
    try {
      const raw = await loadImage(url);
      const dataUrl = downscale(raw, WORKING_MAX, 0.9);
      if (!dataUrl) {
        setError("Couldn't process that image in this browser.");
        return;
      }
      const image = await loadImage(dataUrl);
      setPhoto({
        image,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        dataUrl,
      });
      setFraming(defaultFraming());
    } catch {
      setError("Couldn't read that image.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }, []);

  const clearPhoto = useCallback(() => {
    setPhoto(null);
    setFraming(defaultFraming());
  }, []);

  // Autosave, in two halves keyed separately.
  //
  // The settings are tiny and change constantly — dragging the photo fires
  // `setFraming` on every pointermove — so they are written eagerly. The photo
  // is a megabyte-plus data URL and changes only on upload, so it gets its own
  // effect keyed on the image alone; writing both together meant every frame of
  // a pan re-serialised the whole photo on the main thread, next to the canvas
  // redraw.
  useEffect(() => {
    if (!mounted) return;
    try {
      const settings: StoredPoster = {
        framing,
        anchors: storedAnchors,
        names: storedNames,
        options,
      };
      localStorage.setItem(POSTER_STORE_KEY, JSON.stringify(settings));
    } catch {
      /* quota / private mode — non-fatal */
    }
  }, [framing, storedAnchors, storedNames, options, mounted]);

  // The photo is the only part that can realistically blow the ~5 MB quota, so
  // it degrades on its own: the working image, then a smaller re-encode, then
  // nothing. Because it lives in its own key, a photo that won't fit can never
  // cost the user their anchors.
  useEffect(() => {
    if (!mounted) return;
    if (!photo) {
      localStorage.removeItem(POSTER_PHOTO_KEY);
      savedPhotoRef.current = null;
      return;
    }
    if (savedPhotoRef.current === photo.dataUrl) return;

    for (const candidate of [photo.dataUrl, downscale(photo.image, FALLBACK_MAX, 0.8)]) {
      if (!candidate) continue;
      try {
        localStorage.setItem(POSTER_PHOTO_KEY, candidate);
        savedPhotoRef.current = photo.dataUrl;
        return;
      } catch {
        /* quota — fall through to the smaller re-encode */
      }
    }
    // Too big even shrunk. Drop any stale photo rather than leaving a mismatched
    // one behind, and remember we tried so this doesn't re-run every render.
    localStorage.removeItem(POSTER_PHOTO_KEY);
    savedPhotoRef.current = photo.dataUrl;
  }, [photo, mounted]);

  return {
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
    mounted,
  };
}
