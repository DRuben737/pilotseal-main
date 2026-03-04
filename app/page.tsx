import Link from "next/link";
import Image from "next/image";

import toolHubImage from "@/images/toolhub.png";

export default function Home() {
  const highlights = [
    {
      title: "Built for CFIs & student pilots",
      desc: "Aviation tools designed for real training workflows—clear, consistent, and practical.",
    },
    {
      title: "Compliance-first mindset",
      desc: "Centered around FAR 61 concepts and good recordkeeping habits. Always verify against official FAA references.",
    },
    {
      title: "Tools + guidance (not just buttons)",
      desc: "The main site documents what each tool is for; the Tool Hub runs the applications.",
    },
  ];

  const featuredTools = [
    {
      name: "Endorsement Generator",
      desc:
        "Generate consistent FAA-style logbook endorsement wording aligned with FAR 61 concepts. Reduce omissions and formatting inconsistencies.",
      href: "https://tool.pilotseal.com/endorsement-generator",
    },
    {
      name: "Flight Brief",
      desc:
        "Structured preflight briefing workflow for training scenarios—designed to support decision-making and instructional consistency.",
      href: "https://tool.pilotseal.com/flight-brief",
    },
    {
      name: "Weight & Balance",
      desc:
        "Quick weight and balance calculations for training aircraft. Designed to reinforce performance awareness during instruction.",
      href: "https://tool.pilotseal.com/wb",
    },
  ];

  return (
    <main className="px-3">
      <div className="site-shell space-y-8">
        <section className="hero-panel hero-home overflow-hidden px-6 py-10 sm:px-10 sm:py-14">
          <div className="reading-rail">
            <div>
              <p className="eyebrow">Built for real training records</p>
              <h1 className="display-title mt-5 max-w-3xl text-5xl font-semibold leading-[0.94] text-[var(--foreground)] sm:text-6xl">
                FAA workflow tools that feel closer to a cockpit checklist than
                a generic website.
              </h1>
              <p className="copy-muted mt-6 max-w-2xl text-lg leading-8">
                PilotSeal is for CFIs and student pilots who need cleaner
                endorsement drafting, tighter recordkeeping, and faster access
                to the workflows that matter in training.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="https://tool.pilotseal.com/endorsement-generator"
                  className="primary-button"
                >
                  Open Endorsement Generator
                </a>
                <Link href="/endorsements" className="secondary-button">
                  Read the endorsement guides
                </Link>
                <Link href="/tools" className="secondary-button">
                  Browse tool workflows
                </Link>
              </div>
            </div>

            <div className="content-card overflow-hidden p-3 sm:p-4">
              <p className="muted-kicker">Most used first</p>
              <h2 className="section-title mt-3 text-2xl font-semibold">
                See the Tool Hub before you click into a workflow
              </h2>
              <p className="copy-muted mt-3 px-3 leading-7">
                The hub is the fastest way to see how PilotSeal organizes
                endorsement, briefing, and planning workflows in one place.
              </p>
              <div className="mt-5 overflow-hidden rounded-[22px] border border-[var(--border)] bg-white">
                <Image
                  src={toolHubImage}
                  alt="PilotSeal Tool Hub homepage screenshot"
                  className="h-auto w-full"
                  priority
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-3 px-3 pb-3">
                <a href="https://tool.pilotseal.com" className="secondary-button">
                  Open Tool Hub
                </a>
                <a
                  href="https://tool.pilotseal.com/endorsement-generator"
                  className="primary-button"
                >
                  Open Generator
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="section-panel px-6 py-8 sm:px-8">
          <p className="muted-kicker">What PilotSeal is</p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {highlights.map((h) => (
              <div
                key={h.title}
                className="content-card p-6"
              >
                <h3 className="text-lg font-semibold">{h.title}</h3>
                <p className="copy-muted mt-2 leading-7">{h.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="masonry-grid">
          <div className="content-card-dark px-6 py-8 sm:px-8">
            <p className="muted-kicker">Primary jobs</p>
            <h2 className="section-title mt-2 text-3xl font-semibold text-white">
              Use PilotSeal when the workflow is bigger than one note in a logbook
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-white/70">
                  Endorsements
                </p>
                <p className="mt-2 text-sm leading-7 text-white/80">
                  Draft cleaner wording after the scenario and FAA references are clear.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-white/70">
                  Briefing
                </p>
                <p className="mt-2 text-sm leading-7 text-white/80">
                  Structure preflight review so operational details are easier to scan.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-white/70">
                  Training records
                </p>
                <p className="mt-2 text-sm leading-7 text-white/80">
                  Reduce friction caused by copied templates and inconsistent formatting.
                </p>
              </div>
            </div>
          </div>

          <div className="section-panel px-6 py-8 sm:px-8">
            <p className="muted-kicker">Fast orientation</p>
            <h2 className="section-title mt-2 text-3xl font-semibold">
              If you only do one thing here
            </h2>
            <p className="copy-muted mt-4 leading-8">
              Open the generator when the scenario is already clear. Open the
              guides when scope, prerequisites, or references still need review.
            </p>
          </div>
        </section>

        <section className="section-panel-tools px-6 py-8 sm:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="muted-kicker">Featured tools</p>
              <h2 className="section-title mt-2 text-3xl font-semibold">
                Open the workflow, not just the marketing page
              </h2>
            </div>
            <a href="https://tool.pilotseal.com" className="secondary-button">
              Open tool hub
            </a>
          </div>

          <div className="mt-6 guide-grid">
            {featuredTools.map((t) => (
              <div
                key={t.name}
                className="content-card card-link p-6"
              >
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <h3 className="text-lg font-semibold">{t.name}</h3>
                    <p className="copy-muted mt-2 leading-7">{t.desc}</p>
                  </div>
                  <a
                    className="reference-chip whitespace-nowrap"
                    href={t.href}
                  >
                    Open
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="reading-rail">
          <div className="section-panel px-6 py-8 sm:px-8">
            <p className="muted-kicker">Regulatory focus</p>
            <h2 className="section-title mt-2 text-3xl font-semibold">
              Built around FAR 61 logic, not generic copy
            </h2>
            <p className="copy-muted mt-4 leading-8">
              PilotSeal tools are built with awareness of FAA Part 61 training
              structures and common endorsement workflows. The goal is clarity
              and consistency, not legal substitution.
            </p>
            <p className="copy-muted mt-4 leading-8">
              Instructors remain responsible for verifying applicability,
              aircraft category/class, limitations, and current FAA
              requirements.
            </p>
          </div>

          <section className="content-card p-6">
            <p className="muted-kicker">Compliance note</p>
            <h2 className="section-title mt-2 text-2xl font-semibold">
              Always verify before signing
            </h2>
            <p className="copy-muted mt-4 leading-8">
              PilotSeal is provided for educational purposes and does not
              replace official FAA regulations, guidance, or instructor
              judgment.
            </p>
            <Link
              className="mt-5 inline-flex text-sm font-semibold text-[var(--accent)]"
              href="/disclaimer"
            >
              Read the disclaimer →
            </Link>
          </section>
        </section>
      </div>
    </main>
  );
}
