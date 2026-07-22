import type { MetadataRoute } from "next";

// Keep in sync with `metadataBase` in src/app/layout.tsx.
const BASE_URL = "https://paintdex.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Personal/user-to-user pages aren't public search resources. Social
      // crawlers still read the share pages' OpenGraph tags regardless of this.
      disallow: ["/my-schemes", "/my-paints", "/scheme/"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
