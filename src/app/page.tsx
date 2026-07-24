import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { getAllPaints, getBrands } from "@/lib/paints/load";
import { COLOUR_FAMILIES } from "@/lib/color";
import { JsonLd } from "@/components/json-ld";
import { HomeSearch } from "@/components/home-search";

// Keep in sync with `metadataBase` in src/app/layout.tsx.
const BASE_URL = "https://paintdex.app";

export const metadata: Metadata = {
  // `absolute` opts out of the "%s · Paintdex" template so the homepage keeps its
  // full standalone title rather than getting a suffix.
  title: {
    absolute: "Paintdex — miniature paint database & colour scheme visualiser",
  },
  alternates: { canonical: "/" },
};

// schema.org WebSite (with a SearchAction so search engines can offer a sitelinks
// search box pointing at the browse page) plus a minimal Organization node.
const websiteJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${BASE_URL}/#website`,
      url: `${BASE_URL}/`,
      name: "Paintdex",
      description:
        "Search a database of miniature paints with hex colour values, find visually similar colours across brands, plan and share whole paint schemes.",
      publisher: { "@id": `${BASE_URL}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${BASE_URL}/paints?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      "@id": `${BASE_URL}/#organization`,
      name: "Paintdex",
      url: `${BASE_URL}/`,
      logo: `${BASE_URL}/logo.svg`,
    },
  ],
};

export default function Home() {
  const paints = getAllPaints();
  const brands = getBrands();

  // One representative vivid swatch per colour family for the hero strip.
  const spectrum = COLOUR_FAMILIES.map((family) => {
    const candidates = paints.filter((p) => p.family === family && !p.discontinued);
    // Prefer mid-lightness picks so the strip reads as vivid, not muddy.
    const pick =
      candidates.sort(
        (a, b) => Math.abs(a.lab[0] - 55) - Math.abs(b.lab[0] - 55),
      )[0] ?? candidates[0];
    return pick ? { family, paint: pick } : null;
  }).filter(Boolean) as { family: string; paint: (typeof paints)[number] }[];

  return (
    <main>
      <JsonLd data={websiteJsonLd} />
      <section className="mx-auto max-w-4xl px-4 py-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Find the right miniature paint
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Search a database of miniature paints with hex colour values, find
          visually similar colours across brands, plan and share whole paint schemes.
        </p>

        <HomeSearch />

        <div className="mx-auto mt-8 flex max-w-xl overflow-hidden rounded-lg border border-border">
          {spectrum.map(({ family, paint }) => (
            <Link
              key={family}
              href={`/paints?family=${family}`}
              title={`${family} — ${paint.name}`}
              className="h-10 flex-1 transition-transform hover:scale-y-125"
              style={{ backgroundColor: paint.hex }}
              aria-label={`Browse ${family} paints`}
            />
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2 text-sm text-muted-foreground">
          {brands.map((brand, i) => (
            <span key={brand}>
              <Link
                href={`/paints?brand=${encodeURIComponent(brand)}`}
                className="hover:text-foreground hover:underline"
              >
                {brand}
              </Link>
              {i < brands.length - 1 && <span className="ml-1.5">·</span>}
            </span>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-12">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="grid gap-6 p-6 sm:grid-cols-[1.4fr_1fr] sm:items-center sm:p-8">
            <div className="text-left">
              <h2 className="text-2xl font-bold tracking-tight">
                Plan your whole colour scheme
              </h2>
              <p className="mt-2 text-muted-foreground">
                The paint scheme visualiser lets you group paints by element —
                armour, robes, lenses, etc — and preview every colour together as
                blended vertical bars. Add paints from the database or your own custom
                values. Save and share your schemes by logging in with a Google account.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  href="/visualiser"
                  className="inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Open the visualiser →
                </Link>
                <Link
                  href="/paints"
                  className="inline-block rounded-lg border border-border px-5 py-2.5 text-sm font-medium hover:bg-accent"
                >
                  Browse {paints.length.toLocaleString()} paints
                </Link>
              </div>
            </div>
            <div
              className="hidden h-40 gap-2 sm:flex"
              aria-hidden="true"
            >
              {spectrum.slice(0, 6).map(({ family, paint }, i) => {
                const next =
                  spectrum[(i + 1) % Math.min(spectrum.length, 6)].paint.hex;
                return (
                  <div
                    key={family}
                    className="flex-1 rounded-md border border-border/40"
                    style={{
                      background: `linear-gradient(to bottom, ${paint.hex}, ${next})`,
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl gap-4 px-4 pb-20 sm:grid-cols-2">
        <Feature
          title="Searchable & filterable"
          body="Filter by brand, product range, finish type and colour family. See paints with similar hues."
        />
        <Feature
          title="Perceptual colour matching"
          body="Similar colours are ranked with CIEDE2000 — the same maths professionals use to compare colours."
        />
        <Feature
          title="Open source"
          body={
            <>
              The paint database is plain, community-editable JSON. Spot a
              wrong hex or a missing paint?{" "}
              <a
                href="https://github.com/s10-steve/paintdex"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline underline-offset-2 hover:no-underline"
              >
                Open a pull request on GitHub
              </a>
              .
            </>
          }
        />
      </section>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 text-left">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
