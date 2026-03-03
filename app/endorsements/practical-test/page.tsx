import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Practical Test Endorsements Guide | PilotSeal",
  description:
    "A practical guide to checkride/practical test endorsements for CFIs and applicants, covering scope, consistency, and common pitfalls. Always verify against current FAA requirements.",
};

const checklist = [
  "Confirm the certificate/rating sought and the practical test context (initial vs. add-on, etc.).",
  "Ensure training records support the endorsement statement being made.",
  "Make scope explicit (category/class; rating/certificate) and avoid ambiguous language.",
  "Include instructor identifiers consistently (name, certificate number, date).",
  "Verify currency/applicability against current FAA references before signing.",
];

const pitfalls = [
  {
    title: "Overly generic endorsement",
    desc:
      "Wording is too vague to clearly tie training and readiness to the certificate/rating being tested.",
  },
  {
    title: "Mismatch between training and endorsement",
    desc:
      "The endorsement implies completion/readiness that isn’t supported by the training record or scenario.",
  },
  {
    title: "Scope confusion (category/class / rating)",
    desc:
      "Missing or unclear scope details can create confusion during scheduling or with the examiner later.",
  },
  {
    title: "Inconsistent identifiers / formatting",
    desc:
      "Incomplete instructor info or inconsistent formatting makes verification harder and increases friction.",
  },
];

const faqs = [
  {
    q: "Is this page a substitute for FAA regs, ACS, or examiner guidance?",
    a: "No. This is educational only. Always verify requirements, references, and applicability for your checkride scenario.",
  },
  {
    q: "What makes a practical-test endorsement ‘good’?",
    a: "It is explicit about what certificate/rating is being endorsed, consistent in recordkeeping, and matches the actual training and readiness being attested to.",
  },
  {
    q: "Can I use PilotSeal’s generated text as-is?",
    a: "Use it as a draft. Confirm scope and applicability, and ensure it matches the training record and your scenario before signing.",
  },
];

export default function PracticalTestPage() {
  return (
    <main className="min-h-screen bg-white text-black px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p className="text-sm text-gray-500">
              <a className="underline" href="/endorsements">Endorsements</a> / Practical Test
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">
              Practical Test (Checkride) Endorsements
            </h1>
            <p className="mt-4 text-lg text-gray-700">
              A practical guide for writing explicit, verifiable checkride
              endorsements that match your training records. Educational only—always
              verify against current FAA requirements.
            </p>
          </div>

          <a
            href="https://tool.pilotseal.com/endorsement-generator"
            className="px-5 py-3 rounded-xl bg-black text-white whitespace-nowrap"
          >
            Open Endorsement Generator →
          </a>
        </div>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold">What this covers</h2>
          <p className="mt-3 text-gray-700">
            Practical-test endorsements are high-stakes because they are often
            reviewed by examiners and must align with the applicant’s certificate/rating
            goal and training record.
          </p>
          <p className="mt-3 text-gray-700">
            This page focuses on endorsement clarity, scope, and recordkeeping consistency
            so the checkride authorization is easy to validate.
          </p>
        </section>

        <section className="mt-12 rounded-2xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold">Quick checklist</h2>
          <ul className="mt-4 list-disc pl-6 space-y-2 text-gray-700">
            {checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="mt-5">
            <a
              href="https://tool.pilotseal.com/endorsement-generator"
              className="text-sm font-medium underline"
            >
              Generate endorsement wording →
            </a>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold">How to structure the wording</h2>
          <div className="mt-4 space-y-4 text-gray-700">
            <p>
              A practical-test endorsement is essentially a statement that:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                required training has been provided and reviewed,
              </li>
              <li>
                the applicant is prepared for the practical test,
              </li>
              <li>
                and the endorsement scope matches the certificate/rating and category/class context.
              </li>
            </ul>
            <p>
              Avoid “one-size-fits-all” phrasing. The more clearly the endorsement matches
              the scenario, the less friction you’ll see with examiners and scheduling.
            </p>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold">Common pitfalls</h2>
          <div className="mt-6 grid gap-4">
            {pitfalls.map((p) => (
              <div key={p.title} className="rounded-2xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold">{p.title}</h3>
                <p className="mt-2 text-gray-700">{p.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold">Use the generator</h2>
          <p className="mt-3 text-gray-700">
            If you’re preparing an applicant for a checkride, use the generator to create
            a consistent draft, then verify scope and applicability before signing.
          </p>
          <a
            href="https://tool.pilotseal.com/endorsement-generator"
            className="mt-5 inline-block px-5 py-3 rounded-xl bg-black text-white"
          >
            Open Endorsement Generator →
          </a>
          <p className="mt-4 text-sm text-gray-600">
            Reminder: PilotSeal does not replace official FAA references.{" "}
            <a className="underline" href="/disclaimer">
              Read the disclaimer
            </a>
            .
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
        
        <section className="mt-12">
        <h2 className="text-2xl font-semibold">Related guides</h2>
        <div className="mt-4 grid gap-4">
            <div className="rounded-2xl border border-gray-200 p-6">
            <div className="flex items-start justify-between gap-6">
                <div>
                <h3 className="text-lg font-semibold">Student Solo Endorsements</h3>
                <p className="mt-2 text-gray-700">
                    Clarity, aircraft scope, and recordkeeping consistency for student solo authorizations.
                </p>
                </div>
                <a className="text-sm font-medium underline whitespace-nowrap" href="/endorsements/student-solo">
                Read →
                </a>
            </div>
            </div>

            <div className="rounded-2xl border border-gray-200 p-6">
            <div className="flex items-start justify-between gap-6">
                <div>
                <h3 className="text-lg font-semibold">Knowledge Test Endorsements</h3>
                <p className="mt-2 text-gray-700">
                    Structure and scope knowledge-test authorizations clearly and consistently.
                </p>
                </div>
                <a className="text-sm font-medium underline whitespace-nowrap" href="/endorsements/knowledge-test">
                Read →
                </a>
            </div>
            </div>

            <div className="rounded-2xl border border-gray-200 p-6">
            <div className="flex items-start justify-between gap-6">
                <div>
                <h3 className="text-lg font-semibold">Practical Test (Checkride) Endorsements</h3>
                <p className="mt-2 text-gray-700">
                    Explicit, verifiable checkride endorsements aligned with training records and scope.
                </p>
                </div>
                <a className="text-sm font-medium underline whitespace-nowrap" href="/endorsements/practical-test">
                Read →
                </a>
            </div>
            </div>
        </div>
        </section>

        <div className="mt-12 border-t pt-8 text-sm text-gray-600">
          <a className="underline" href="/endorsements">
            ← Back to Endorsements
          </a>
        </div>
      </div>
    </main>
  );
}