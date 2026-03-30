import Link from 'next/link';
import CopyTemplateButton from '@/components/endorsements/CopyTemplateButton';

export const metadata = {
  title: 'Solo Class B Airspace Endorsement | FAA § 61.95(a) | PilotSeal',
  description: 'Solo flight in Class B airspace endorsement template. FAA § 61.95(a) wording for student pilot authorization to fly solo in Class B airspace.',
};

export default function SoloClassBPage() {
  const endorsementText = `I certify that [Student Name] [Student Cert Number] has received the required training of § 61.95(a). I have determined [Student Name] is proficient to conduct solo flights in [Name of Class B Airspace]. [List any applicable conditions or limitations.]

Date: [Date]
[Instructor Name] [Instructor Cert Number] Exp. [Instructor Cert Exp Date]`;

  return (
    <main className="page-shell page-endorsement px-3">
      <div className="site-shell page-stack space-y-8">
        {/* Hero Section */}
        <section className="hero-panel hero-endorsement overflow-hidden px-6 py-7 sm:px-8 sm:py-9">
          <div className="reading-rail">
            <p className="eyebrow">Solo Class B airspace endorsement</p>
            <h1 className="display-title mt-4 max-w-3xl text-3xl font-semibold leading-tight text-[var(--foreground)] sm:text-4xl">
              Solo Flight in Class B Airspace Endorsement
            </h1>
            <p className="copy-muted mt-3 max-w-2xl leading-7">
              This is the FAA required logbook endorsement under FAR § 61.95(a) that authorizes a student pilot to conduct solo flights within Class B airspace.
            </p>
          </div>
        </section>

        {/* Copyable Template Block */}
        <section className="template-section section-panel px-6 py-8 sm:px-8 sm:py-10">
          <div className="reading-rail max-w-2xl">
            <h2 className="section-title text-2xl font-semibold mb-6">
              FAA Solo Class B Airspace Endorsement
            </h2>

            <div className="template-wrapper mb-6 p-6 bg-[var(--surface-secondary)] rounded-lg border border-[var(--border)]">
              <pre className="template-text whitespace-pre-wrap break-words text-sm leading-relaxed font-mono text-[var(--foreground)]">
                {endorsementText}
              </pre>
            </div>

            <div className="action-group flex flex-col gap-3 sm:flex-row">
              <CopyTemplateButton text={endorsementText} className="primary-button flex-1 sm:flex-none" />
              <Link
                href="/tools/endorsement-generator?type=solo-class-b"
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
                This endorsement authorizes a student pilot to conduct solo flights within Class B airspace after completing special training on Class B operations. Name the specific Class B airspace (e.g., "Los Angeles Class B") and note any conditions or limitations.
              </p>
              <p className="copy-muted leading-7">
                Verify the student has received training on Class B operations, radar service requirements, communication procedures, and has demonstrated proficiency in the specific Class B area.
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
                <p className="font-semibold text-[var(--foreground)]">FAR § 61.95(a)</p>
                <p className="copy-muted text-sm mt-1">Solo flight in Class B airspace training and endorsement requirements.</p>
              </li>
              <li className="reference-item">
                <p className="font-semibold text-[var(--foreground)]">AC 61-65K</p>
                <p className="copy-muted text-sm mt-1">Advisory Circular with Class B operations endorsement guidance.</p>
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
                <Link href="/endorsements/solo-flight-initial" className="link-accent font-semibold hover:underline">
                  Solo Flight Endorsement →
                </Link>
              </li>
              <li>
                <Link href="/endorsements/solo-class-b-airport" className="link-accent font-semibold hover:underline">
                  Solo Class B Airport Endorsement →
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
              PilotSeal ensures the correct Class B airspace name, verifies § 61.95(a) compliance, and includes all required limitations.
            </p>
            <Link
              href="/tools/endorsement-generator?type=solo-class-b"
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
