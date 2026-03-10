import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.URL || // Netlify production/branch URL
    "https://pilotseal.com";

  return [
    { url: `${baseUrl}/`, lastModified: new Date() },
    { url: `${baseUrl}/intro`, lastModified: new Date() },
    { url: `${baseUrl}/tools`, lastModified: new Date() },
    {
      url: `${baseUrl}/tools/endorsement-generator`,
      lastModified: new Date(),
    },
    { url: `${baseUrl}/tools/flight-brief`, lastModified: new Date() },
    { url: `${baseUrl}/tools/wb`, lastModified: new Date() },
    { url: `${baseUrl}/tools/nighttime`, lastModified: new Date() },
    { url: `${baseUrl}/tools/decoder`, lastModified: new Date() },
    { url: `${baseUrl}/privacy`, lastModified: new Date() },
    { url: `${baseUrl}/disclaimer`, lastModified: new Date() },
    { url: `${baseUrl}/endorsements`, lastModified: new Date() },
    { url: `${baseUrl}/endorsements/student-solo`, lastModified: new Date() },
    { url: `${baseUrl}/endorsements/knowledge-test`, lastModified: new Date() },
    { url: `${baseUrl}/endorsements/practical-test`, lastModified: new Date() },
    {
      url: `${baseUrl}/endorsements/flight-review-currency`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/endorsements/high-performance-complex`,
      lastModified: new Date(),
    },
    { url: `${baseUrl}/endorsements/tailwheel`, lastModified: new Date() },
    {
      url: `${baseUrl}/endorsements/instrument-proficiency`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/endorsements/additional-category-class`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/endorsements/solo-cross-country`,
      lastModified: new Date(),
    },
    { url: `${baseUrl}/endorsements/multi-engine`, lastModified: new Date() },
    { url: `${baseUrl}/endorsements/spin-training`, lastModified: new Date() },
    {
      url: `${baseUrl}/endorsements/instrument-knowledge-test`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/endorsements/commercial-knowledge-test`,
      lastModified: new Date(),
    },
  ];
}
