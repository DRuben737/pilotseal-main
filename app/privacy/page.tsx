import type { Metadata } from "next";
import Link from "next/link";
import AdaptiveImageSlot from "@/components/ui/AdaptiveImageSlot";

export const metadata: Metadata = {
  title: "Privacy | PilotSeal",
  description:
    "Privacy policy for PilotSeal and its pilot training tools.",
};

export default function PrivacyPage() {
  const privacyImages = {
    hero: "/privacy-hero.png",
    details: "/privacy-details.png",
  };

  return (
    <main className="page-shell page-policy px-3">
      <div className="site-shell page-stack space-y-8">
        <section className="hero-panel hero-about overflow-hidden px-6 py-10 sm:px-10 sm:py-14">
          <div className="reading-rail">
            <div className="max-w-3xl">
              <p className="eyebrow">Privacy</p>
              <h1 className="display-title mt-4 text-3xl font-semibold leading-[0.95] text-[var(--foreground)] sm:text-4xl">
                Privacy policy for PilotSeal and the tool suite
              </h1>
              <p className="copy-muted mt-4 leading-7">
                Last updated March 10, 2026. This policy covers PilotSeal and the
                tools available on this site.
              </p>
            </div>
            <div className="content-card overflow-hidden p-3 sm:p-4">
              <AdaptiveImageSlot
                src={privacyImages.hero}
                alt="Privacy hero image placeholder"
                label="privacy-hero.png"
              />
            </div>
          </div>
        </section>

        <section className="section-panel-about px-6 py-8 sm:px-8">
          <h2 className="section-title text-3xl font-semibold">Overview</h2>
          <p className="copy-muted mt-4 leading-8">
            PilotSeal is a browser-based set of aviation tools and supporting
            information pages for CFIs and student pilots. This page explains
            what information may be collected, how it is used, and what choices
            users have.
          </p>
        </section>

        <section className="masonry-grid">
          <section className="section-panel-about px-6 py-8 sm:px-8">
            <h2 className="section-title text-3xl font-semibold">
              Information we may collect
            </h2>
            <p className="copy-muted mt-4 leading-8">
              We may collect aggregated analytics data such as pages viewed,
              approximate location derived from IP address, device and browser
              information, referring pages, and general usage patterns. This is
              used to understand how the site performs and where users are
              struggling.
            </p>
            <p className="copy-muted mt-4 leading-8">
              Information entered into tools, such as endorsement details,
              briefing notes, or weight and balance values, is used to generate
              outputs for the workflow. Unless a tool explicitly says
              otherwise, PilotSeal does not require account creation.
            </p>
            <p className="copy-muted mt-4 leading-8">
              Do not enter sensitive personal information unless it is strictly
              necessary for your workflow.
            </p>
          </section>

          <section className="content-card p-6">
            <h2 className="section-title text-2xl font-semibold">
              How information is used
            </h2>
            <ul className="mt-5 list-disc space-y-3 pl-6 text-[var(--muted)]">
              <li>Operate and maintain the site and embedded tools</li>
              <li>Improve usability, performance, and reliability</li>
              <li>Understand which tools are useful and where users struggle</li>
              <li>Monitor abuse and help keep the service secure</li>
            </ul>
            <AdaptiveImageSlot
              src={privacyImages.details}
              alt="Privacy details image placeholder"
              label="privacy-details.png"
              frameClassName="intro-inline-image mt-6"
            />
          </section>
        </section>

        <section className="section-panel-about px-6 py-8 sm:px-8">
          <h2 className="section-title text-3xl font-semibold">
            Cookies and third-party services
          </h2>
          <p className="copy-muted mt-4 leading-8">
            Analytics providers may use cookies or similar technologies to
            measure usage. You can control cookies through your browser
            settings, although disabling them may affect parts of the site
            experience.
          </p>
          <p className="copy-muted mt-4 leading-8">
            PilotSeal may rely on third-party services for hosting, analytics,
            and monitoring. Google’s privacy policy is available at{" "}
            <a
              className="font-semibold text-[var(--accent)]"
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noreferrer"
            >
              policies.google.com/privacy
            </a>
            .
          </p>
        </section>

        <section className="masonry-grid">
          <section className="content-card p-6">
            <h2 className="section-title text-2xl font-semibold">Your choices</h2>
            <ul className="mt-5 list-disc space-y-3 pl-6 text-[var(--muted)]">
              <li>Disable cookies in your browser settings</li>
              <li>Use privacy settings or extensions that limit tracking</li>
              <li>Choose not to use the site if you do not agree with this policy</li>
            </ul>
          </section>

          <section className="content-card-dark p-6">
            <h2 className="section-title text-2xl font-semibold">
              Retention and updates
            </h2>
            <p className="copy-muted mt-4 leading-8">
              Analytics data is retained according to provider settings. We keep
              only what is necessary for operational and product-improvement
              purposes. This policy may be updated over time, with the date on
              this page revised when material changes are made.
            </p>
            <p className="copy-muted mt-4 leading-8">
              Questions can be sent to{" "}
              <a className="font-semibold text-white" href="mailto:admin@pilotseal.com">
                admin@pilotseal.com
              </a>
              .
            </p>
          </section>
        </section>

        <section className="section-panel-about px-6 py-8 sm:px-8">
          <div className="flex flex-wrap gap-3">
            <Link href="/" className="secondary-button">
              Back to home
            </Link>
            <Link href="/disclaimer" className="primary-button">
              Read disclaimer
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
