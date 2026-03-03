import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Student Solo Endorsements Guide | PilotSeal",
  description:
    "A practical guide to student solo endorsements for CFIs and student pilots, including scope, common pitfalls, and workflow tips. Always verify against current FAA requirements.",
};

const checklist = [
  "Confirm the training scenario (initial solo vs. repeated solo vs. special conditions).",
  "Make scope explicit (aircraft category/class; make/model or limitations if applicable).",
  "Include instructor identifiers (name, certificate number, date) in a consistent format.",
  "Avoid copy/paste wording that doesn’t match the actual training record.",
  "Re-verify currency and applicability against current FAA references before signing.",
];

const pitfalls = [
  {
    title: "Ambiguous scope",
    desc:
      "The wording doesn’t clearly tie to the aircraft category/class or the specific solo authorization context.",
  },
  {
    title: "Missing identifiers",
    desc:
      "Instructor certificate number, date, or other required identifiers are missing or inconsistent across records.",
  },
  {
    title: "Template drift",
    desc:
      "A copied template becomes outdated over time or diverges from the actual scenario being endorsed.",
  },
  {
    title: "Assuming one endorsement covers everything",
    desc:
      "Different solo contexts may require different elements. Don’t assume a single generic text always applies.",
  },
];

const faqs = [
  {
    q: "Is this page a substitute for FAR/AIM or FAA guidance?",
    a: "No. This guide is educational. Always verify requirements and wording against current FAA regulations and guidance for your specific scenario.",
  },
  {
    q: "Can I use PilotSeal’s tool output as-is?",
    a: "Use it as a structured starting point. You should confirm the scope, limitations, identifiers, and regulatory applicability before signing or recording.",
  },
  {
    q: "Why is solo endorsement wording so sensitive?",
    a: "Because it authorizes a specific activity and must align with the training provided and the context. Clarity reduces compliance risk and confusion later.",
  },
];

export default function StudentSoloPage() {
  return (
    <main className="min-h-screen bg-white text-black px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p className="text-sm text-gray-500">
              <a className="underline" href="/endorsements">Endorsements</a> / Student Solo
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">
              Student Solo Endorsements
            </h1>
            <p className="mt-4 text-lg text-gray-700">
              A practical guide for CFIs and student pilots focused on clarity,
              scope, and recordkeeping consistency. This is educational—always
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

        {/* Overview */}
        <section className="mt-12">
          <h2 className="text-2xl font-semibold">What this covers</h2>
          <p className="mt-3 text-gray-700">
            Student solo endorsements are among the most common—and most
            frequently templated—logbook entries in training. The goal is not
            fancy wording; it’s precise authorization that matches the training
            provided and the exact solo context.
          </p>
          <p className="mt-3 text-gray-700">
            This page focuses on how to think about solo endorsement wording,
            how to avoid common mistakes, and how to keep your recordkeeping
            consistent.
          </p>
        </section>

        {/* Quick checklist */}
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

        {/* Structure guidance */}
        <section className="mt-12">
          <h2 className="text-2xl font-semibold">How to structure the wording</h2>
          <div className="mt-4 space-y-4 text-gray-700">
            <p>
              Think in terms of <span className="font-medium">authorization</span>{" "}
              and <span className="font-medium">scope</span>:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <span className="font-medium">Authorization statement:</span>{" "}
                clearly states the student is authorized for solo flight under
                the relevant training context.
              </li>
              <li>
                <span className="font-medium">Aircraft scope:</span> category/class,
                and any make/model limitations if your context requires it.
              </li>
              <li>
                <span className="font-medium">Recordkeeping:</span> date and instructor
                identifiers in a consistent format.
              </li>
            </ul>
            <p>
              Consistency matters. A clean, repeatable format reduces errors and
              makes audits/reviews far less painful.
            </p>
          </div>
        </section>

        {/* Pitfalls */}
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

        {/* CTA */}
        <section className="mt-12 rounded-2xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold">Use the generator</h2>
          <p className="mt-3 text-gray-700">
            If you already know the solo scenario you’re working with, use the
            Endorsement Generator to create a consistent draft, then verify
            scope and applicability before signing.
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

        {/* FAQ */}
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