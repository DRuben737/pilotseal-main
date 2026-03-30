import Link from 'next/link';
import CopyTemplateButton from '@/components/endorsements/CopyTemplateButton';

export const metadata = {
  title: 'Solo Flight Endorsement | 90-Day Currency | FAA § 61.87(n) | PilotSeal',
  description: 'Student pilot solo endorsement template (initial 90 days). FAA § 61.87(n) wording, copy-ready. Authorize solo flight for qualified students.',
};

export default function SoloFlightInitialPage() {
  const endorsementText = `I certify that [Student Name] [Student Cert Number] has received the required training to qualify for solo flying. I have determined [Student Name] meets the applicable requirements of § 61.87(n) and is proficient to make solo flights in [Make & Model].

Date: [Date]
[Instructor Name] [Instructor Cert Number] Exp. [Instructor Cert Exp Date]`;

  return (
    <main className="page-shell page-endorsement px-3">
      <div className="site-shell page-stack space-y-8">
        {/* Hero Section */}
        <section className="hero-panel hero-endorsement overflow-hidden px-6 py-7 sm:px-8 sm:py-9">
          <div className="reading-rail">
            <p className="eyebrow">Student pilot solo endorsement</p>
            <h1 className="display-title mt-4 max-w-3xl text-3xl font-semibold leading-tight text-[var(--foreground)] sm:text-4xl">
              Solo Flight Endorsement (Initial 90 Days)
            </h1>
            <p className="copy-muted mt-3 max-w-2xl leading-7">
              This is the FAA required logbook endorsement under FAR § 61.87(n) that authorizes a student pilot to conduct solo flight. Valid for 90 calendar days.
            </p>
          </div>
        </section>

        {/* Copyable Template Block */}
        <section className="template-section section-panel px-6 py-8 sm:px-8 sm:py-10">
          <div className="reading-rail max-w-2xl">
            <h2 className="section-title text-2xl font-semibold mb-6">
              FAA Student Pilot Solo Endorsement
            </h2>

            <div className="template-wrapper mb-6 p-6 bg-[var(--surface-secondary)] rounded-lg border border-[var(--border)]">
              <pre className="template-text whitespace-pre-wrap break-words text-sm leading-relaxed font-mono text-[var(--foreground)]">
                {endorsementText}
              </pre>
            </div>

            <div className="action-group flex flex-col gap-3 sm:flex-row">
              <CopyTemplateButton text={endorsementText} className="primary-button flex-1 sm:flex-none" />
              <Link
                href="/tools/endorsement-generator?type=solo-initial"
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
                The solo flight endorsement authorizes the student pilot to conduct solo flying in the aircraft make and model specified. This endorsement is valid for 90 calendar days from the date issued. After 90 days, a new endorsement under § 61.87(p) is required.
              </p>
              <p className="copy-muted leading-7">
                Verify all prerequisite training is complete: pre-solo knowledge test, pre-solo flight maneuvers, and any special operations (night, Class B, etc.) the student plans to conduct solo.
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
                <p className="font-semibold text-[var(--foreground)]">FAR § 61.87(n)</p>
                <p className="copy-muted text-sm mt-1">Initial solo flight endorsement requirement (first 90 calendar days).</p>
              </li>
              <li className="reference-item">
                <p className="font-semibold text-[var(--foreground)]">FAR § 61.87(p)</p>
                <p className="copy-muted text-sm mt-1">Additional 90-day solo endorsement for continued solo flight beyond the initial period.</p>
              </li>
              <li className="reference-item">
                <p className="font-semibold text-[var(--foreground)]">AC 61-65K</p>
                <p className="copy-muted text-sm mt-1">Advisory Circular with solo endorsement templates and CFI guidance.</p>
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
                <Link href="/endorsements/pre-solo-flight" className="link-accent font-semibold hover:underline">
                  Pre-Solo Flight Training Endorsement →
                </Link>
              </li>
              <li>
                <Link href="/endorsements/solo-cross-country" className="link-accent font-semibold hover:underline">
                  Solo Cross-Country Endorsement →
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
              PilotSeal auto-fills student data, verifies the endorsement is current per § 61.87(n), and includes all required CFI identifiers.
            </p>
            <Link
              href="/tools/endorsement-generator?type=solo-initial"
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
