import Link from 'next/link';
import CopyTemplateButton from '@/components/endorsements/CopyTemplateButton';

export const metadata = {
  title: 'Pre-Solo Knowledge Test Endorsement | FAA § 61.87(b) | PilotSeal',
  description: 'Pre-solo knowledge test endorsement template with FAA § 61.87(b) wording, copy button, and CFI guidance. Ready to use.',
};

export default function PreSoloKnowledgePage() {
  const endorsementText = `I certify that [Student Name] [Student Cert Number] has satisfactorily completed the pre-solo knowledge test of § 61.87(b) for the [Make & Model].

Date: [Date]
[Instructor Name] [Instructor Cert Number] Exp. [Instructor Cert Exp Date]`;

  return (
    <main className="page-shell page-endorsement px-3">
      <div className="site-shell page-stack space-y-8">
        {/* Hero Section */}
        <section className="hero-panel hero-endorsement overflow-hidden px-6 py-7 sm:px-8 sm:py-9">
          <div className="reading-rail">
            <p className="eyebrow">Pre-solo knowledge test endorsement</p>
            <h1 className="display-title mt-4 max-w-3xl text-3xl font-semibold leading-tight text-[var(--foreground)] sm:text-4xl">
              Pre-Solo Knowledge Test Endorsement
            </h1>
            <p className="copy-muted mt-3 max-w-2xl leading-7">
              This is the FAA required logbook endorsement under FAR § 61.87(b) certifying the student pilot has passed the pre-solo knowledge test.
            </p>
          </div>
        </section>

        {/* Copyable Template Block */}
        <section className="template-section section-panel px-6 py-8 sm:px-8 sm:py-10">
          <div className="reading-rail max-w-2xl">
            <h2 className="section-title text-2xl font-semibold mb-6">
              FAA Pre-Solo Knowledge Test Endorsement
            </h2>

            <div className="template-wrapper mb-6 p-6 bg-[var(--surface-secondary)] rounded-lg border border-[var(--border)]">
              <pre className="template-text whitespace-pre-wrap break-words text-sm leading-relaxed font-mono text-[var(--foreground)]">
                {endorsementText}
              </pre>
            </div>

            <div className="action-group flex flex-col gap-3 sm:flex-row">
              <CopyTemplateButton text={endorsementText} className="primary-button flex-1 sm:flex-none" />
              <Link
                href="/tools/endorsement-generator?type=pre-solo-knowledge"
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
                The pre-solo knowledge test endorsement certifies that the student pilot has satisfactorily completed the required knowledge test for solo flight in the specific aircraft make and model. This is a mandatory gate before solo flight authorization under FAR § 61.87(b).
              </p>
              <p className="copy-muted leading-7">
                The endorsement must be issued by a flight instructor and placed in the student's logbook before solo flight is authorized. Verify the student passed the knowledge test and record the specific aircraft make/model for which the test was completed.
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
                <p className="copy-muted text-sm mt-1">Pre-solo knowledge test requirement and endorsement criteria.</p>
              </li>
              <li className="reference-item">
                <p className="font-semibold text-[var(--foreground)]">AC 61-65K</p>
                <p className="copy-muted text-sm mt-1">Advisory Circular with FAA-endorsed pre-solo endorsement templates and guidance.</p>
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
                <Link href="/endorsements/pre-solo-flight" className="link-accent font-semibold hover:underline">
                  Pre-Solo Flight Training Endorsement →
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
              PilotSeal auto-fills student info, verifies FAA wording, and ensures the correct CFR reference every time.
            </p>
            <Link
              href="/tools/endorsement-generator?type=pre-solo-knowledge"
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
