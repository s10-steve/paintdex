"use client";

/**
 * Poster state for the share-image studio: the photo, how it is framed, where
 * each element's leader lands, and the presentation options.
 *
 * Kept out of the scheme document on purpose. A `Scheme` is portable — it round
 * trips through `toExportShape`, syncs to Supabase and is compared byte-for-byte
 * by `canonicalScheme` — and a megabyte of photo has no business in any of that.
 *
 * **Two homes for the photo, picked by whether the caller passes `remote`.**
 *
 * - No `remote` (signed out, or a document not yet bound to a saved row):
 *   `localStorage`, exactly as before, with the quota ladder that implies. It is
 *   the only storage those users have, so none of it goes away.
 * - With `remote` (signed in, on a saved scheme): the `scheme-photos` bucket, so
 *   the photo follows the user across devices and the published share page can
 *   show it. The ~5 MB quota, the fallback re-encode and the "too large to keep"
 *   warning all stop applying to the photo.
 *
 * The *settings* — framing, anchors, options — stay in `localStorage` under
 * either mode. They're a few hundred bytes that change on every pointermove, and
 * nothing about them needs to leave the device.
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
import {
  deleteSchemePhoto,
  downloadSchemePhoto,
  uploadSchemePhoto,
} from "@/lib/data/scheme-photos";
import type { SchemeElement } from "@/lib/scheme/types";

const POSTER_STORE_KEY = "paintdex-poster-v1";
/** The photo, stored separately — see `StoredPoster`. */
const POSTER_PHOTO_KEY = "paintdex-poster-photo-v1";

/**
 * Scope for a document with no saved row — the signed-out editor, or a
 * signed-in one before reconciliation binds it.
 */
export const LOCAL_POSTER_SCOPE = "local";

/**
 * Poster state is per scheme.
 *
 * It used to live under two fixed keys, so every scheme shared one photo and
 * one set of anchors. Opening the studio for scheme B showed A's photo, and
 * `reconcileAnchors` then name-matched A's anchors onto any B element that
 * happened to share a name — "Armour" and "Lenses" being exactly the names
 * people reuse — leaving a leader line pointing at wherever that part was on a
 * different model.
 */
const keysFor = (scope: string) => ({
  settings: `${POSTER_STORE_KEY}:${scope}`,
  photo: `${POSTER_PHOTO_KEY}:${scope}`,
});

/** Read a key, treating an inaccessible `localStorage` as empty. */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Safari with cookies blocked throws `SecurityError` on any access, not
    // just on write.
    return null;
  }
}

/** Remove a key, tolerating the same. */
function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* inaccessible storage — nothing to clean up */
  }
}

/**
 * Drop the pre-scoping photo, from both places it could be.
 *
 * Called only once the photo is safely somewhere else — the scoped key, or
 * nowhere because the user removed it. Leaving it behind did two things: a photo
 * the user *deleted* came back on the next visit, because the scoped key was
 * empty and the restore fell through to this one; and after a migration the same
 * multi-megabyte data URL sat in storage twice, against a ~5 MB quota, which on a
 * large photo is enough to make the second copy the one that won't fit.
 *
 * Deliberately not called when a write failed: at that point the legacy copy is
 * the only copy there is.
 */
function clearLegacyPhoto(): void {
  remove(POSTER_PHOTO_KEY);
  // The oldest layout kept the photo inside the settings blob. Strip that field
  // rather than dropping the whole entry, which still holds framing and anchors
  // for anyone who hasn't been migrated yet.
  const raw = read(POSTER_STORE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as StoredPoster;
    if (parsed.photo === undefined) return;
    delete parsed.photo;
    localStorage.setItem(POSTER_STORE_KEY, JSON.stringify(parsed));
  } catch {
    /* unreadable or unwritable — nothing safe to strip */
  }
}

