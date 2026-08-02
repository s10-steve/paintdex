/**
 * robots.txt and the sitemap — the two files nothing else in the suite touched,
 * which is why a real bug lived in `robots.ts` unnoticed.
 *
 * That bug: `/scheme/` was in the disallow list. Both `facebookexternalhit` and
 * `Twitterbot` consult robots.txt before fetching a URL, so blocking that path
 * blocked the rich link previews that are the entire justification for the
 * app's only server-rendered route. De-indexing is handled by `robots: { index:
 * false }` in the page's own metadata instead.
 */
import { describe, it, expect } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { getAllPaints } from "@/lib/paints/load";

const BASE_URL = "https://paintdex.app";

/** The disallow list, normalised — `MetadataRoute.Robots` allows string | []. */
function disallowed(): string[] {
  const { rules } = robots();
  const rule = Array.isArray(rules) ? rules[0] : rules;
  const d = rule?.disallow ?? [];
  return Array.isArray(d) ? d : [d];
}

describe("robots", () => {
  it("lets social crawlers reach the shared-scheme pages", () => {
    // Any entry that would match /scheme/<slug>, however it's spelled.
    expect(disallowed().some((path) => path.startsWith("/scheme"))).toBe(false);
  });

  it("keeps the personal pages out", () => {
    expect(disallowed()).toContain("/my-schemes");
    expect(disallowed()).toContain("/my-paints");
  });

  it("points at the sitemap on the canonical origin", () => {
    expect(robots().sitemap).toBe(`${BASE_URL}/sitemap.xml`);
  });
});

describe("sitemap", () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);

  it("lists the public static routes", () => {
    expect(urls).toContain(`${BASE_URL}/`);
    expect(urls).toContain(`${BASE_URL}/paints`);
    expect(urls).toContain(`${BASE_URL}/visualiser`);
  });

  it("lists every paint page, and nothing robots.txt disallows", () => {
    expect(urls).toHaveLength(3 + getAllPaints().length);
    const paths = urls.map((u) => new URL(u).pathname);
    for (const disallowedPath of disallowed()) {
      expect(paths.some((p) => p.startsWith(disallowedPath))).toBe(false);
    }
  });

  it("uses the same origin as robots.txt", () => {
    // The canonical URL is hardcoded in three places (layout, robots, sitemap);
    // this is the drift guard for two of them.
    //
    // Compared as a parsed origin, not a string prefix: `startsWith(BASE_URL)`
    // also accepts `https://paintdex.app.example.com/…`, so it would pass on
    // exactly the drift it exists to catch. (CodeQL flags the prefix form for
    // the same reason, which is how this got noticed.)
    for (const url of urls) expect(new URL(url).origin).toBe(BASE_URL);
  });
});
