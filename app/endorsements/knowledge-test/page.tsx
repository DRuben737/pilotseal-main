import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Knowledge Test Endorsements Guide | PilotSeal",
  description:
    "A practical guide to FAA knowledge test endorsements for CFIs and student pilots, including scope, recordkeeping, and common pitfalls. Always verify against current FAA requirements.",
};

const checklist = [
  "Confirm the certificate/rating sought and the specific knowledge test.",
  "Verify required ground training/review has actually been completed for the test scope.",
  "Make the endorsement scope explicit (certificate/rating + test type).",
  "Include instructor identifiers (name, certificate number, date) consistently.",
  "Avoid reusing old templates without verifying current regulatory applicability.",
];

const pitfalls = [
  {
    title: "Wrong test or wrong scope",
    desc:
      "Endorsement wording doesn’t clearly match the certificate/rating or test the applicant intends to take.",
  },
  {
    title: "Assuming “ground done” without documentation",
    desc:
      "A signoff implies a review/coverage occurred. Make sure training records support what is being endorsed.",
  },
  {
    title: "Template drift over time",
    desc:
      "Old phrasing gets copied forward without confirming it still aligns with current expectations or your scenario.",
  },
  {
    title: "Missing instructor identifiers",
    desc:
      "Incomplete instructor info makes records harder to validate and can cause avoidable friction later.",
  },
];

const faqs = [
  {
    q: "Does PilotSeal replace FAA regulations or guidance for knowledge tests?",
    a: "No. This page is educational. Always verify current requirements, references, and applicability for your specific scenario.",
  },
  {
    q: "What’s the main goal of a knowledge-test endorsement?",
    a: "Clarity: the endorsement should make it obvious what test is authorized and why the instructor is signing (training/review completed).",
  },
  {
    q: "Can I use the Endorsement Generator output directly?",
    a: "Use it as a structured draft. Confirm scope, identifiers, and that it reflects the actual training/review performed before signing.",
  },
];

export default function KnowledgeTestPage() {
  return (
    <main className="min-h-screen bg-white text-black px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p className="text-sm text-gray-500">
              Endorsements / Knowledge Test
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">
              Knowledge Test Endorsements
            </h1>
            <p className="mt-4 text-lg text-gray-700">
              A practical guide focused on clear scope, verifiable recordkeeping,
              and reducing template mistakes. Educational only—always verify against
              current FAA requirements.
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
            Knowledge test endorsements are common across multiple certificates
            and ratings. Most issues come from vague scope (“the test”) or using
            generic text that doesn’t clearly match the applicant’s goal.
          </p>
          <p className="mt-3 text-gray-700">
            This page focuses on how to write endorsements that are explicit,
            consistent, and easier to validate later.
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
              Think of a knowledge-test endorsement as a statement of{" "}
              <span className="font-medium">authorization</span> plus{" "}
              <span className="font-medium">scope</span>:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <span className="font-medium">Authorization statement:</span>{" "}
                the applicant is authorized to take a specific knowledge test.
              </li>
              <li>
                <span className="font-medium">Scope:</span>{" "}
                certificate/rating sought, the test type, and any relevant context.
              </li>
              <li>
                <span className="font-medium">Recordkeeping:</span>{" "}
                date and instructor identifiers in a consistent format.
              </li>
            </ul>
            <p>
              The best endorsements make it hard to misunderstand what test is
              authorized and why the instructor is signing.
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
            If you already know which knowledge test applies, use the generator
            for a consistent draft, then verify scope and applicability before signing.
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

        <div className="mt-12 border-t pt-8 text-sm text-gray-600">
          <a className="underline" href="/endorsements">
            ← Back to Endorsements
          </a>
        </div>
      </div>
    </main>
  );
}