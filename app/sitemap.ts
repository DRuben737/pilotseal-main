import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.URL || // Netlify production/branch URL
    "https://pilotseal.com";

  return [
    { url: `${baseUrl}/`, lastModified: new Date() },
    { url: `${baseUrl}/tools`, lastModified: new Date() },
    { url: `${baseUrl}/disclaimer`, lastModified: new Date() },
  ];
}