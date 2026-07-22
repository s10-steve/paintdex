/**
 * Public shared-scheme page — the ONE intentionally server-rendered route (see
 * CLAUDE.md). Rendering on the server lets us emit per-scheme OpenGraph title,
 * description and a generated colour-bar image (see `opengraph-image.tsx`), so
 * links pasted on Reddit/Instagram get a rich preview. The scheme itself is
 * read anonymously via RLS (`is_public = true`), so no login is needed to view.
 *
 * Every other page in the app stays static/client-rendered; this is the
 * deliberate exception, and it's free within Vercel's Hobby allowance.
 */
import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getPublicSchemeBySlug } from "@/lib/supabase/server";
import { importSchemeObject } from "@/lib/scheme/io";
import type { Scheme } from "@/lib/scheme/types";
import { SchemeView } from "@/components/scheme-view";

// Re-render at most once a minute per slug: cheap caching of previews without
// pinning stale data for long after an owner edits or unpublishes.
export const revalidate = 60;

/** Deduped fetch shared by generateMetadata and the page within one render. */
const loadScheme = cache(getPublicSchemeBySlug);

/** Parse a stored scheme into the runtime shape, assigning throwaway ids. */
function parse(data: unknown): Scheme {
  let n = 0;
  return importSchemeObject(data, () => `s${n++}`);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const row = await loadScheme(slug);
  if (!row) {
    return {
      title: "Scheme not found",
      robots: { index: false, follow: false },
    };
  }
  const title = row.title || "Untitled scheme";
  const description = `A miniature paint scheme shared from Paintdex${
    title ? `: ${title}` : ""
  }. See the colours and the full paint recipe.`;
  return {
    title,
    description,
    // Shared, user-to-user links aren't public search resources — keep them out
    // of search indexes. Social crawlers read OG tags regardless of this.
    robots: { index: false, follow: false },
    alternates: { canonical: `/scheme/${slug}` },
    openGraph: {
      type: "article",
      title,
      description,
      url: `/scheme/${slug}`,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedSchemePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const row = await loadScheme(slug);

  if (!row) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Scheme not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This share link is invalid, or the scheme is no longer shared publicly.
        </p>
        <div className="mt-6 flex justify-center gap-3 text-sm">
          <Link
            href="/visualiser"
            className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground hover:opacity-90"
          >
            Build your own scheme
          </Link>
          <Link
            href="/paints"
            className="rounded-md border border-border px-3 py-2 font-medium text-foreground hover:bg-muted"
          >
            Browse paints
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="pt-6">
      <SchemeView scheme={parse(row.data)} />
    </main>
  );
}
