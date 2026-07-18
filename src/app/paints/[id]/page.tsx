import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllPaints, getPaintById, getSimilarColours } from "@/lib/paints/load";
import { contrastText } from "@/lib/color";
import type { Paint, PaintWithLab } from "@/lib/paints/types";
import { CopyHex } from "@/components/copy-hex";
import { SimilarColours, type SimilarItem } from "@/components/similar-colours";

export function generateStaticParams() {
  return getAllPaints().map((p) => ({ id: p.id }));
}

// Every paint id is enumerated above and prerendered at build time, when the
// precomputed `.cache/similar-index.json` (read by getSimilarColours) exists.
// Disallow on-demand rendering so an unknown id 404s statically instead of
// trying to read that cache file at request time, where it wouldn't be present.
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const paint = getPaintById(id);
  if (!paint) return { title: "Paint not found" };
  return {
    title: `${paint.name} — ${paint.brand}`,
    description: `${paint.name} by ${paint.brand} (${paint.range}) — hex ${paint.hex}. See visually similar miniature paints across brands.`,
  };
}

/** Strip the enriched record down to the serializable Paint shape for props. */
function toPaint(p: PaintWithLab): Paint {
  const { lab: _lab, family: _family, ...paint } = p;
  void _lab;
  void _family;
  return paint;
}

function toItems(
  list: { paint: PaintWithLab; distance: number }[],
): SimilarItem[] {
  return list.map(({ paint, distance }) => ({ paint: toPaint(paint), distance }));
}

export default async function PaintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const paint = getPaintById(id);
  if (!paint) notFound();

  const { all, cross } = getSimilarColours(paint.id);
  const similarAll = toItems(all);
  const similarCross = toItems(cross);

  const fg = contrastText(paint.hex);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <Link
        href="/paints"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to all paints
      </Link>

      <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div
          className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-border p-6"
          style={{ backgroundColor: paint.hex, color: fg }}
        >
          <span className="text-xl font-semibold">{paint.name}</span>
          <span className="mt-1 font-mono text-sm opacity-80">{paint.hex}</span>
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">{paint.name}</h1>
          <p className="mt-1 text-muted-foreground">{paint.brand}</p>

          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Range</dt>
            <dd>{paint.ranges ? paint.ranges.join(", ") : paint.range}</dd>
            <dt className="text-muted-foreground">Type</dt>
            <dd className="capitalize">{paint.type}</dd>
            <dt className="text-muted-foreground">Colour family</dt>
            <dd className="capitalize">{paint.family}</dd>
            {paint.code ? (
              <>
                <dt className="text-muted-foreground">Code</dt>
                <dd className="font-mono">{paint.code}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Hex</dt>
            <dd>
              <CopyHex hex={paint.hex} />
            </dd>
          </dl>

          {paint.discontinued ? (
            <p className="mt-4 inline-block rounded-md bg-muted px-2.5 py-1 text-sm text-muted-foreground">
              This paint is discontinued.
            </p>
          ) : null}
        </div>
      </div>

      <hr className="my-8 border-border" />

      <SimilarColours all={similarAll} crossBrand={similarCross} />
    </main>
  );
}
