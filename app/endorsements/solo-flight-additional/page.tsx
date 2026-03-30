import Link from 'next/link';
import CopyTemplateButton from '@/components/endorsements/CopyTemplateButton';
import {
  buildArticleSchema,
  buildBreadcrumbSchema,
  buildFaqSchema,
  buildPageMetadata,
} from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Additional 90-Day Solo Endorsement | FAA § 61.87(p)',
  description:
    'Additional 90-day solo flight endorsement template. FAA § 61.87(p) wording. Extend solo authorization beyond the initial solo endorsement.',
  path: '/endorsements/solo-flight-additional',
  type: 'article',
  keywords: [
    'additional 90-day solo endorsement',
    '61.87(p)',
    'student solo endorsement',
    'FAA endorsement template',
    'AC 61-65',
  ],
});

export default function SoloFlightAdditionalPage() {
  const endorsementText = `I certify that [Student Name] [Student Cert Number] has received the required training to qualify for solo flying. I have determined that [Student Name] meets the applicable requirements of § 61.87(p) and is proficient to make solo flights in [Make & Model].

Date: [Date]
[Instructor Name] [Instructor Cert Number] Exp. [Instructor Cert Exp Date]`;

  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Endorsements', path: '/endorsements' },
    { name: 'Additional 90-Day Solo Endorsement', path: '/endorsements/solo-flight-additional' },
  ]);
  const articleSchema = buildArticleSchema({
    title: 'Additional 90-Day Solo Flight Endorsement',
    description:
      'FAA § 61.87(p) additional 90-day solo endorsement template with guidance on when the endorsement is needed and how to use it in a student solo workflow.',
    path: '/endorsements/solo-flight-additional',
  });
  const faqSchema = buildFaqSchema([
    {
      q: 'When is the additional 90-day solo endorsement required?',
      a: 'Use it when a student pilot needs continued solo authorization after the initial 90-day solo endorsement period has expired or is about to expire.',
    },
    {
      q: 'Does this endorsement replace the initial solo endorsement?',
      a: 'No. It extends solo authorization for another 90 calendar days after the original solo endorsement period, assuming the instructor has re-evaluated proficiency.',
    },
  ]);

  return (
    <main className="page-shell page-endorsement px-3">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <div className="site-shell page-stack space-y-8">
        {/* Hero Section */}
        <section className="hero-panel hero-endorsement overflow-hidden px-6 py-7 sm:px-8 sm:py-9">
          <div className="reading-rail">
            <p className="eyebrow">Additional 90-day solo endorsement</p>
            <h1 className="display-title mt-4 max-w-3xl text-3xl font-semibold leading-tight text-[var(--foreground)] sm:text-4xl">
              Additional 90-Day Solo Flight Endorsement
            </h1>
            <p className="copy-muted mt-3 max-w-2xl leading-7">
              This is the FAA required logbook endorsement under FAR § 61.87(p) that extends solo authorization for an additional 90 calendar days after the initial solo endorsement expires.
            </p>
          </div>
        </section>

        {/* Copyable Template Block */}
        <section className="template-section section-panel px-6 py-8 sm:px-8 sm:py-10">
          <div className="reading-rail max-w-2xl">
            <h2 className="section-title text-2xl font-semibold mb-6">
              FAA Additional 90-Day Solo Endorsement
            </h2>

            <div className="template-wrapper mb-6 p-6 bg-[var(--surface-secondary)] rounded-lg border border-[var(--border)]">
              <pre className="template-text whitespace-pre-wrap break-words text-sm leading-relaxed font-mono text-[var(--foreground)]">
                {endorsementText}
              </pre>
            </div>

            <div className="action-group flex flex-col gap-3 sm:flex-row">
              <CopyTemplateButton text={endorsementText} className="primary-button flex-1 sm:flex-none" />
              <Link
                href="/tools/endorsement-generator?type=solo-additional"
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
                The additional 90-day solo endorsement extends solo flying authorization when the student's initial § 61.87(n) endorsement approaches expiration. This endorsement renews authorization for another 90 calendar days.
              </p>
              <p className="copy-muted leading-7">
                Verify the student has maintained currency, completed any required flight reviews, and demonstrated continued proficiency before issuing the additional endorsement.
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
                <p className="font-semibold text-[var(--foreground)]">FAR § 61.87(p)</p>
                <p className="copy-muted text-sm mt-1">Additional 90-day solo flight endorsement requirement and extension criteria.</p>
              </li>
              <li className="reference-item">
                <p className="font-semibold text-[var(--foreground)]">FAR § 61.87(n)</p>
                <p className="copy-muted text-sm mt-1">Initial 90-day solo endorsement reference for context and progression.</p>
              </li>
              <li className="reference-item">
                <p className="font-semibold text-[var(--foreground)]">AC 61-65K</p>
                <p className="copy-muted text-sm mt-1">Advisory Circular with solo renewal endorsement templates.</p>
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
                  Solo Flight Endorsement (Initial 90 Days) →
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
              PilotSeal ensures the correct § 61.87(p) wording, verifies expiration dates, and maintains endorsement history.
            </p>
            <Link
              href="/tools/endorsement-generator?type=solo-additional"
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
