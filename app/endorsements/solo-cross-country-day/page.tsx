import Link from 'next/link';
import CopyTemplateButton from '@/components/endorsements/CopyTemplateButton';

export const metadata = {
  title: 'Solo Cross-Country Day-of-Flight Endorsement | FAA § 61.93(b)(1) | PilotSeal',
  description: 'Solo cross-country day-of-flight endorsement template. CFI planning approval for each cross-country flight with route verification.',
};

export default function SoloCrossCountryDayPage() {
  const endorsementText = `I have reviewed the cross-country planning of [Student Name]. I find the planning and preparation to be correct to make the solo flight from [Departure Airport] to [Destination Airport] via [Route of Flight] with landings at [Airport Names] in a [Make & Model] on [Date].

Date: [Date]
[Instructor Name] [Instructor Cert Number] Exp. [Instructor Cert Exp Date]`;

  return (
    <main className="page-shell page-endorsement px-3">
      <div className="site-shell page-stack space-y-8">
        {/* Hero Section */}
        <section className="hero-panel hero-endorsement overflow-hidden px-6 py-7 sm:px-8 sm:py-9">
          <div className="reading-rail">
            <p className="eyebrow">Solo cross-country planning endorsement</p>
            <h1 className="display-title mt-4 max-w-3xl text-3xl font-semibold leading-tight text-[var(--foreground)] sm:text-4xl">
              Solo Cross-Country Day-of-Flight Endorsement
            </h1>
            <p className="copy-muted mt-3 max-w-2xl leading-7">
              This is the FAA required logbook endorsement under FAR § 61.93(b)(1) that CFIs use to approve each specific student cross-country flight before it departs.
            </p>
          </div>
        </section>

        {/* Copyable Template Block */}
        <section className="template-section section-panel px-6 py-8 sm:px-8 sm:py-10">
          <div className="reading-rail max-w-2xl">
            <h2 className="section-title text-2xl font-semibold mb-6">
              FAA Solo Cross-Country Day-of-Flight Endorsement
            </h2>

            <div className="template-wrapper mb-6 p-6 bg-[var(--surface-secondary)] rounded-lg border border-[var(--border)]">
              <pre className="template-text whitespace-pre-wrap break-words text-sm leading-relaxed font-mono text-[var(--foreground)]">
                {endorsementText}
              </pre>
            </div>

            <div className="action-group flex flex-col gap-3 sm:flex-row">
              <CopyTemplateButton text={endorsementText} className="primary-button flex-1 sm:flex-none" />
              <Link
                href="/tools/endorsement-generator?type=solo-cross-country-day"
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
                This endorsement documents the CFI's review and approval of the student's specific cross-country flight plan before each flight. It must be issued within 2 calendar months preceding the cross-country flight and placed in the student's logbook.
              </p>
              <p className="copy-muted leading-7">
                Record the departure airport, destination, all intermediate landing airports, the specific aircraft make and model, and the planned flight date. Review the student's flight planning for route, weather, fuel, and airspace compliance.
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
                <p className="font-semibold text-[var(--foreground)]">FAR § 61.93(b)(1)</p>
                <p className="copy-muted text-sm mt-1">Requires CFI review and approval of each solo cross-country flight plan.</p>
              </li>
              <li className="reference-item">
                <p className="font-semibold text-[var(--foreground)]">AC 61-65K</p>
                <p className="copy-muted text-sm mt-1">Advisory Circular with cross-country planning endorsement templates and CFI guidance.</p>
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
                <Link href="/endorsements/solo-cross-country" className="link-accent font-semibold hover:underline">
                  Solo Cross-Country Training Endorsement →
                </Link>
              </li>
              <li>
                <Link href="/endorsements/solo-flight-initial" className="link-accent font-semibold hover:underline">
                  Solo Flight Endorsement →
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
              PilotSeal captures flight plan details, verifies 2-calendar-month recency, and ensures all required identifiers are included.
            </p>
            <Link
              href="/tools/endorsement-generator?type=solo-cross-country-day"
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
