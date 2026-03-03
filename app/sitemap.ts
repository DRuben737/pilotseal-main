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
    { url: `${baseUrl}/endorsements`, lastModified: new Date() },
    { url: `${baseUrl}/endorsements/student-solo`, lastModified: new Date() },
    { url: `${baseUrl}/endorsements/knowledge-test`, lastModified: new Date() },
    { url: `${baseUrl}/endorsements/practical-test`, lastModified: new Date() },
  ];
}