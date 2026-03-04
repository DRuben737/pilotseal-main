import Link from "next/link";

import { defaultGuideReferences, guideCards } from "./guide-content";

export const metadata = {
  title: "FAA Logbook Endorsements Guide (FAR 61) | PilotSeal",
  description:
    "A practical guide to FAA logbook endorsements for CFIs and student pilots. Understand FAR 61 structure, common endorsement types, and typical pitfalls.",
};

const featuredGuides = [
  guideCards["student-solo"],
  guideCards["solo-cross-country"],
  guideCards["knowledge-test"],
  guideCards["instrument-knowledge-test"],
  guideCards["commercial-knowledge-test"],
  guideCards["practical-test"],
];

const extendedGuides = [
  guideCards["flight-review-currency"],
  guideCards["instrument-proficiency"],
  guideCards["additional-category-class"],
  guideCards["multi-engine"],
  guideCards["high-performance-complex"],
  guideCards["spin-training"],
  guideCards.tailwheel,
];

const operatingRules = [
  {
    title: "Match the real scenario",
    desc: "Do not start from a generic sentence. Start from the exact activity being authorized or documented.",
  },
  {
    title: "Keep scope visible",
    desc: "Certificate, rating, category/class, aircraft context, and limits should be obvious without outside notes.",
  },
  {
    title: "Support the wording with records",
    desc: "If the training record does not support the statement, the endorsement text is already too broad.",
  },
  {
    title: "Check the references last",
    desc: "Before signing, verify currency against Part 61, AC 61-65, and any scenario-specific FAA guidance.",
  },
];

const workflow = [
  "Pick the endorsement type before you open a template.",
  "Confirm prerequisites and actual training completed.",
  "Write scope so another instructor can understand it instantly.",
  "Verify identifiers, date, and FAA reference alignment before signing.",
];

const mistakes = [
  "Using a one-size-fits-all endorsement for different scenarios.",
  "Hiding important scope details in school shorthand.",
  "Treating the wording as a formality instead of part of the training record.",
  "Making the guide pages hard to find until the user has already scrolled past a long article.",
];

const faqs = [
  {
    q: "Should I read the guide first or open the generator first?",
    a: "If the scenario is already clear, open the generator first. If scope or applicability is still fuzzy, read the relevant guide page before drafting anything.",
  },
  {
    q: "Does PilotSeal replace FAA regulations or legal interpretation?",
    a: "No. PilotSeal is educational. Always verify wording, applicability, and currency against FAR/AIM and relevant FAA guidance for your specific scenario.",
  },
  {
    q: "Can I copy endorsement text directly into a logbook?",
    a: "Use examples as a starting point only. The final record still needs to match the pilot, aircraft, training context, and current FAA requirements.",
  },
];

