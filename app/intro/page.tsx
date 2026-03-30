import type { Metadata } from "next";

import { IntroContent } from "@/app/intro-content";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "PilotSeal Articles and Guides",
  description:
    "PilotSeal article hub for FAA training workflows, endorsement guides, and SEO-focused aviation content.",
  path: "/intro",
  type: "article",
});

export default function IntroPage() {
  return <IntroContent />;
}
