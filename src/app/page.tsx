import Link from "next/link";
import { getAllPaints, getBrands } from "@/lib/paints/load";
import { COLOUR_FAMILIES } from "@/lib/color";

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
      <section className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Find the right miniature paint
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Search a database of miniature and hobby paints with hex colour values,
          find visually similar colours across brands, and plan whole paint
          schemes.
        </p>

        <form action="/paints" method="get" className="mx-auto mt-8 flex max-w-xl gap-2">
          <input
            type="search"
            name="q"
            placeholder="Search paints — e.g. Mephiston Red, black, teal…"
            aria-label="Search paints"
            className="flex-1 rounded-lg border border-input bg-card px-4 py-3 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Search
          </button>
        </form>

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

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
          <Link
            href="/paints"
            className="rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground hover:opacity-90"
          >
            Browse {paints.length.toLocaleString()} paints
          </Link>
          <span className="text-muted-foreground">{brands.join(" · ")}</span>
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
                armour, robes, lenses — and preview every colour together as
                aligned, blended vertical bars, so the whole model reads as one.
                Add paints from the database or your own custom hex, set roles
                and weights, and your scheme autosaves in your browser.
              </p>
              <Link
                href="/visualiser"
                className="mt-4 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Open the visualiser →
              </Link>
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
          body="Filter by brand, product range, finish type and colour family. Every filter is shareable via the URL."
        />
        <Feature
          title="Perceptual colour matching"
          body="Similar colours are ranked with CIEDE2000 — the same maths professionals use to compare colours."
        />
      </section>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 text-left">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