export default function EndorsementsPage() {
  return (
    <main className="px-3">
      <div className="site-shell space-y-8">
        <section className="hero-panel hero-endorsements overflow-hidden px-6 py-10 sm:px-10 sm:py-14">
          <div className="reading-rail">
            <div>
              <p className="eyebrow">FAA endorsement guide</p>
              <h1 className="display-title mt-5 max-w-3xl text-5xl font-semibold leading-[0.95] text-[var(--foreground)] sm:text-6xl">
                Find the right endorsement page fast, then draft from a cleaner
                starting point.
              </h1>
              <p className="copy-muted mt-6 max-w-2xl text-lg leading-8">
                This page now works like an operations index, not a long essay.
                Pick the scenario first, review the relevant FAA references,
                then use the Endorsement Generator when the scope is clear.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="https://tool.pilotseal.com/endorsement-generator"
                  className="primary-button"
                >
                  Open Endorsement Generator
                </a>
                <a href="#guide-entry" className="secondary-button">
                  Browse guide pages
                </a>
              </div>
            </div>

            <div className="content-card p-6 sm:p-7">
              <p className="muted-kicker">Read this like a preflight brief</p>
              <h2 className="section-title mt-3 text-2xl font-semibold">
                Fast path
              </h2>
              <ol className="mt-5 space-y-4 text-sm leading-7 text-[var(--muted)]">
                {workflow.map((item, index) => (
                  <li
                    key={item}
                    className="flex gap-4 rounded-2xl bg-[var(--surface-muted)] px-4 py-4"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">
                      {index + 1}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section
          id="guide-entry"
          className="section-panel-endorsements px-6 py-8 sm:px-8"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="muted-kicker">Start reading here</p>
              <h2 className="section-title mt-2 text-3xl font-semibold">
                High-priority endorsement guides
              </h2>
              <p className="copy-muted mt-3 max-w-3xl leading-8">
                These are the pages most users need first. The guide entry is
                intentionally near the top so you do not have to scroll through
                an article before getting to the actual reading paths.
              </p>
            </div>
            <span className="reference-chip">13 guide pages live</span>
          </div>

          <div className="guide-grid mt-6">
            {featuredGuides.map((guide) => (
              <div key={guide.href} className="content-card card-link p-6">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <h3 className="text-xl font-semibold">{guide.title}</h3>
                    <p className="copy-muted mt-3 leading-7">{guide.desc}</p>
                  </div>
                  <Link className="reference-chip whitespace-nowrap" href={guide.href}>
                    Read
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="masonry-grid">
          <div className="section-panel-endorsements px-6 py-8 sm:px-8">
            <p className="muted-kicker">Core operating rules</p>
            <h2 className="section-title mt-2 text-3xl font-semibold">
              The useful part of endorsement drafting
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {operatingRules.map((rule) => (
                <div key={rule.title} className="content-card p-5">
                  <h3 className="text-lg font-semibold">{rule.title}</h3>
                  <p className="copy-muted mt-2 leading-7">{rule.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <aside className="content-card-dark p-6">
            <p className="muted-kicker">Common failure mode</p>
            <h2 className="section-title mt-2 text-2xl font-semibold">
              What makes endorsement pages feel weak
            </h2>
            <ul className="mt-5 space-y-3 text-sm leading-7 text-white/80">
              {mistakes.map((mistake) => (
                <li
                  key={mistake}
                  className="rounded-2xl bg-white/6 px-4 py-4"
                >
                  {mistake}
                </li>
              ))}
            </ul>
          </aside>
        </section>

        <section className="section-panel-endorsements px-6 py-8 sm:px-8">
          <p className="muted-kicker">Reference stack</p>
          <h2 className="section-title mt-2 text-3xl font-semibold">
            FAA material worth checking before you sign
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {defaultGuideReferences.map((reference) => (
              <div key={reference.title} className="content-card p-6">
                <h3 className="text-lg font-semibold">{reference.title}</h3>
                <p className="copy-muted mt-3 leading-7">{reference.note}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section-panel-endorsements px-6 py-8 sm:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="muted-kicker">Extended library</p>
              <h2 className="section-title mt-2 text-3xl font-semibold">
                Additional endorsement scenarios
              </h2>
            </div>
            <a
              href="https://tool.pilotseal.com/endorsement-generator"
              className="secondary-button"
            >
              Draft with the generator
            </a>
          </div>

          <div className="guide-grid mt-6">
            {extendedGuides.map((guide) => (
              <div key={guide.href} className="content-card card-link p-6">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <h3 className="text-lg font-semibold">{guide.title}</h3>
                    <p className="copy-muted mt-2 leading-7">{guide.desc}</p>
                  </div>
                  <Link className="reference-chip whitespace-nowrap" href={guide.href}>
                    Read
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="reading-rail">
          <div className="section-panel-endorsements px-6 py-8 sm:px-8">
            <p className="muted-kicker">Why the generator helps</p>
            <h2 className="section-title mt-2 text-3xl font-semibold">
              Use the tool after the scenario is clear
            </h2>
            <p className="copy-muted mt-4 leading-8">
              The generator is useful when you already know what endorsement
              you are working on and need a cleaner first draft. It reduces
              omissions, keeps formatting tighter, and moves you away from
              random copied text.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="https://tool.pilotseal.com/endorsement-generator"
                className="primary-button"
              >
                Open Endorsement Generator
              </a>
              <Link href="/disclaimer" className="secondary-button">
                Read disclaimer
              </Link>
            </div>
          </div>

          <section className="content-card p-6">
            <p className="muted-kicker">FAQ</p>
            <div className="mt-4 space-y-4">
              {faqs.map((faq) => (
                <div
                  key={faq.q}
                  className="rounded-2xl bg-[var(--surface-muted)] px-5 py-5"
                >
                  <p className="font-semibold">{faq.q}</p>
                  <p className="copy-muted mt-2 leading-7">{faq.a}</p>
                </div>
              ))}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
