import type { MetadataRoute } from "next";

// Keep in sync with `metadataBase` in src/app/layout.tsx.
const BASE_URL = "https://paintdex.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
