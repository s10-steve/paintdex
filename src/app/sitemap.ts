import type { MetadataRoute } from "next";
import { getAllPaints } from "@/lib/paints/load";

// Keep in sync with `metadataBase` in src/app/layout.tsx.
const BASE_URL = "https://paintdex.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, priority: 1 },
    { url: `${BASE_URL}/paints`, priority: 0.8 },
    { url: `${BASE_URL}/visualiser`, priority: 0.6 },
  ];

  // One entry per paint detail page. Reuses the same catalogue helper that
  // generateStaticParams() uses in src/app/paints/[id]/page.tsx, so the sitemap
  // stays in sync with the data automatically.
  const paintRoutes: MetadataRoute.Sitemap = getAllPaints().map((paint) => ({
    url: `${BASE_URL}/paints/${paint.id}`,
    priority: 0.5,
  }));

  return [...staticRoutes, ...paintRoutes];
}
