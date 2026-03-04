import Image from "next/image";
import type { Metadata } from "next";

import endorsementPageImage from "@/images/endorsementpage.png";

export const metadata: Metadata = {
  title: "About PilotSeal",
  description:
    "Learn why PilotSeal was built and how it supports CFIs and student pilots with FAA-oriented tools.",
};

export default function AboutPage() {
  return (
    <main className="px-3">
      <div className="site-shell space-y-8">
        <section className="hero-panel hero-about overflow-hidden px-6 py-10 sm:px-10 sm:py-14">
          <div className="reading-rail">
            <div>
              <p className="eyebrow">About PilotSeal</p>
              <h1 className="display-title mt-5 max-w-3xl text-5xl font-semibold leading-[0.95] text-[var(--foreground)] sm:text-6xl">
                Built because too many training workflows still depend on messy
                templates and memory.
              </h1>
              <p className="copy-muted mt-6 max-w-2xl text-lg leading-8">
                PilotSeal exists to make endorsement drafting, briefing review,
                and training documentation easier to read, easier to repeat, and
                harder to get sloppy.
              </p>
            </div>

            <div className="content-card overflow-hidden p-3 sm:p-4">
              <p className="muted-kicker">Guide experience</p>
              <div className="mt-4 overflow-hidden rounded-[22px] border border-[var(--border)] bg-white">
                <Image
                  src={endorsementPageImage}
                  alt="PilotSeal endorsement page screenshot"
                  className="h-auto w-full"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="section-panel-about px-6 py-8 sm:px-8">
          <p className="muted-kicker">Why this exists</p>
          <h2 className="section-title mt-2 text-3xl font-semibold">
            Training records should not feel like a scavenger hunt
          </h2>
          <p className="copy-muted mt-4 leading-8">
            PilotSeal was created to make common FAA training workflows clearer
            and more consistent, especially around logbook endorsements,
            instructional briefings, and training documentation.
          </p>
          <p className="copy-muted mt-4 leading-8">
            In many training environments, instructors and students still rely
            on copied templates, informal notes, or inconsistent formatting.
            PilotSeal is meant to reduce that friction while keeping compliance
            awareness visible.
          </p>
        </section>

        <section className="masonry-grid">
          <section className="section-panel-about px-6 py-8 sm:px-8">
            <p className="muted-kicker">Who it’s for</p>
            <h2 className="section-title mt-2 text-3xl font-semibold">
              Built for structured training environments
            </h2>
            <ul className="mt-5 list-disc pl-6 space-y-3 text-[var(--muted)]">
              <li>Certified Flight Instructors (CFIs)</li>
              <li>Student pilots in structured training</li>
              <li>Pilots preparing for knowledge or practical tests</li>
              <li>Training environments that value documentation consistency</li>
            </ul>
          </section>

          <section className="content-card p-6">
            <p className="muted-kicker">What PilotSeal is not</p>
            <h2 className="section-title mt-2 text-2xl font-semibold">
              It does not replace regs or judgment
            </h2>
            <p className="copy-muted mt-4 leading-8">
              PilotSeal does not replace FAA regulations, legal interpretation,
              or instructor judgment. All tools are provided for educational
              support and workflow assistance only.
            </p>
            <p className="copy-muted mt-4 leading-8">
              Instructors remain responsible for verifying applicability,
              aircraft category/class, and current regulatory requirements.
            </p>
          </section>
        </section>

        <section className="section-panel-about px-6 py-8 sm:px-8">
          <p className="muted-kicker">Contact</p>
          <h2 className="section-title mt-2 text-3xl font-semibold">
            Feedback and collaboration
          </h2>
          <p className="copy-muted mt-4 leading-8">
            For feedback, questions, or collaboration inquiries:
          </p>
          <p className="mt-4 text-lg font-semibold text-[var(--foreground)]">
            admin@pilotseal.com
          </p>
        </section>
      </div>
    </main>
  );
}
