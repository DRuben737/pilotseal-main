import type { Metadata } from "next";

import { IntroContent } from "@/app/intro-content";

export const metadata: Metadata = {
  title: "PilotSeal Articles and Guides",
  description:
    "PilotSeal article hub for FAA training workflows, endorsement guides, and SEO-focused aviation content.",
};

export default function IntroPage() {
  return <IntroContent />;
}
