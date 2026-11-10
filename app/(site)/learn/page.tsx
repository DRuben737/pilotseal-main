import type { Metadata } from "next";
import Link from "next/link";

import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Learn | PilotSeal",
  description: "Interactive aviation system demonstrations for student pilots.",
  path: "/learn",
  keywords: ["student pilot", "aircraft systems", "aviation learning"],
});

function EngineIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="h-14 w-14">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 25h22v18H21z" strokeWidth="2.2" />
        <path d="M21 29 11 24v19l10-5M43 29l10-5v19l-10-5" strokeWidth="2.2" />
        <path d="M26 21v-5h12v5M27 43v6h10v-6" strokeWidth="2.2" />
        <circle cx="32" cy="34" r="5.5" strokeWidth="2" />
        <path d="M8 28h6M8 33h6M8 38h6M50 28h6M50 33h6M50 38h6" strokeWidth="1.5" />
      </g>
    </svg>
  );
}

export default function LearnPage() {
  return (
    <main className="page-shell px-3">
      <div className="site-shell page-stack space-y-7">
        <header className="learn-index-intro">
          <p className="eyebrow">Learn</p>
          <h1 className="display-title">
            See the system work.
          </h1>
          <p className="copy-muted">
            Interactive cutaways for the aircraft systems student pilots meet in ground training.
          </p>
        </header>

        <section aria-labelledby="learn-demonstrations">
          <h2 id="learn-demonstrations" className="sr-only">
            Interactive demonstrations
          </h2>
          <Link
            href="/learn/piston-engine"
            className="learn-feature-card group"
          >
            <div className="learn-feature-visual">
              <span className="learn-feature-icon">
                <EngineIcon />
              </span>
            </div>
            <div className="learn-feature-copy">
              <p className="muted-kicker">Aircraft systems · Interactive</p>
              <h2>
                Piston engine
              </h2>
              <p>
                Follow a four-cylinder opposed engine through the four-stroke cycle, then isolate fuel and air, dual ignition, oil, cooling, and exhaust.
              </p>
              <span className="learn-feature-action">
                Open demonstration →
              </span>
            </div>
          </Link>
        </section>
      </div>
    </main>
  );
}
