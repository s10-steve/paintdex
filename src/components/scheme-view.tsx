"use client";

/**
 * Read-only view of a shared scheme — the public share page (`/scheme/[slug]`)
 * renders this with a scheme parsed server-side. Shows the same colour-bar
 * visualisation as the editor (via the shared `SchemeBars`) plus a full
 * per-element recipe so a viewer can reproduce it, and a "Save a copy" action
 * for signed-in users.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SchemeBars } from "./scheme-bars";
import { RoleTag } from "./scheme/role-tag";
import { useAuth } from "./auth/auth-provider";
import { components, displayHex, mixName, ratioLabel } from "@/lib/scheme/mix";
import { paintMeta, roleOf, type Scheme } from "@/lib/scheme/types";
import { toExportShape } from "@/lib/scheme/io";
import { duplicateScheme } from "@/lib/data/schemes";

export function SchemeView({
  scheme,
  photoUrl,
}: {
  scheme: Scheme;
  /**
   * A signed URL for the owner's photo of the model, when they added one in the
   * share-image studio and this scheme is published. Signed rather than public
   * because the bucket is private — see `@/lib/data/scheme-photos`.
   */
  photoUrl?: string | null;
}) {
  const paintCount = scheme.elements.reduce((n, e) => n + e.paints.length, 0);

  return (
    <div className="mx-auto max-w-[1420px] px-4 pb-16">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-bold tracking-tight sm:text-4xl">
            {scheme.title || "Untitled scheme"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {scheme.elements.length} elements · {paintCount} paints · shared from Paintdex
          </p>
        </div>
        <SaveCopyButton scheme={scheme} />
      </div>

      {/* Photo and bars side by side once there's room, stacked below that.
          `items-start` so the shorter of the two doesn't stretch to match the
          taller — the bars size themselves from their content, and a photo is
          whatever aspect the owner shot it at. The photo column is capped rather
          than an even split: past about a third of a wide screen it starts
          crowding out the thing people came for. */}
      <div
        className={
          photoUrl
            ? "grid gap-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,6fr)] lg:items-start"
            : undefined
        }
      >
        {photoUrl && (
          <div className="overflow-hidden rounded-xl border border-border bg-muted shadow-sm">
            {/* A plain <img>, like everything else outside the homepage: the URL
                is signed and short-lived, so it has no stable key for
                `next/image` to optimise against, and no `remotePatterns` entry
                to permit it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt={`The painted model for ${scheme.title || "this scheme"}`}
              // Capped shorter on desktop than stacked: side by side it only has
              // to hold its own against the bars, not fill the fold on its own.
              className="mx-auto max-h-[60vh] w-auto max-w-full object-contain lg:max-h-[52vh]"
            />
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {scheme.elements.length > 0 ? (
            <SchemeBars elements={scheme.elements} blend={false} />
          ) : (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              This scheme has no elements yet.
            </p>
          )}
        </div>
      </div>

      {/* Full recipe — the point of a shareable link. */}
      {scheme.elements.length > 0 && (
        <section className="mt-8" aria-label="Recipe">
          <h2 className="mb-3 text-[15px] font-semibold tracking-tight">Recipe</h2>
          <div className="grid gap-3.5 sm:grid-cols-2">
            {scheme.elements.map((element) => (
              <div
                key={element.id}
                className="rounded-xl border border-border bg-card p-3 shadow-sm"
              >
                <div className="mb-2 flex items-center gap-2.5 border-b border-border pb-2">
                  <span className="flex h-[22px] w-10 flex-none overflow-hidden rounded-md ring-1 ring-inset ring-black/10">
                    {(element.paints.length ? element.paints.map(displayHex) : ["var(--muted)"]).map(
                      (hex, i) => (
                        <i key={i} className="flex-1" style={{ background: hex }} />
                      ),
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight">
                    {element.name}
                  </span>
                  <span className="flex-none text-xs tabular-nums text-muted-foreground">
                    {element.paints.length}
                  </span>
                </div>
                {element.paints.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-muted-foreground">No paints.</p>
                ) : (
                  <ol className="flex flex-col gap-1.5">
                    {element.paints.map((paint) => {
                      const role = roleOf(paint);
                      const meta = paintMeta(paint);
                      const ratio = ratioLabel(paint);
                      const hex = displayHex(paint);
                      return (
                        <li key={paint.id} className="flex items-start gap-2.5 px-1">
                          <span
                            className="mt-0.5 h-[26px] w-[26px] flex-none rounded-md ring-1 ring-inset ring-black/15"
                            style={{ background: hex }}
                          />
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[13.5px] font-medium">
                              <span className="min-w-0">{mixName(paint)}</span>
                              {ratio && (
                                <span className="flex-none rounded bg-muted-foreground/15 px-1 font-mono text-[10px] tabular-nums text-muted-foreground">
                                  {ratio}
                                </span>
                              )}
                              <RoleTag role={role} />
                            </div>
                            <div className="text-[11.5px] text-muted-foreground">
                              {meta}{" "}
                              <span className="font-mono tabular-nums text-muted-foreground/80">
                                {hex.toUpperCase()}
                              </span>
                            </div>
                            {paint.mix?.length ? (
                              <ul className="mt-1 space-y-0.5 border-l border-border pl-2">
                                {components(paint).map((c, i) => (
                                  <li
                                    key={i}
                                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                                  >
                                    <span
                                      className={`h-2.5 w-2.5 flex-none rounded-sm ring-1 ring-inset ring-black/15 ${c.medium ? "opacity-40" : ""}`}
                                      style={{ background: c.hex }}
                                    />
                                    <span className="min-w-0 truncate">{c.name}</span>
                                    <span className="flex-none font-mono tabular-nums opacity-70">
                                      ×{c.parts}
                                    </span>
                                    {c.medium && <span className="flex-none opacity-70">thins</span>}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {paint.note && (
                              <p className="mt-1 text-[11.5px] italic text-muted-foreground">
                                {paint.note}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Copy a shared scheme into the viewer's own account, then open it in the
 * visualiser. Signed-out users see a hint to sign in first (accounts are
 * browser-only, so there's nothing to copy into without one).
 */
function SaveCopyButton({ scheme }: { scheme: Scheme }) {
  const { configured, user } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  if (!configured) return null;

  if (!user) {
    return (
      <span className="text-xs text-muted-foreground">
        Sign in (top right) to save a copy to your account.
      </span>
    );
  }

  const save = async () => {
    if (state === "saving") return;
    setState("saving");
    try {
      const row = await duplicateScheme(
        user.id,
        toExportShape(scheme),
        `${scheme.title || "Untitled scheme"} (copy)`,
      );
      router.push(`/visualiser?scheme=${row.id}`);
    } catch {
      setState("error");
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void save()}
        disabled={state === "saving"}
        className="flex-none rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {state === "saving" ? "Saving…" : "Save a copy"}
      </button>
      {state === "error" && (
        <span className="text-xs text-red-600 dark:text-red-400">
          Couldn&apos;t save. Please try again.
        </span>
      )}
    </div>
  );
}
