import type { Metadata } from "next";
import Link from "next/link";

import PistonEngineDemo from "@/components/learn/piston-engine/PistonEngineDemo";
import {
  buildBreadcrumbSchema,
  buildLearningResourceSchema,
  buildPageMetadata,
} from "@/lib/seo";

const title = "How a Piston Engine Works | PilotSeal";
const description =
  "Explore the four-stroke cycle and the core systems of a horizontally opposed aircraft piston engine.";

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path: "/learn/piston-engine",
  keywords: [
    "aircraft piston engine",
    "four stroke engine",
    "student pilot aircraft systems",
    "horizontally opposed engine",
  ],
});

export default function PistonEnginePage() {
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: "Home", path: "/home" },
    { name: "Learn", path: "/learn" },
    { name: "Piston engine", path: "/learn/piston-engine" },
  ]);
  const learningSchema = buildLearningResourceSchema({
    name: "Aircraft piston engine interactive demonstration",
    description,
    path: "/learn/piston-engine",
    audience: "Student pilots",
  });

  return (
    <main className="page-shell px-3">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(learningSchema) }}
      />
      <div className="site-shell page-stack space-y-7">
        <header className="max-w-4xl pt-2">
          <Link className="text-sm font-semibold text-[var(--accent)]" href="/learn">
            ← Learn
          </Link>
          <p className="eyebrow mt-5">Aircraft systems</p>
          <h1 className="display-title mt-3 text-4xl font-semibold text-[var(--foreground)] sm:text-5xl">
            How a piston engine works
          </h1>
          <p className="copy-muted mt-4 max-w-3xl leading-7">
            A cutaway of a generic four-cylinder, horizontally opposed aircraft engine. Run the 720° cycle, then isolate each supporting system.
          </p>
        </header>

        <PistonEngineDemo />

        <section className="border-t border-slate-200/80 py-6 text-sm leading-7 text-slate-600">
          <p>
            Generic instructional visualization—not operating guidance for a specific engine. Use the applicable aircraft POH/AFM for procedures and limitations.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 font-semibold text-[var(--accent)]">
            <a
              href="https://www.faa.gov/sites/faa.gov/files/pilot_handbook_1.pdf"
              target="_blank"
              rel="noreferrer"
            >
              FAA Pilot’s Handbook
            </a>
            <a
              href="https://www.lycoming.com/content/operator%27s-manual-O-360-HO-360-IO-360-AIO-360-HIO-360-TIO-360-60297-12"
              target="_blank"
              rel="noreferrer"
            >
              Lycoming O-360 Operator’s Manual
            </a>
            <a
              href="https://www.faa.gov/regulationspolicies/handbooksmanuals/aviation/faa-h-8083-32b-aviation-maintenance-technician"
              target="_blank"
              rel="noreferrer"
            >
              FAA Powerplant Handbook
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
