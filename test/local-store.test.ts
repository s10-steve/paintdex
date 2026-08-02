/**
 * @vitest-environment jsdom
 *
 * The visualiser's localStorage document. Two things are pinned here:
 *
 * - a **legacy** `{scheme, blend}` payload (everything written before schemes
 *   knew which row they came from) reads back as `binding: null`, which is the
 *   unbound content-matching path it used to take — upgrading a browser must not
 *   change what happens to the scheme already in it;
 * - `clearBoundScheme` blanks the *document*, not just the binding. Clearing the
 *   binding alone leaves the deleted scheme's content behind for the unbound path
 *   to adopt as a new row, which is the resurrection bug one step further along.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  clearBinding,
  clearBoundScheme,
  clearStoredScheme,
  patchLocalDoc,
  readLocalDoc,
  writeLocalDoc,
  SCHEME_STORE_KEY,
  type SchemeBinding,
} from "@/lib/scheme/local-store";
import type { Scheme } from "@/lib/scheme/types";

const scheme = (title: string): Scheme => ({
  title,
  elements: [
    {
      id: "e1",
      name: "Armour",
      paints: [
        { id: "p1", name: "Leadbelcher", brand: "Citadel", range: "Base", hex: "#6B6F72", role: "base" },
      ],
    },
  ],
});

const binding = (id: string): SchemeBinding => ({
  id,
  userId: "u1",
  syncedCanon: "canon",
});

beforeEach(() => localStorage.clear());

describe("readLocalDoc", () => {
  it("returns an unbound doc when nothing is stored", () => {
    expect(readLocalDoc()).toEqual({ binding: null });
  });

  it("reads a legacy {scheme, blend} payload as unbound", () => {
    localStorage.setItem(SCHEME_STORE_KEY, JSON.stringify({ scheme: scheme("Old"), blend: true }));
    const doc = readLocalDoc();
    expect(doc.scheme?.title).toBe("Old");
    expect(doc.blend).toBe(true);
    expect(doc.binding).toBeNull();
  });

  it("falls back to unbound for corrupt JSON", () => {
    localStorage.setItem(SCHEME_STORE_KEY, "{not json");
    expect(readLocalDoc()).toEqual({ binding: null });
  });

  it("drops a malformed binding rather than trusting it", () => {
    localStorage.setItem(
      SCHEME_STORE_KEY,
      JSON.stringify({ scheme: scheme("X"), binding: { id: "row-1" } }),
    );
    expect(readLocalDoc().binding).toBeNull();
  });

  it("round-trips a written document", () => {
    writeLocalDoc({ scheme: scheme("Mine"), blend: false, binding: binding("row-1") });
    const doc = readLocalDoc();
    expect(doc.scheme?.title).toBe("Mine");
    expect(doc.binding).toEqual(binding("row-1"));
  });
});

describe("patchLocalDoc", () => {
  it("merges one field without disturbing the others", () => {
    writeLocalDoc({ scheme: scheme("Mine"), blend: true, binding: null });
    patchLocalDoc({ binding: binding("row-1") });
    expect(readLocalDoc().scheme?.title).toBe("Mine");
    expect(readLocalDoc().blend).toBe(true);
    expect(readLocalDoc().binding?.id).toBe("row-1");

    // …and the other direction: the scheme writer must not drop the binding.
    patchLocalDoc({ scheme: scheme("Edited") });
    expect(readLocalDoc().binding?.id).toBe("row-1");
    expect(readLocalDoc().scheme?.title).toBe("Edited");
  });
});

describe("clearBoundScheme", () => {
  it("blanks the document as well as the binding", () => {
    writeLocalDoc({ scheme: scheme("Deleted elsewhere"), blend: true, binding: binding("row-1") });
    clearBoundScheme("row-1");
    const doc = readLocalDoc();
    expect(doc.binding).toBeNull();
    // The content must go too, or the unbound path adopts it as a new row.
    expect(doc.scheme).toEqual({ title: "", elements: [] });
    // `blend` is a view preference, not scheme content — it survives.
    expect(doc.blend).toBe(true);
  });

  it("leaves a document bound to a different row alone", () => {
    writeLocalDoc({ scheme: scheme("Mine"), blend: false, binding: binding("row-1") });
    clearBoundScheme("row-2");
    expect(readLocalDoc().scheme?.title).toBe("Mine");
    expect(readLocalDoc().binding?.id).toBe("row-1");
  });

  it("is a no-op for an unbound document", () => {
    writeLocalDoc({ scheme: scheme("Signed out work"), blend: false, binding: null });
    clearBoundScheme("row-1");
    expect(readLocalDoc().scheme?.title).toBe("Signed out work");
  });
});

describe("clearStoredScheme", () => {
  it("drops the scheme and the binding, whatever row it named", () => {
    // The corrupt-restore case: the stored scheme won't parse, so there is no
    // way to know which row it claimed to be — unlike `clearBoundScheme`, this
    // can't and shouldn't check.
    writeLocalDoc({ scheme: scheme("Unreadable"), blend: true, binding: binding("row-1") });
    clearStoredScheme();

    const doc = readLocalDoc();
    expect(doc.binding).toBeNull();
    // Both halves matter: a surviving binding would let the autosave present
    // this blank as row-1's latest content and flush it over the real one.
    expect(doc.scheme).toEqual({ title: "", elements: [] });
    expect(doc.blend).toBe(true);
  });
});

describe("clearBinding", () => {
  it("drops the binding but keeps the document (what signing out does)", () => {
    writeLocalDoc({ scheme: scheme("Still mine"), blend: false, binding: binding("row-1") });
    clearBinding();
    expect(readLocalDoc().binding).toBeNull();
    expect(readLocalDoc().scheme?.title).toBe("Still mine");
  });
});
