/**
 * The visualiser's `localStorage` document — one owner for the key, the shape,
 * and every read/write of it.
 *
 * The stored payload is `{ scheme, blend, binding }`. The **binding** is what
 * makes multi-device editing safe: it records which saved row the document came
 * from, so the app never has to *guess* that from the content.
 *
 * Guessing is what the three My-schemes bugs were. `planSignInScheme` matches by
 * canonical content, and `title` is part of that content, so a scheme renamed on
 * another device (or deleted on another device) stopped matching anything saved
 * and was re-inserted as a brand-new row. With a binding, "which row is this?"
 * is a fact, not an inference — see `planReload` in `./sync.ts`.
 *
 * `syncedCanon` is the canonical form of what we last *successfully* wrote to
 * that row. It answers the other half of the question: if it still matches the
 * document, we have nothing unflushed and the server's copy can safely win; if
 * it doesn't, the editor holds edits that never reached Supabase (the autosave
 * debounce is 1s and there's no `pagehide` flush) and they must not be thrown
 * away. Comparing timestamps instead would be unsound — `updated_at` comes from
 * the server's `now()`, and the client's clock is its own.
 *
 * Everything here is lazy and defensive: no module-level `localStorage` access
 * (the pages are statically prerendered), and a corrupt or half-written payload
 * degrades to "no document" / "no binding" rather than throwing into a render.
 */
import { emptyScheme, type Scheme } from "./types";

/** localStorage key holding the visualiser's working scheme. */
export const SCHEME_STORE_KEY = "paintdex-scheme-v1";

/**
 * The saved row a local document belongs to. `userId` is stored so a second
 * account signing in on a shared browser falls back to the content path instead
 * of being told someone else's scheme was deleted.
 */
export type SchemeBinding = {
  id: string;
  userId: string;
  /** `canonicalScheme()` of the last thing we successfully saved to that row. */
  syncedCanon: string;
};

export type LocalDoc = {
  /** Absent when nothing has been stored yet, or the payload was unreadable. */
  scheme?: Scheme;
  blend?: boolean;
  binding: SchemeBinding | null;
};

const isBinding = (v: unknown): v is SchemeBinding => {
  if (!v || typeof v !== "object") return false;
  const b = v as Record<string, unknown>;
  return (
    typeof b.id === "string" &&
    typeof b.userId === "string" &&
    typeof b.syncedCanon === "string"
  );
};

/**
 * Read the stored document. Returns `{ binding: null }` for a missing, corrupt
 * or legacy (`{ scheme, blend }`, pre-binding) payload — the legacy case is
 * deliberately indistinguishable from "unbound", which is exactly the
 * content-matching path it used to take.
 */
export function readLocalDoc(): LocalDoc {
  if (typeof window === "undefined") return { binding: null };
  try {
    const raw = localStorage.getItem(SCHEME_STORE_KEY);
    if (!raw) return { binding: null };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      scheme: (parsed?.scheme as Scheme | undefined) ?? undefined,
      blend: typeof parsed?.blend === "boolean" ? parsed.blend : undefined,
      binding: isBinding(parsed?.binding) ? parsed.binding : null,
    };
  } catch {
    return { binding: null };
  }
}

/** Overwrite the stored document. Quota / private-mode failures are non-fatal. */
export function writeLocalDoc(doc: LocalDoc): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      SCHEME_STORE_KEY,
      JSON.stringify({ scheme: doc.scheme, blend: doc.blend, binding: doc.binding }),
    );
  } catch {
    /* quota / private mode — non-fatal */
  }
}

/**
 * Merge fields into the stored document.
 *
 * Two hooks write this key: `useLocalScheme` owns `scheme`/`blend`, and
 * `useSchemeSync` owns `binding`. Read-merge-write keeps them from clobbering
 * each other's field without either having to own the other's state.
 */
export function patchLocalDoc(patch: Partial<LocalDoc>): void {
  writeLocalDoc({ ...readLocalDoc(), ...patch });
}

/**
 * Forget a row that no longer exists — clearing the binding **and blanking the
 * document**, but only if the stored binding is for that row.
 *
 * Both halves matter. Clearing the binding alone would leave the deleted
 * scheme's content in storage, and the next load would take the unbound
 * content-matching path, match nothing, and re-insert it: the resurrection bug
 * again, one step further along.
 */
export function clearBoundScheme(id: string): void {
  const doc = readLocalDoc();
  if (doc.binding?.id !== id) return;
  writeLocalDoc({ scheme: emptyScheme(), blend: doc.blend, binding: null });
}

/**
 * Blank an unreadable document: drop the scheme **and** the binding, keeping
 * only the view preference.
 *
 * The unconditional sibling of `clearBoundScheme`, for the case where the stored
 * scheme won't parse so there is no way to know which row it claimed to be. The
 * binding has to go with it for the same reason it does there — the restore
 * falls back to a blank seed, and a surviving binding would let the autosave
 * present that blank as row X's latest content and flush it over the real one.
 */
export function clearStoredScheme(): void {
  writeLocalDoc({ scheme: emptyScheme(), blend: readLocalDoc().blend, binding: null });
}

/** Drop the binding but keep the document — what signing out does. */
export function clearBinding(): void {
  const doc = readLocalDoc();
  if (!doc.binding) return;
  writeLocalDoc({ ...doc, binding: null });
}
