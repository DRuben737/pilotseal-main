import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About PilotSeal",
  description:
    "Learn why PilotSeal was built and how it supports CFIs and student pilots with FAA-oriented tools.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white text-black px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold tracking-tight">About PilotSeal</h1>

        <section className="mt-8">
          <h2 className="text-2xl font-semibold">Why this exists</h2>
          <p className="mt-3 text-gray-700">
            PilotSeal was created to make common FAA training workflows clearer
            and more consistent — especially around logbook endorsements,
            instructional briefings, and training documentation.
          </p>
          <p className="mt-3 text-gray-700">
            In many training environments, instructors and students rely on
            copied templates, informal notes, or inconsistent formatting.
            PilotSeal aims to reduce friction and improve clarity while
            keeping compliance awareness front and center.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold">Who it’s for</h2>
          <ul className="mt-4 list-disc pl-6 space-y-2 text-gray-700">
            <li>Certified Flight Instructors (CFIs)</li>
            <li>Student pilots in structured training</li>
            <li>Pilots preparing for knowledge or practical tests</li>
            <li>Training environments that value documentation consistency</li>
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold">What PilotSeal is not</h2>
          <p className="mt-3 text-gray-700">
            PilotSeal does not replace FAA regulations, legal interpretation,
            or instructor judgment. All tools are provided for educational
            support and workflow assistance only.
          </p>
          <p className="mt-3 text-gray-700">
            Instructors remain responsible for verifying applicability,
            aircraft category/class, and current regulatory requirements.
          </p>
        </section>

        <section className="mt-12 rounded-2xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold">Contact</h2>
          <p className="mt-3 text-gray-700">
            For feedback, questions, or collaboration inquiries:
          </p>
          <p className="mt-3 font-medium">
            admin@pilotseal.com
          </p>
        </section>
      </div>
    </main>
  );
}