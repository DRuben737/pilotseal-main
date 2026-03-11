import Link from "next/link";

import home1Image from "@/images/home1.png";
import home2Image from "@/images/home2.png";
import home3Image from "@/images/home3.png";
import { guideCards } from "@/app/endorsements/guide-content";

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
  ];
  const articleEntrances = [
    { ...guideCards["student-solo"], short: "Solo basics" },
    { ...guideCards["solo-cross-country"], short: "Route clarity" },
    { ...guideCards["knowledge-test"], short: "Test signoff" },
  ];

  return (
    <main className="page-shell page-home px-3">
      <div className="site-shell page-stack space-y-8">
        <section className="hero-panel hero-home home-panel-with-bg overflow-hidden px-6 py-7 sm:px-8 sm:py-8">
          <div className="home-panel-bg" style={{ ["--panel-image" as string]: `url(${home1Image.src})` }} aria-hidden="true" />
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
          </div>
        </section>

        <section className="section-panel-tools home-panel-with-bg overflow-hidden px-6 py-8 sm:px-8">
          <div className="home-panel-bg home-panel-bg-soft" style={{ ["--panel-image" as string]: `url(${home2Image.src})` }} aria-hidden="true" />
          <div className="home-section-heading">
            <div>
              <p className="muted-kicker">Featured tools</p>
              <h2 className="section-title mt-2 text-3xl font-semibold">
                Toolbox
              </h2>
            </div>
            <Link href="/tools" className="secondary-button">
              Explore more
            </Link>
          </div>

          <div className="home-featured-grid mt-6">
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
          <section className="content-card home-balanced-panel home-panel-with-bg overflow-hidden p-6 md:col-span-2">
            <div className="home-panel-bg" style={{ ["--panel-image" as string]: `url(${home3Image.src})` }} aria-hidden="true" />
            <p className="muted-kicker">Articles</p>
            <h2 className="section-title mt-2 text-2xl font-semibold">
              Articles
            </h2>
            <p className="copy-muted mt-3 leading-7">
              Context fast.
            </p>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {articleEntrances.map((article) => (
                <Link key={article.href} href={article.href} className="content-card card-link p-5">
                  <p className="muted-kicker">{article.short}</p>
                  <h3 className="mt-2 text-lg font-semibold">{article.title}</h3>
                  <span className="reference-chip mt-4 inline-flex">Read article</span>
                </Link>
              ))}
            </div>
            <div className="mt-5">
              <Link href="/intro" className="secondary-button">
                Explore articles
              </Link>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
