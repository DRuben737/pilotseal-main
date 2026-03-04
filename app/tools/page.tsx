import Image from "next/image";
import Link from "next/link";

import smartNotamImage from "@/images/smartnotam.png";
import toolHubImage from "@/images/toolhub.png";

export default function ToolsPage() {
  const tools = [
    {
      name: "Endorsement Generator",
      desc:
        "Generate FAA-style logbook endorsement text and keep your workflow consistent. Always verify against FAR 61 and current guidance.",
      href: "https://tool.pilotseal.com/endorsement-generator",
    },
    {
      name: "Flight Brief / Planning Tools",
      desc:
        "A collection of planning utilities intended to support preflight preparation, operational review, and smarter briefing decisions.",
      href: "https://tool.pilotseal.com/flight-brief",
    },
    {
      name: "More Tools (Hub)",
      desc:
        "All tools are hosted on the Tool Hub. This page explains what they do and who they are for.",
      href: "https://tool.pilotseal.com/",
    },
  ];

  return (
    <main className="px-3">
      <div className="site-shell space-y-8">
        <section className="hero-panel hero-tools overflow-hidden px-6 py-10 sm:px-10 sm:py-14">
          <div className="reading-rail">
            <div>
              <p className="eyebrow">Tool workflows</p>
              <h1 className="display-title mt-5 max-w-3xl text-5xl font-semibold leading-[0.95] text-[var(--foreground)] sm:text-6xl">
                The Tool Hub is the product surface. This page explains what is
                actually worth opening.
              </h1>
              <p className="copy-muted mt-6 max-w-2xl text-lg leading-8">
                PilotSeal tools are built for CFIs and student pilots. The hub
                hosts the applications; this page gives you the shortest path to
                the workflows that matter.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a href="https://tool.pilotseal.com" className="primary-button">
                  Open Tool Hub
                </a>
                <a
                  href="https://tool.pilotseal.com/endorsement-generator"
                  className="secondary-button"
                >
                  Open Endorsement Generator
                </a>
              </div>
            </div>

            <div className="content-card-dark overflow-hidden p-3 sm:p-4">
              <p className="muted-kicker">Tool Hub screenshot</p>
              <div className="mt-4 overflow-hidden rounded-[22px] border border-[var(--border)] bg-white">
                <Image
                  src={toolHubImage}
                  alt="PilotSeal Tool Hub homepage"
                  className="h-auto w-full"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="section-panel-tools px-6 py-8 sm:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="muted-kicker">Primary workflows</p>
              <h2 className="section-title mt-2 text-3xl font-semibold">
                Open the right tool, not the whole stack
              </h2>
            </div>
            <Link href="/endorsements" className="secondary-button">
              Read endorsement guides
            </Link>
          </div>

          <div className="guide-grid mt-6">
            {tools.map((t) => (
              <div key={t.name} className="content-card card-link p-6">
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <h2 className="text-xl font-semibold">{t.name}</h2>
                    <p className="copy-muted mt-2 leading-7">{t.desc}</p>
                  </div>
                  <a className="reference-chip whitespace-nowrap" href={t.href}>
                    Open
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="masonry-grid">
          <div className="section-panel-tools px-6 py-8 sm:px-8">
            <p className="muted-kicker">Brief highlight</p>
            <h2 className="section-title mt-2 text-3xl font-semibold">
              Smart NOTAM is one of the strongest parts of Flight Brief
            </h2>
            <p className="copy-muted mt-4 leading-8">
              If there is one planning feature to put in front of users, it is
              Smart NOTAM. It turns a vague preflight information problem into a
              more focused review surface that is easier to scan during a brief.
            </p>
            <div className="mt-6 overflow-hidden rounded-[24px] border border-[var(--border)] bg-white">
              <Image
                src={smartNotamImage}
                alt="Smart NOTAM interface screenshot"
                className="h-auto w-full"
              />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <a href="https://tool.pilotseal.com/flight-brief" className="primary-button">
                Open Flight Brief
              </a>
              <a href="https://tool.pilotseal.com" className="secondary-button">
                Back to Tool Hub
              </a>
            </div>
          </div>

          <section className="content-card-dark p-6">
            <p className="muted-kicker">Compliance note</p>
            <h2 className="section-title mt-2 text-2xl font-semibold">
              Tools support judgment. They do not replace it.
            </h2>
            <p className="copy-muted mt-4 leading-8">
              PilotSeal is provided for educational purposes. It does not
              replace official FAA regulations, guidance, or flight instructor
              judgment. Always verify wording and applicability for your
              scenario.
            </p>
            <Link
              className="mt-5 inline-flex text-sm font-semibold text-white"
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
