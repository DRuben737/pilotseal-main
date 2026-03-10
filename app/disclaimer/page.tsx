import Link from "next/link";
import AdaptiveImageSlot from "@/components/ui/AdaptiveImageSlot";

export default function DisclaimerPage() {
  const disclaimerImages = {
    hero: "/disclaimer-hero.png",
    notes: "/disclaimer-notes.png",
  };

  return (
    <main className="page-shell page-disclaimer px-3">
      <div className="site-shell page-stack space-y-8">
        <section className="hero-panel hero-about overflow-hidden px-6 py-10 sm:px-10 sm:py-14">
          <div className="reading-rail">
            <div className="max-w-3xl">
              <p className="eyebrow">Disclaimer</p>
              <h1 className="display-title mt-4 text-3xl font-semibold leading-[0.95] text-[var(--foreground)] sm:text-4xl">
                Use PilotSeal as workflow support, not as a regulatory substitute
              </h1>
              <p className="copy-muted mt-4 leading-7">
                PilotSeal is provided for educational and informational purposes
                only. It does not replace official FAA regulations, guidance,
                training materials, or the judgment of a certificated flight
                instructor.
              </p>
            </div>
            <div className="content-card overflow-hidden p-3 sm:p-4">
              <AdaptiveImageSlot
                src={disclaimerImages.hero}
                alt="Disclaimer hero image placeholder"
                label="disclaimer-hero.png"
              />
            </div>
          </div>
        </section>

        <section className="section-panel-about px-6 py-8 sm:px-8">
          <h2 className="section-title text-3xl font-semibold">
            No regulatory guarantee
          </h2>
          <p className="copy-muted mt-4 leading-8">
            Regulations, policy, and guidance can change. You are responsible
            for verifying that any output, endorsement wording, procedures, or
            recommendations are accurate and applicable to your specific
            situation, and consistent with current FAA requirements.
          </p>
        </section>

        <section className="masonry-grid">
          <section className="content-card p-6">
            <h2 className="section-title text-2xl font-semibold">No liability</h2>
            <p className="copy-muted mt-4 leading-8">
              By using this site and any associated tools, you agree that
              PilotSeal and its authors are not liable for losses, damages, or
              claims arising from use of the site, tools, or generated content.
            </p>
          </section>

          <section className="content-card p-6">
            <h2 className="section-title text-2xl font-semibold">
              Not legal advice
            </h2>
            <p className="copy-muted mt-4 leading-8">
              Nothing on this site constitutes legal advice. If you need an
              official interpretation, consult the FAA or qualified
              professionals.
            </p>
            <AdaptiveImageSlot
              src={disclaimerImages.notes}
              alt="Disclaimer notes image placeholder"
              label="disclaimer-notes.png"
              frameClassName="intro-inline-image mt-6"
            />
          </section>
        </section>

        <section className="section-panel-about px-6 py-8 sm:px-8">
          <div className="flex flex-wrap gap-3">
            <Link className="secondary-button" href="/">
              Back to home
            </Link>
            <Link className="primary-button" href="/privacy">
              Privacy policy
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
