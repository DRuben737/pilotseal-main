import Link from "next/link";

import AdaptiveImageSlot from "@/components/ui/AdaptiveImageSlot";
import home1Image from "@/images/home1.png";
import home2Image from "@/images/home2.png";
import home3Image from "@/images/home3.png";
import smartNotamImage from "@/images/smartnotam.png";

export default function Home() {
  const featuredTools = [
    {
      title: "Endorsement Generator",
      desc: "Build structured endorsement packets with template search, signature capture, and PDF export.",
      href: "/tools/endorsement-generator",
      eyebrow: "Most used",
    },
    {
      title: "Flight Brief",
      desc: "Prepare weather, risk, NOTAMs, and planning details in one briefing workflow.",
      href: "/tools/flight-brief",
      eyebrow: "Preflight",
    },
    {
      title: "Weight & Balance",
      desc: "Run loading scenarios and visualize CG movement before the dispatch conversation gets messy.",
      href: "/tools/wb",
      eyebrow: "Safety",
    },
    {
      title: "Night Time Calculator",
      desc: "Check civil twilight, night currency windows, and time-of-use references quickly.",
      href: "/tools/nighttime",
      eyebrow: "Reference",
    },
  ];
  const quickTools = featuredTools.slice(0, 3);

  return (
    <main className="page-shell page-home px-3">
      <div className="site-shell page-stack space-y-8">
        <section className="hero-panel hero-home overflow-hidden px-6 py-7 sm:px-8 sm:py-8">
          <div className="home-hero-grid">
            <div className="home-hero-copy">
              <p className="eyebrow">Home</p>
              <h1 className="display-title mt-4 max-w-3xl text-4xl font-semibold leading-[0.94] text-[var(--foreground)] sm:text-5xl">
                Pilot tools for CFIs and students that surface the right workflow fast.
              </h1>
              <p className="copy-muted mt-4 max-w-2xl leading-7">
                PilotSeal puts the most-used training workflows first so CFIs
                and students can open the right tool immediately and move
                faster through planning, endorsement, and review tasks.
              </p>
            </div>

            <div className="content-card image-card image-card-hero overflow-hidden p-3">
              <p className="muted-kicker">Tool-first homepage</p>
              <AdaptiveImageSlot
                src={home1Image}
                alt="PilotSeal homepage visual"
                frameClassName="mt-4"
                priority
              />
            </div>
          </div>

          <div className="home-quick-grid mt-5">
            {quickTools.map((tool) => (
              <Link key={tool.title} href={tool.href} className="content-card card-link home-quick-card p-4">
                <p className="muted-kicker">{tool.eyebrow}</p>
                <h3 className="mt-2 text-lg font-semibold">{tool.title}</h3>
                <p className="copy-muted mt-2 leading-7">{tool.desc}</p>
                <span className="reference-chip mt-4 inline-flex">Open tool</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="section-panel-tools px-6 py-8 sm:px-8">
          <div className="home-section-heading">
            <div>
              <p className="muted-kicker">Featured tools</p>
              <h2 className="section-title mt-2 text-3xl font-semibold">
                Open the tools pilots and instructors use most
              </h2>
            </div>
            <Link href="/tools" className="secondary-button">
              Full tool index
            </Link>
          </div>

          <div className="home-featured-grid mt-6">
            <div className="content-card image-card image-card-featured overflow-hidden p-3 sm:p-4">
              <AdaptiveImageSlot
                src={home2Image}
                alt="Featured tools visual"
                frameClassName="image-fit-frame-compact"
              />
            </div>
            <div className="home-featured-list">
              {featuredTools.map((tool) => (
                <div key={tool.title} className="content-card card-link home-tool-card p-5">
                  <p className="muted-kicker">{tool.eyebrow}</p>
                  <h3 className="mt-2 text-xl font-semibold">{tool.title}</h3>
                  <p className="copy-muted mt-3 leading-7">{tool.desc}</p>
                  <Link className="reference-chip mt-4 inline-flex" href={tool.href}>
                    Open tool
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="home-bottom-grid">
          <div className="section-panel-tools home-balanced-panel px-6 py-7 sm:px-8">
            <p className="muted-kicker">Highlighted workflow</p>
            <h2 className="section-title mt-2 text-3xl font-semibold">
              Flight Brief keeps weather, NOTAMs, and risk notes in one place
            </h2>
            <p className="copy-muted mt-4 leading-8">
              When the task is preflight review, the value is speed and
              clarity. This workflow is designed to reduce tab-hopping and make
              the operational picture easier to scan before takeoff.
            </p>
            <AdaptiveImageSlot
              src={smartNotamImage}
              alt="Flight Brief Smart NOTAM interface"
              frameClassName="mt-6"
            />
          </div>

          <section className="content-card home-balanced-panel p-6">
            <p className="muted-kicker">Articles</p>
            <h2 className="section-title mt-2 text-2xl font-semibold">
              Need guidance before you open a tool?
            </h2>
            <p className="copy-muted mt-4 leading-8">
              PilotSeal also includes article and guide content for users who
              want scope, context, and FAA training references before they
              start drafting or calculating.
            </p>
            <AdaptiveImageSlot
              src={home3Image}
              alt="Home articles visual"
              frameClassName="intro-inline-image mt-6"
            />
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/intro" className="secondary-button">
                Read articles
              </Link>
              <Link href="/disclaimer" className="primary-button">
                Disclaimer
              </Link>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
