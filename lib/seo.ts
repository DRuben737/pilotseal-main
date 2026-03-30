import type { Metadata } from "next";

export function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.URL ||
    "https://pilotseal.com"
  );
}

export function toAbsoluteUrl(path = "/") {
  return new URL(path, getSiteUrl()).toString();
}

type BuildPageMetadataInput = {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  keywords?: string[];
};

export function buildPageMetadata({
  title,
  description,
  path,
  type = "website",
  keywords,
}: BuildPageMetadataInput): Metadata {
  const canonical = toAbsoluteUrl(path);

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "PilotSeal",
      type,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export function buildBreadcrumbSchema(
  items: Array<{ name: string; path: string }>
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: toAbsoluteUrl(item.path),
    })),
  };
}

export function buildArticleSchema({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    mainEntityOfPage: toAbsoluteUrl(path),
    publisher: {
      "@type": "Organization",
      name: "PilotSeal",
      url: getSiteUrl(),
    },
  };
}

export function buildFaqSchema(
  faqs: Array<{ q: string; a: string }> | undefined
) {
  if (!faqs || faqs.length === 0) {
    return null;
  }

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.a,
      },
    })),
  };
}
