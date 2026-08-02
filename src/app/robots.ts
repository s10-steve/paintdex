import type { MetadataRoute } from "next";

// Keep in sync with `metadataBase` in src/app/layout.tsx.
const BASE_URL = "https://paintdex.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Personal pages aren't public search resources.
      //
      // `/scheme/` is deliberately NOT listed here. It used to be, on the
      // assumption that social crawlers read OpenGraph tags regardless — they
      // don't: `facebookexternalhit` and `Twitterbot` both consult robots.txt
      // before fetching a URL, so disallowing it blocked exactly the rich
      // previews that are the only reason that route is server-rendered.
      // Keeping share links out of search results is instead the job of
      // `robots: { index: false }` in the page's own metadata, which lets a
      // crawler fetch the page and then decline to index it.
      disallow: ["/my-schemes", "/my-paints"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
