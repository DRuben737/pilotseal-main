import Link from 'next/link';
import CopyTemplateButton from '@/components/endorsements/CopyTemplateButton';

export const metadata = {
  title: 'Pre-Solo Flight Training Endorsement | FAA § 61.87 | PilotSeal',
  description: 'Pre-solo flight training endorsement template with FAA § 61.87 wording, ready to copy. Certify student proficiency before solo flight.',
};

export default function PreSoloFlightPage() {
  const endorsementText = `I certify that [Student Name] [Student Cert Number] has received and logged pre-solo flight training for the maneuvers and procedures that are appropriate to the [Make & Model]. I have determined [Student Name] has demonstrated satisfactory proficiency and safety on the maneuvers and procedures required by § 61.87 in this or similar make and model of aircraft to be flown.

Date: [Date]
[Instructor Name] [Instructor Cert Number] Exp. [Instructor Cert Exp Date]`;

  return (
    <main className="page-shell page-endorsement px-3">
      <div className="site-shell page-stack space-y-8">
        {/* Hero Section */}
        <section className="hero-panel hero-endorsement overflow-hidden px-6 py-7 sm:px-8 sm:py-9">
          <div className="reading-rail">
            <p className="eyebrow">Pre-solo flight training endorsement</p>
            <h1 className="display-title mt-4 max-w-3xl text-3xl font-semibold leading-tight text-[var(--foreground)] sm:text-4xl">
              Pre-Solo Flight Training Endorsement
            </h1>
            <p className="copy-muted mt-3 max-w-2xl leading-7">
              This is the FAA required logbook endorsement under FAR § 61.87 certifying the student pilot has completed pre-solo flight maneuvers and is proficient for solo flight.
            </p>
          </div>
        </section>

        {/* Copyable Template Block */}
        <section className="template-section section-panel px-6 py-8 sm:px-8 sm:py-10">
          <div className="reading-rail max-w-2xl">
            <h2 className="section-title text-2xl font-semibold mb-6">
              FAA Pre-Solo Flight Training Endorsement
            </h2>

            <div className="template-wrapper mb-6 p-6 bg-[var(--surface-secondary)] rounded-lg border border-[var(--border)]">
              <pre className="template-text whitespace-pre-wrap break-words text-sm leading-relaxed font-mono text-[var(--foreground)]">
                {endorsementText}
              </pre>
            </div>

            <div className="action-group flex flex-col gap-3 sm:flex-row">
              <CopyTemplateButton text={endorsementText} className="primary-button flex-1 sm:flex-none" />
              <Link
                href="/tools/endorsement-generator?type=pre-solo-flight"
                className="secondary-button flex-1 sm:flex-none text-center"
              >
                Generate with PilotSeal →
              </Link>
            </div>
          </div>
        </section>

        {/* Explanation */}
        <section className="content-section section-panel px-6 py-8 sm:px-8 sm:py-10">
          <div className="reading-rail max-w-2xl">
            <h2 className="section-title text-2xl font-semibold mb-4">When You Need This Endorsement</h2>
            <div className="space-y-4">
              <p className="copy-muted leading-7">
                The pre-solo flight training endorsement documents that the student has completed all required flight maneuvers and procedures and has demonstrated the proficiency necessary for solo flight. This endorsement must be issued by a flight instructor and placed in the student's logbook.
              </p>
              <p className="copy-muted leading-7">
                Include the specific aircraft make and model and verify the student has completed training in this or a similar aircraft. This is a mandatory prerequisite before the student pilot solo endorsement.
              </p>
            </div>
          </div>
        </section>

        {/* FAA Reference */}
        <section className="reference-section section-panel px-6 py-8 sm:px-8 sm:py-10">
          <div className="reading-rail max-w-2xl">
            <h2 className="section-title text-2xl font-semibold mb-6">FAA Reference</h2>
            <ul className="space-y-4">
              <li className="reference-item">
                <p className="font-semibold text-[var(--foreground)]">FAR § 61.87(b)</p>
                <p className="copy-muted text-sm mt-1">Pre-solo flight training requirements and endorsement criteria.</p>
              </li>
              <li className="reference-item">
                <p className="font-semibold text-[var(--foreground)]">FAR § 61.87(c)</p>
                <p className="copy-muted text-sm mt-1">Specific maneuvers and procedures required before solo flight.</p>
              </li>
              <li className="reference-item">
                <p className="font-semibold text-[var(--foreground)]">AC 61-65K</p>
                <p className="copy-muted text-sm mt-1">Advisory Circular with FAA endorsement templates and guidance.</p>
              </li>
            </ul>
          </div>
        </section>

        {/* Related Endorsements */}
        <section className="related-section section-panel px-6 py-8 sm:px-8 sm:py-10">
          <div className="reading-rail max-w-2xl">
            <h2 className="section-title text-2xl font-semibold mb-6">Related Endorsements</h2>
            <ul className="space-y-3">
              <li>
                <Link href="/endorsements/pre-solo-knowledge" className="link-accent font-semibold hover:underline">
                  Pre-Solo Knowledge Test Endorsement →
                </Link>
              </li>
              <li>
                <Link href="/endorsements/student-solo" className="link-accent font-semibold hover:underline">
                  Student Solo Endorsement →
                </Link>
              </li>
              <li>
                <Link href="/tools/endorsement-generator" className="link-accent font-semibold hover:underline">
                  Full Endorsement Generator →
                </Link>
              </li>
            </ul>
          </div>
        </section>

        {/* Final CTA */}
        <section className="cta-section section-panel px-6 py-8 sm:px-8 sm:py-10 bg-[var(--surface-accent-soft)]">
          <div className="reading-rail max-w-2xl text-center">
            <h2 className="section-title text-2xl font-semibold mb-3">
              Generate This Endorsement Instantly
            </h2>
            <p className="copy-muted mb-6 leading-7">
              PilotSeal auto-fills student info, verifies FAA wording, and ensures the correct aircraft scope every time.
            </p>
            <Link
              href="/tools/endorsement-generator?type=pre-solo-flight"
              className="primary-button inline-block"
            >
              Open Endorsement Generator →
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
