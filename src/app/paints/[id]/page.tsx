import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllPaints,
  getBrands,
  getPaintById,
  getSimilarColours,
} from "@/lib/paints/load";
import { contrastText } from "@/lib/color";
import { PAINT_TYPES, type Paint, type PaintWithLab } from "@/lib/paints/types";
import { CopyHex } from "@/components/copy-hex";
import { SimilarColours, type SimilarItem } from "@/components/similar-colours";
import { JsonLd } from "@/components/json-ld";

// Keep in sync with `metadataBase` in src/app/layout.tsx.
const BASE_URL = "https://paintdex.app";

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
  const title = `${paint.name} — ${paint.brand}`;
  const description = `${paint.name} by ${paint.brand} (${paint.range}) — hex ${paint.hex}. See visually similar miniature paints across brands.`;
  return {
    title,
    description,
    alternates: { canonical: `/paints/${id}` },
    // Per-paint title/description for shared links; the shared og-image.png
    // (from the root layout) is reused as the preview image.
    openGraph: { title, description, url: `/paints/${id}` },
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

  const { all } = getSimilarColours(paint.id);
  const similarAll = toItems(all);

  const brands = getBrands();
  const catalogue = getAllPaints();
  // Types present in the catalogue, in the canonical PAINT_TYPES order.
  const presentTypes = new Set(catalogue.map((p) => p.type));
  const types = PAINT_TYPES.filter((t) => presentTypes.has(t));
  const ranges = [...new Set(catalogue.map((p) => p.range))].sort((a, b) =>
    a.localeCompare(b),
  );

  const fg = contrastText(paint.hex);

  // Product describes the paint itself (a catalogue entry — no price/offer, so it
  // won't earn rich-result stars, but the markup is semantically correct and
  // non-blocking). BreadcrumbList reflects the Home → Browse → paint path.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        "@id": `${BASE_URL}/paints/${paint.id}#product`,
        name: paint.name,
        brand: { "@type": "Brand", name: paint.brand },
        category: paint.type,
        color: paint.hex,
        ...(paint.code ? { sku: paint.code } : {}),
        description: `${paint.name} by ${paint.brand} (${
          paint.ranges ? paint.ranges.join(", ") : paint.range
        }) — a ${paint.family} ${paint.type} miniature paint, hex ${paint.hex}.`,
        url: `${BASE_URL}/paints/${paint.id}`,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${BASE_URL}/` },
          {
            "@type": "ListItem",
            position: 2,
            name: "Browse paints",
            item: `${BASE_URL}/paints`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: paint.name,
            item: `${BASE_URL}/paints/${paint.id}`,
          },
        ],
      },
    ],
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <JsonLd data={jsonLd} />
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
            <dd className="capitalize">
              {paint.type}
              {paint.metallic ? (
                <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-xs">
                  Metallic
                </span>
              ) : null}
            </dd>
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

      <SimilarColours
        target={toPaint(paint)}
        all={similarAll}
        brands={brands}
        types={types}
        ranges={ranges}
      />
    </main>
  );
}
