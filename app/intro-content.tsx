import Link from "next/link";
import art1Image from "@/images/art1.png";
import art2Image from "@/images/art2.png";
import art4Image from "@/images/art4.png";
import { guideCards } from "@/app/endorsements/guide-content";

const articleImages = [
  { src: art1Image, alt: "Article overview visual" },
  { src: art2Image, alt: "Article search paths visual" },
  { src: art4Image, alt: "Featured guides visual" },
];

export function IntroContent() {
  const authorityLinks = [
    {
      title: "14 CFR Part 61",
      note: "Pilot certification, instructor endorsements, and eligibility rules.",
      href: "https://www.ecfr.gov/current/title-14/chapter-I/subchapter-D/part-61",
    },
    {
      title: "AC 61-65",
      note: "FAA advisory circular with endorsement structure and sample wording.",
      href: "https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/1044476",
    },
    {
      title: "FAA ACS Library",
      note: "Useful when article reading needs to connect back to practical test standards.",
      href: "https://www.faa.gov/training_testing/testing/acs",
    },
  ];

  const featuredArticles = [
    guideCards["student-solo"],
    guideCards["solo-cross-country"],
    guideCards["knowledge-test"],
    guideCards["instrument-knowledge-test"],
  ];

  const principles = [
    {
      title: "Start with context",
      desc: "Use these pages when you want the scenario, requirements, and common issues before opening a tool.",
    },
    {
      title: "Built for real training use",
      desc: "The topics stay centered on CFIs, students, recurrent training, and FAA workflow clarity.",
    },
    {
      title: "Read only what you need",
      desc: "Open a short guide, check the references, then move into the right workflow when you are ready.",
    },
  ];

  return (
    <main className="page-shell page-intro px-3">
      <div className="site-shell page-stack space-y-8">
        <section
          className="hero-panel hero-about hero-compact section-bg-image overflow-hidden px-6 py-7 sm:px-8 sm:py-9"
          style={{ ["--panel-image" as string]: `url(${articleImages[0].src.src})` }}
        >
          <div className="reading-rail article-reading-layout">
            <div>
              <p className="eyebrow">Intro</p>
              <h1 className="display-title mt-4 max-w-3xl text-3xl font-semibold leading-[0.95] text-[var(--foreground)] sm:text-4xl">
                Articles and guides for pilots who want context fast.
              </h1>
              <p className="copy-muted mt-4 max-w-2xl leading-7">
                Read the guide first, then jump into the right tool.
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/endorsements" className="primary-button">
                  Read Endorsement Guides
                </Link>
                <Link href="/tools" className="secondary-button">
                  Open Tools
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="section-panel-about px-6 py-7 sm:px-8">
          <p className="muted-kicker">What you can read here</p>
          <h2 className="section-title mt-2 text-2xl font-semibold">
            Open only the article type you need
          </h2>
          <p className="copy-muted mt-3 leading-7">
            This section is for explainers, checklists, and FAA reading paths before action.
          </p>
          <div className="mt-6 space-y-3">
            {principles.map((item) => (
              <details key={item.title} className="article-disclosure article-faq" open>
                <summary className="article-summary article-summary-compact">
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                </summary>
                <div className="article-disclosure-body">
                  <p className="copy-muted mt-2 leading-7">{item.desc}</p>
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className="masonry-grid">
          <section
            className="section-panel-about section-bg-image px-6 py-8 sm:px-8"
            style={{ ["--panel-image" as string]: `url(${articleImages[0].src.src})` }}
          >
            <p className="muted-kicker">Why this section matters</p>
            <h2 className="section-title mt-2 text-3xl font-semibold">
              Good training content helps users arrive at the right tool with less confusion
            </h2>
            <p className="copy-muted mt-4 leading-8">
              PilotSeal is strongest when the user already understands the job
              to be done. Guides and articles help create that clarity for solo
              training, cross-country planning, written tests, and recurrent
              training scenarios.
            </p>
            <p className="copy-muted mt-4 leading-8">
              Read here when you need background, then move to Tools when you
              are ready to act.
            </p>
          </section>

          <section
            className="content-card section-bg-image p-6"
            style={{ ["--panel-image" as string]: `url(${articleImages[1].src.src})` }}
          >
            <p className="muted-kicker">Common search paths</p>
            <h2 className="section-title mt-2 text-2xl font-semibold">
              Topics pilots and instructors routinely need to review
            </h2>
            <ul className="mt-5 list-disc space-y-3 pl-6 text-[var(--muted)]">
              <li>Student solo endorsement and cross-country questions</li>
              <li>Knowledge test and practical test preparation searches</li>
              <li>Flight review, IPC, and recurrent training scenarios</li>
              <li>Readers comparing guidance before they open a tool</li>
            </ul>
          </section>
        </section>

        <section className="reading-rail">
          <section
            className="content-card section-bg-image p-6 sm:p-7"
            style={{ ["--panel-image" as string]: `url(${articleImages[2].src.src})` }}
          >
            <p className="muted-kicker">Guide surface</p>
            <h2 className="section-title mt-2 text-2xl font-semibold">
              Article paths and guide surfaces in one place
            </h2>
            <p className="copy-muted mt-4 leading-8">
              Browse explanation-first reading paths before moving into tools or narrower endorsement guides.
            </p>
          </section>

          <section className="content-card-dark p-6">
            <p className="muted-kicker">Contact</p>
            <h2 className="section-title mt-2 text-2xl font-semibold">
              Questions, feedback, and collaboration
            </h2>
            <p className="copy-muted mt-4 leading-8">
              PilotSeal is built for instructors and students who want cleaner,
              more usable training workflows. Feedback helps improve both the
              tool experience and the guide content.
            </p>
            <p className="copy-muted mt-4 leading-8">
              For feedback, bug reports, or collaboration:
              <br />
              <a className="font-semibold text-white" href="mailto:admin@pilotseal.com">
                admin@pilotseal.com
              </a>
            </p>
          </section>
        </section>

        <section className="section-panel-about px-6 py-8 sm:px-8">
          <p className="muted-kicker">Source links</p>
          <h2 className="section-title mt-2 text-3xl font-semibold">
            FAA reading worth opening in a new tab
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {authorityLinks.map((link) => (
              <a
                key={link.title}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="content-card card-link reference-card p-6"
              >
                <h3 className="text-lg font-semibold">{link.title}</h3>
                <p className="copy-muted mt-3 leading-7">{link.note}</p>
                <span className="reference-chip mt-4 inline-flex">Open source</span>
              </a>
            ))}
          </div>
        </section>

        <section
          className="section-panel-about section-bg-image px-6 py-7 sm:px-8"
          style={{ ["--panel-image" as string]: `url(${articleImages[2].src.src})` }}
        >
          <p className="muted-kicker">Featured articles</p>
          <h2 className="section-title mt-2 text-2xl font-semibold">
            Start with the guide categories users ask for most often
          </h2>
          <div className="mt-6 space-y-3">
            {featuredArticles.map((article) => (
              <details key={article.href} className="article-disclosure article-faq">
                <summary className="article-summary article-summary-compact">
                  <h3 className="text-lg font-semibold">{article.title}</h3>
                </summary>
                <div className="article-disclosure-body">
                  <p className="copy-muted mt-2 leading-7">{article.desc}</p>
                  <Link className="reference-chip mt-4 inline-flex" href={article.href}>
                    Read article
                  </Link>
                </div>
              </details>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/endorsements" className="primary-button">
              Browse all guides
            </Link>
            <Link href="/tools" className="secondary-button">
              Open tools
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