/**
 * Whether a photo is already stored *locally* for this scope.
 *
 * For labelling a button, not for loading anything — the studio owns the real
 * read. Client-only (it touches `localStorage`), and it deliberately answers only
 * the local half: a signed-in scheme's photo lives in the bucket, and the caller
 * already knows about that from the row's `photo_path`.
 *
 * Mirrors the restore effect's key resolution, including the legacy unscoped key
 * for the unbound document, so a returning user isn't told they have no image
 * when the studio is about to show them one.
 */
export function hasLocalPosterPhoto(scope: string = LOCAL_POSTER_SCOPE): boolean {
  if (read(keysFor(scope).photo)) return true;
  return scope === LOCAL_POSTER_SCOPE && Boolean(read(POSTER_PHOTO_KEY));
}

/** Long edge the uploaded photo is downscaled to before anything else touches it. */
const WORKING_MAX = 2400;
/**
 * Smaller re-encode tried when the working image won't fit — the `localStorage`
 * quota locally, the bucket's `file_size_limit` remotely.
 */
const FALLBACK_MAX = 1400;

/**
 * Upload ceiling, matching the bucket's `file_size_limit` in
 * `supabase/schema.sql`. Checked here as well so an oversized photo is
 * re-encoded before the round trip, rather than after a rejected one.
 */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export interface LoadedPhoto {
  image: HTMLImageElement;
  naturalWidth: number;
  naturalHeight: number;
  /** JPEG data URL — what gets persisted, and what the image element holds. */
  dataUrl: string;
}

/**
 * Where the photo lives when the editor is signed in and bound to a saved row.
 *
 * `onPhotoPath` is how the row's `photo_path` gets written — the hook doesn't
 * call `setSchemePhotoPath` itself, because the caller also has to patch its
 * cached copy of the row, and that's the same split `useShareActions` already
 * uses for `is_public`/`share_slug`.
 */
export interface PosterRemote {
  schemeId: string;
  userId: string;
  /** The row's current `photo_path`, or null when it has no photo. */
  photoPath: string | null;
  onPhotoPath: (path: string | null) => void;
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

/**
 * A JPEG data URL as a `Blob`, for upload.
 *
 * Decoded by hand rather than with `fetch(dataUrl)`: the site's CSP restricts
 * `connect-src` to a named list, and a `data:` fetch is a request like any
 * other. This is also the only place that needs the bytes — everything else
 * works off the data URL the `<img>` already holds.
 */
function dataUrlToBlob(dataUrl: string): Blob | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0 || !dataUrl.startsWith("data:")) return null;
  const meta = dataUrl.slice(5, comma);
  if (!meta.endsWith(";base64")) return null;
  const type = meta.slice(0, -";base64".length) || "image/jpeg";
  try {
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type });
  } catch {
    return null;
  }
}

