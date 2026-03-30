import Link from "next/link";
import EndorsementDisclaimer from "@/components/legal/EndorsementDisclaimer";
import {
  buildArticleSchema,
  buildBreadcrumbSchema,
  buildFaqSchema,
} from "@/lib/seo";

import {
  defaultGuideReferences,
  guideCards,
  type EndorsementGuide,
  type GuideSection,
} from "./guide-content";

function renderSection(section: GuideSection) {
  if (section.kind === "text") {
    return (
      <details key={section.title} className="article-disclosure section-panel px-6 py-6 sm:px-8" open>
        <summary className="article-summary">
          <div>
            <p className="muted-kicker">Guide section</p>
            <h2 className="section-title mt-2 text-3xl font-semibold">
              {section.title}
            </h2>
          </div>
        </summary>
        <div className="article-disclosure-body">
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="copy-muted mt-4 leading-8">
              {paragraph}
            </p>
          ))}
        </div>
      </details>
    );
  }

  if (section.kind === "checklist") {
    return (
      <details
        key={section.title}
        className="article-disclosure section-panel px-6 py-6 sm:px-8"
        open
      >
        <summary className="article-summary">
          <div>
            <p className="muted-kicker">Checklist</p>
            <h2 className="section-title mt-2 text-3xl font-semibold">
              {section.title}
            </h2>
          </div>
        </summary>
        <div className="article-disclosure-body">
          <ul className="mt-6 grid gap-3 text-sm leading-7 text-[var(--muted)]">
            {section.items.map((item, index) => (
              <li
                key={item}
                className="content-card flex gap-4 px-5 py-5"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">
                  {index + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5">
            <Link
              href="/tools/endorsement-generator"
              className="inline-flex text-sm font-semibold text-[var(--accent)]"
            >
              Generate endorsement wording →
            </Link>
          </div>
        </div>
      </details>
    );
  }

  if (section.kind === "bullet") {
    return (
      <details key={section.title} className="article-disclosure section-panel px-6 py-6 sm:px-8" open>
        <summary className="article-summary">
          <div>
            <p className="muted-kicker">Key points</p>
            <h2 className="section-title mt-2 text-3xl font-semibold">
              {section.title}
            </h2>
          </div>
        </summary>
        <div className="article-disclosure-body">
          {section.intro ? (
            <p className="copy-muted mt-4 leading-8">{section.intro}</p>
          ) : null}
          <ul className="mt-5 list-disc pl-6 space-y-3 text-[var(--muted)]">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {section.outro ? (
            <p className="copy-muted mt-5 leading-8">{section.outro}</p>
          ) : null}
        </div>
      </details>
    );
  }

  return (
    <details key={section.title} className="article-disclosure section-panel px-6 py-6 sm:px-8" open>
      <summary className="article-summary">
        <div>
          <p className="muted-kicker">Common issues</p>
          <h2 className="section-title mt-2 text-3xl font-semibold">
            {section.title}
          </h2>
        </div>
      </summary>
      <div className="article-disclosure-body">
        {section.intro ? (
          <p className="copy-muted mt-4 leading-8">{section.intro}</p>
        ) : null}
        <div className="mt-6 guide-grid">
          {section.items.map((item) => (
            <div key={item.title} className="content-card p-6">
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="copy-muted mt-2 leading-7">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

export default function EndorsementGuidePage({
  guide,
}: {
  guide: EndorsementGuide;
}) {
  const relatedGuides = (guide.relatedGuideSlugs ?? []).map((slug) => guideCards[slug]);
  const references = guide.references ?? defaultGuideReferences;
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Endorsements", path: "/endorsements" },
    { name: guide.breadcrumb, path: `/endorsements/${guide.slug}` },
  ]);
  const articleSchema = buildArticleSchema({
    title: guide.title,
    description: guide.heroDescription,
    path: `/endorsements/${guide.slug}`,
  });
  const faqSchema = buildFaqSchema(guide.faqs);

  return (
    <main className="page-shell page-guide px-3">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(articleSchema),
        }}
      />
      {faqSchema ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(faqSchema),
          }}
        />
      ) : null}
      <div className="site-shell page-stack space-y-8">
        <section className="hero-panel hero-guide hero-compact overflow-hidden px-6 py-7 sm:px-8 sm:py-9">
          <div className="reading-rail">
            <div>
              <p className="eyebrow">Endorsement guide</p>
              <p className="mt-3 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                <Link className="hover:text-[var(--accent)]" href="/endorsements">
                  Endorsements
                </Link>{" "}
                / {guide.breadcrumb}
              </p>
              <h1 className="display-title mt-3 max-w-3xl text-3xl font-semibold leading-[0.95] text-[var(--foreground)] sm:text-4xl">
                {guide.title}
              </h1>
              <p className="copy-muted mt-4 max-w-2xl leading-7">
                {guide.heroDescription}
              </p>
            </div>

            <div className="content-card p-5 sm:p-6">
              <p className="muted-kicker">Fast path</p>
              <p className="copy-muted mt-2 leading-7">
                Review scope, then open the generator.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/tools/endorsement-generator"
                  className="primary-button"
                >
                  Open Endorsement Generator
                </Link>
                <Link href="/endorsements" className="secondary-button">
                  Browse all guides
                </Link>
              </div>
            </div>
          </div>
        </section>

        <div className="article-reading-stack space-y-5">{guide.sections.map(renderSection)}</div>

        {references.length > 0 ? (
          <section className="section-panel px-6 py-8 sm:px-8">
            <p className="muted-kicker">Reference stack</p>
            <h2 className="section-title mt-2 text-3xl font-semibold">
              Relevant FAA references
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {references.map((reference) => (
                <a
                  key={reference.title}
                  href={reference.href}
                  target="_blank"
                  rel="noreferrer"
                  className="content-card card-link reference-card p-6"
                >
                  <h3 className="text-lg font-semibold">{reference.title}</h3>
                  <p className="copy-muted mt-3 leading-7">{reference.note}</p>
                  <span className="reference-chip mt-4 inline-flex">Open source</span>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <section className="section-panel px-6 py-8 sm:px-8">
          <p className="muted-kicker">Drafting support</p>
          <h2 className="section-title mt-2 text-3xl font-semibold">
            {guide.ctaTitle ?? "Use the generator"}
          </h2>
          <p className="copy-muted mt-4 max-w-3xl leading-8">
            {guide.ctaDescription}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/tools/endorsement-generator"
              className="primary-button"
            >
              Open Endorsement Generator
            </Link>
            <Link className="secondary-button" href="/disclaimer">
              Read disclaimer
            </Link>
          </div>
          <EndorsementDisclaimer className="mt-6" />
        </section>

        {guide.faqs && guide.faqs.length > 0 ? (
          <section className="content-card p-6 sm:p-8">
            <p className="muted-kicker">FAQ</p>
            <h2 className="section-title mt-2 text-3xl font-semibold">
              Quick answers
            </h2>
            <div className="mt-6 space-y-3">
              {guide.faqs.map((faq) => (
                <details key={faq.q} className="article-disclosure article-faq" open={false}>
                  <summary className="article-summary article-summary-compact">
                    <p className="font-semibold">{faq.q}</p>
                  </summary>
                  <div className="article-disclosure-body">
                    <p className="copy-muted mt-2 leading-7">{faq.a}</p>
                  </div>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        {relatedGuides.length > 0 ? (
          <section className="section-panel px-6 py-8 sm:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="muted-kicker">Next reads</p>
                <h2 className="section-title mt-2 text-3xl font-semibold">
                  Related guides
                </h2>
              </div>
              <Link className="secondary-button" href="/endorsements">
                All endorsement guides
              </Link>
            </div>
            <div className="guide-grid mt-6">
              {relatedGuides.map((item) => (
                <div key={item.href} className="content-card card-link p-6">
                  <div className="flex items-start justify-between gap-6">
                    <div>
                      <h3 className="text-lg font-semibold">{item.title}</h3>
                      <p className="copy-muted mt-2 leading-7">{item.desc}</p>
                    </div>
                    <Link className="reference-chip whitespace-nowrap" href={item.href}>
                      Read
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <div className="pb-2 text-sm text-[var(--muted)]">
          <Link className="font-semibold text-[var(--accent)]" href="/endorsements">
            ← Back to Endorsements
          </Link>
        </div>
      </div>
    </main>
  );
}
