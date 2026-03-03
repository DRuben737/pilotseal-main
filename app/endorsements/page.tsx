export const metadata = {
  title: "FAA Logbook Endorsements Guide (FAR 61) | PilotSeal",
  description:
    "A practical guide to FAA logbook endorsements for CFIs and student pilots. Understand FAR 61 structure, common endorsement types, and typical pitfalls.",
};

const faqs = [
  {
    q: "Does PilotSeal replace FAA regulations or legal interpretation?",
    a: "No. PilotSeal is educational. Always verify wording, applicability, and currency against FAR/AIM and relevant FAA guidance for your specific scenario.",
  },
  {
    q: "Can I copy endorsement text directly into a logbook?",
    a: "You can use examples as a starting point, but you must confirm it matches the pilot, aircraft category/class, training context, and current FAA requirements. CFIs should ensure all required elements are present.",
  },
  {
    q: "Why do endorsements vary between instructors and schools?",
    a: "Many endorsements have required elements, but formats can differ (school templates, additional notes, aircraft limitations, local procedures). The important part is meeting the regulatory intent and including required identifiers and scope.",
  },
];

export default function EndorsementsPage() {
  return (
    <main className="min-h-screen bg-white text-black px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">
              FAA Logbook Endorsements (FAR 61 Guide)
            </h1>
            <p className="mt-4 text-lg text-gray-700">
              PilotSeal helps CFIs and student pilots work with endorsement
              wording more consistently. This page explains the “why” and the
              structure behind common endorsements, then links you to the tool
              hub for generation and workflows.
            </p>
          </div>

          <a
            href="https://tool.pilotseal.com"
            className="px-5 py-3 rounded-xl bg-black text-white whitespace-nowrap"
          >
            Open Tool Hub →
          </a>
        </div>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold">What is an endorsement?</h2>
          <p className="mt-3 text-gray-700">
            In FAA training, an endorsement is a required instructor
            certification in a pilot’s logbook (or training record) stating that
            specific training, review, or prerequisites have been completed and
            that the pilot is authorized for a particular activity (for example,
            solo flight, a knowledge test, or a practical test).
          </p>
          <p className="mt-3 text-gray-700">
            Endorsements are not just “paperwork”—they’re a compliance artifact.
            Good practice is to be explicit, consistent, and verifiable.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold">How FAR 61 shows up in practice</h2>
          <div className="mt-4 space-y-4 text-gray-700">
            <p>
              Many endorsement requirements are connected to FAR Part 61 (pilot
              certification) and related FAA guidance. In practice, you’ll often
              map:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <span className="font-medium">Eligibility & prerequisites</span>{" "}
                → what must be true before an activity is allowed
              </li>
              <li>
                <span className="font-medium">Training elements</span> → what the
                instructor must cover and evaluate
              </li>
              <li>
                <span className="font-medium">Scope & limitations</span> → category/class,
                make/model, geographic limits, time windows, etc.
              </li>
              <li>
                <span className="font-medium">Recordkeeping</span> → instructor name,
                certificate number, expiration, date, and clear wording
              </li>
            </ul>
            <p>
              The most common endorsement issues are missing identifiers,
              ambiguous scope, outdated references, or using “one-size-fits-all”
              text that doesn’t match the actual training context.
            </p>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold">Common endorsement categories</h2>
          <p className="mt-3 text-gray-700">
            Here are typical areas where pilots and instructors need endorsement
            wording. (We’ll expand each into dedicated pages over time.)
          </p>

          <div className="mt-6 grid gap-4">
            <div className="rounded-2xl border border-gray-200 p-6">
              <h3 className="text-xl font-semibold">Student pilot endorsements</h3>
              <p className="mt-2 text-gray-700">
                Pre-solo training and authorizations (including recurring solo
                requirements), plus special solo scenarios where applicable.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 p-6">
              <h3 className="text-xl font-semibold">Knowledge test endorsements</h3>
              <p className="mt-2 text-gray-700">
                Instructor endorsements authorizing a pilot to take a knowledge
                test after ground training and review.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 p-6">
              <h3 className="text-xl font-semibold">Practical test endorsements</h3>
              <p className="mt-2 text-gray-700">
                Endorsements stating the applicant has received required
                training and is prepared for the checkride in the appropriate
                category/class.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 p-6">
              <h3 className="text-xl font-semibold">Reviews & currency</h3>
              <p className="mt-2 text-gray-700">
                Flight reviews, proficiency-related signoffs, and other
                recordkeeping that benefits from consistent language.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold">Typical pitfalls (and how to avoid them)</h2>
          <div className="mt-4 space-y-3 text-gray-700">
            <p>
              <span className="font-medium">Pitfall:</span> endorsement doesn’t
              match the aircraft category/class or the training scenario.
              <br />
              <span className="font-medium">Fix:</span> encode scope explicitly
              (category/class, make/model if needed, and the specific activity).
            </p>
            <p>
              <span className="font-medium">Pitfall:</span> missing instructor
              identifiers or an unreadable record.
              <br />
              <span className="font-medium">Fix:</span> consistent formatting,
              full instructor name, certificate number, and date.
            </p>
            <p>
              <span className="font-medium">Pitfall:</span> using outdated or
              copied text without verifying current requirements.
              <br />
              <span className="font-medium">Fix:</span> verify against current
              FAA references and keep templates maintained.
            </p>
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-gray-200 p-6">
          <h2 className="text-2xl font-semibold">Use the tool hub</h2>
          <p className="mt-3 text-gray-700">
            If you already know which endorsement you need, the Tool Hub can
            help generate consistent wording and reduce omissions.
          </p>
          <a
            href="https://tool.pilotseal.com"
            className="mt-5 inline-block px-5 py-3 rounded-xl bg-black text-white"
          >
            Go to Tool Hub →
          </a>
          <p className="mt-4 text-sm text-gray-600">
            Reminder: Always verify against official FAA regulations and
            guidance for your specific use case.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold">FAQ</h2>
          <div className="mt-4 space-y-4">
            {faqs.map((f) => (
              <div key={f.q} className="rounded-2xl border border-gray-200 p-6">
                <p className="font-semibold">{f.q}</p>
                <p className="mt-2 text-gray-700">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-12 border-t pt-8 text-sm text-gray-600">
          <a className="underline" href="/disclaimer">
            Read the disclaimer →
          </a>
        </div>
      </div>
    </main>
  );
}