/** Read a `Blob` back as a data URL, so a downloaded photo looks like an uploaded one. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read that image."));
    reader.readAsDataURL(blob);
  });
}

export function usePoster(
  elements: SchemeElement[],
  scope: string = LOCAL_POSTER_SCOPE,
  remote: PosterRemote | null = null,
) {
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [framing, setFraming] = useState(defaultFraming);
  const [options, setOptions] = useState<PosterOptions>(defaultPosterOptions);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  /** True while the photo is being fetched from or pushed to Storage. */
  const [photoBusy, setPhotoBusy] = useState(false);

  // Stored exactly as persisted — by the index and element name in force when
  // each anchor was placed. Reconciled against the live elements on read.
  const [storedAnchors, setStoredAnchors] = useState<PosterAnchors>({});
  const [storedNames, setStoredNames] = useState<string[]>([]);
  // What is currently in the photo key, so the save effect can skip a rewrite
  // and the restore effect can seed it without triggering one.
  const savedPhotoRef = useRef<string | null>(null);

  // The remote equivalents, and deliberately NOT `savedPhotoRef`: that one means
  // "the localStorage key holds this", which the restore effect sets whenever it
  // reads a local photo. Sharing it made the migration a no-op — a photo read
  // out of `localStorage` looked already-saved, so it was never uploaded.
  //
  // `loadedPathRef` is the object path whose bytes are in state, set on download
  // *and* on upload, so the fetch effect doesn't re-download what was just sent.
  // `remoteUrlRef` is the data URL known to be in the bucket, which stops the
  // save effect echoing a freshly downloaded photo straight back up.
  const loadedPathRef = useRef<string | null>(null);
  const remoteUrlRef = useRef<string | null>(null);

  // `remote` is rebuilt on every render by the caller, so effects key off its
  // primitive fields and reach for the callback through a ref. Keying on the
  // object would re-run the fetch on every keystroke in the handle field.
  const remoteRef = useRef(remote);
  // Declared before the effects that read it, so within a commit it is refreshed
  // first. No dependency array on purpose — every render, including the ones
  // where only the callback's identity changed.
  useEffect(() => {
    remoteRef.current = remote;
  });
  const remoteUserId = remote?.userId ?? null;
  const remoteSchemeId = remote?.schemeId ?? null;
  const remotePath = remote?.photoPath ?? null;

  // Restore. localStorage is client-only, so this has to wait for mount.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setMounted(true);
    let cancelled = false;
    const keys = keysFor(scope);
    // Entries written before poster state was scoped per scheme. Only the
    // unbound document inherits them — attributing one browser's leftover photo
    // to a particular saved scheme would be a guess.
    const legacy = scope === LOCAL_POSTER_SCOPE;

    // Switching scope means a different scheme's poster; start from defaults so
    // nothing bleeds across if this ever runs more than once.
    setPhoto(null);
    setFraming(defaultFraming());
    setOptions(defaultPosterOptions());
    setStoredAnchors({});
    setStoredNames([]);
    savedPhotoRef.current = null;
    loadedPathRef.current = null;
    remoteUrlRef.current = null;

    let parsed: StoredPoster = {};
    const raw = read(keys.settings) ?? (legacy ? read(POSTER_STORE_KEY) : null);
    if (raw) {
      try {
        parsed = JSON.parse(raw) as StoredPoster;
      } catch {
        /* corrupt entry — start clean */
      }
    }
    if (parsed.framing) setFraming({ ...defaultFraming(), ...parsed.framing });
    if (parsed.options) setOptions({ ...defaultPosterOptions(), ...parsed.options });
    if (parsed.anchors) setStoredAnchors(parsed.anchors);
    if (Array.isArray(parsed.names)) setStoredNames(parsed.names);

    // The scoped key first; then, for the unbound document only, the two older
    // layouts — the unscoped photo key, and `parsed.photo` from before the photo
    // was split out of the settings at all.
    const current = read(keys.photo);
    const dataUrl = current ?? (legacy ? (read(POSTER_PHOTO_KEY) ?? parsed.photo) : undefined);
    if (dataUrl) {
      // Seeded ONLY when it came from the key we now write. Seeding it for a
      // legacy read told the save effect the photo was already stored, so it
      // was never copied to the new key — while the settings write dropped it
      // from the old one. The photo survived exactly one session.
      if (current) savedPhotoRef.current = current;
      void loadImage(dataUrl).then(
        (image) => {
          if (cancelled) return;
          setPhoto({
            image,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
            dataUrl,
          });
        },
        () => {
          // A truncated data URL is exactly what a partial quota write leaves
          // behind. Start with no photo rather than an unhandled rejection.
          // Leave storage alone: a photo this browser couldn't decode may still
          // be the only copy, and discarding it isn't ours to do.
          if (cancelled) return;
          savedPhotoRef.current = null;
        },
      );
    }
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [scope]);

  /**
   * Fetch the photo the saved row points at.
   *
   * Runs after the local restore above and overwrites whatever that found, which
   * is the right precedence: the row is the shared copy, and a stale local one is
   * this browser's leftover. It is skipped once `loadedPathRef` matches, so
   * uploading doesn't immediately re-download what was just sent.
   *
   * Keyed on the path, so a scheme that gains a photo on another device picks it
   * up on the next refetch rather than only on a full reload.
   */
  useEffect(() => {
    if (!remoteUserId || !remotePath) return;
    if (loadedPathRef.current === remotePath) return;

    let cancelled = false;
    setPhotoBusy(true);
    void (async () => {
      try {
        const blob = await downloadSchemePhoto(remotePath);
        // A row pointing at an object that isn't there is survivable — the
        // studio opens empty rather than broken — so it isn't an error the user
        // needs to see.
        if (!blob || cancelled) return;
        const dataUrl = await blobToDataUrl(blob);
        const image = await loadImage(dataUrl);
        if (cancelled) return;
        loadedPathRef.current = remotePath;
        // These bytes came *from* the bucket, so record that — otherwise the
        // save effect sees a photo it has never uploaded and sends it straight
        // back. Nothing is written locally: the bucket is the store now, and
        // seeding `savedPhotoRef` would claim a `localStorage` entry that
        // doesn't exist.
        remoteUrlRef.current = dataUrl;
        setPhoto({
          image,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          dataUrl,
        });
      } catch {
        if (!cancelled) setError("Couldn't load the photo saved with this scheme.");
      } finally {
        if (!cancelled) setPhotoBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [remoteUserId, remotePath]);

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

  /**
   * Remove the photo, everywhere it is.
   *
   * Deletion lives here rather than being inferred by the save effects from
   * `photo === null`, because that state means three different things: the user
   * removed it, the restore hasn't finished decoding it yet, and the scope just
   * changed to a different scheme. Only the first is a removal, and treating the
   * other two as one is how a stored photo got deleted a frame after mount —
   * normally rewritten when the decode landed, but gone for good if the studio
   * closed first or the decode failed.
   *
   * A user action is unambiguous, so it is the only thing that deletes.
   */
  const clearPhoto = useCallback(() => {
    setPhoto(null);
    setFraming(defaultFraming());
    savedPhotoRef.current = null;
    remoteUrlRef.current = null;

    remove(keysFor(scope).photo);
    // Otherwise the restore falls back to the pre-scoping key next time and
    // hands back the photo that was just removed.
    if (scope === LOCAL_POSTER_SCOPE) clearLegacyPhoto();

    const bound = remoteRef.current;
    const path = loadedPathRef.current ?? bound?.photoPath ?? null;
    loadedPathRef.current = null;
    if (!bound || !path) return;
    setPhotoBusy(true);
    void deleteSchemePhoto(path)
      .then(() => bound.onPhotoPath(null))
      .catch(() => setError("Couldn't remove that photo from your account."))
      .finally(() => setPhotoBusy(false));
  }, [scope]);

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
      localStorage.setItem(keysFor(scope).settings, JSON.stringify(settings));
    } catch {
      /* quota / private mode — non-fatal */
    }
  }, [framing, storedAnchors, storedNames, options, mounted, scope]);

  /**
   * Push the photo to Storage — upload on change, delete on clear.
   *
   * The local ladder below still runs for a signed-out or unbound document; this
   * effect owns the photo whenever there's a row to hang it on, and returns
   * before that ladder can also write a copy into `localStorage`.
   */
  useEffect(() => {
    if (!mounted || !remoteUserId || !remoteSchemeId) return;

    // Nothing to do until the fetch effect has told us what the row already
    // holds — uploading first would race it and could push the local leftover
    // over a photo added on another device.
    if (remotePath && loadedPathRef.current !== remotePath) return;

    // Removal is `clearPhoto`'s job, not this effect's — see there for why.
    if (!photo) return;
    if (remoteUrlRef.current === photo.dataUrl) return;

    let cancelled = false;
    // Claim it before the round trip: without this the effect re-runs on the
    // `photoBusy` render and starts a second upload of the same bytes.
    remoteUrlRef.current = photo.dataUrl;
    setPhotoBusy(true);

    void (async () => {
      try {
        // Same shape as the quota ladder below, against the bucket's size limit
        // rather than localStorage's: the working image, then a smaller
        // re-encode. Thunks so the fallback's canvas pass only happens if the
        // first one is actually too big.
        const candidates = [
          () => photo.dataUrl,
          () => downscale(photo.image, FALLBACK_MAX, 0.8),
        ];
        let blob: Blob | null = null;
        for (const candidate of candidates) {
          const value = candidate();
          const encoded = value ? dataUrlToBlob(value) : null;
          if (encoded && encoded.size <= MAX_UPLOAD_BYTES) {
            blob = encoded;
            break;
          }
        }
        if (!blob) {
          setError("This photo is too large to save to your account.");
          return;
        }
        const path = await uploadSchemePhoto(remoteUserId, remoteSchemeId, blob);
        if (cancelled) return;
        loadedPathRef.current = path;
        remoteRef.current?.onPhotoPath(path);
      } catch {
        if (cancelled) return;
        // Let the next change retry, and say so — the photo is still in memory,
        // so the studio keeps working, but it won't be there tomorrow.
        remoteUrlRef.current = null;
        setError("Couldn't save that photo to your account. It'll work until you reload.");
      } finally {
        if (!cancelled) setPhotoBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [photo, mounted, remoteUserId, remoteSchemeId, remotePath]);

  // The photo is the only part that can realistically blow the ~5 MB quota, so
  // it degrades on its own: the working image, then a smaller re-encode, then
  // nothing. Because it lives in its own key, a photo that won't fit can never
  // cost the user their anchors.
  //
  // Skipped entirely in remote mode — the effect above owns the photo there, and
  // keeping a second megabyte-sized copy in `localStorage` would spend the quota
  // on a cache nothing reads.
  //
  // It only ever *writes*. Removal is `clearPhoto`'s — see there.
  useEffect(() => {
    if (!mounted) return;
    const key = keysFor(scope).photo;
    const legacy = scope === LOCAL_POSTER_SCOPE;
    if (remoteUserId) {
      // Drop the pre-migration leftovers, but only once the row actually points
      // at an object — until the upload lands, those local copies are still the
      // only ones there are.
      if (remotePath) {
        remove(key);
        if (legacy) clearLegacyPhoto();
      }
      return;
    }
    if (!photo) return;
    if (savedPhotoRef.current === photo.dataUrl) return;

    // Thunks, not values: an array literal evaluates both entries up front, so
    // the fallback re-encode — a full canvas pass on the main thread — ran on
    // every photo save, including the ones where the first `setItem` succeeded.
    const candidates = [
      () => photo.dataUrl,
      () => downscale(photo.image, FALLBACK_MAX, 0.8),
    ];
    for (const candidate of candidates) {
      const value = candidate();
      if (!value) continue;
      try {
        localStorage.setItem(key, value);
        savedPhotoRef.current = photo.dataUrl;
        // Safely in the scoped key now, so the old copy is pure cost — and on a
        // big photo, enough of the quota to be why the next write fails.
        if (legacy) clearLegacyPhoto();
        return;
      } catch {
        /* quota — fall through to the smaller re-encode */
      }
    }
    // Too big even shrunk. Drop any stale photo rather than leaving a mismatched
    // one behind, and remember we tried so this doesn't re-run every render.
    remove(key);
    savedPhotoRef.current = photo.dataUrl;
    // The editor keeps working — the photo is in memory — but it won't be here
    // after a reload, and silently discovering that later is worse than being
    // told now. The lint rule is about effects that derive state; this reports
    // the outcome of the write the effect exists to perform, and the guard
    // above means it runs once per photo, not per render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError("This photo is too large to keep for next time. It'll work until you reload.");
  }, [photo, mounted, scope, remoteUserId, remotePath]);

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
    photoBusy,
    /** Whether the photo is being kept in the user's account rather than the browser. */
    photoRemote: Boolean(remoteUserId),
  };
}
