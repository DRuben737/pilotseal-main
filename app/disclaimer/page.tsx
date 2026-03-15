import Link from "next/link";
import dis1Image from "@/images/dis1.png";
import dis2Image from "@/images/dis2.png";
import dis3Image from "@/images/dis3.png";

export default function DisclaimerPage() {
  const disclaimerImages = {
    hero: dis1Image,
    notes: dis2Image,
  };

  return (
    <main className="page-shell page-disclaimer px-3">
      <div className="site-shell page-stack space-y-8">
        <section
          className="hero-panel hero-about section-bg-image overflow-hidden px-6 py-10 sm:px-10 sm:py-14"
          style={{ ["--panel-image" as string]: `url(${disclaimerImages.hero.src})` }}
        >
          <div className="reading-rail article-reading-layout">
            <div className="max-w-3xl">
              <p className="eyebrow">Disclaimer</p>
              <h1 className="display-title mt-4 text-3xl font-semibold leading-[0.95] text-[var(--foreground)] sm:text-4xl">
                Use PilotSeal as workflow support aligned with current FAA references
              </h1>
              <p className="copy-muted mt-4 leading-7">
                PilotSeal tools reference FAA guidance, including Advisory
                Circular AC 61-65 where endorsement language is involved. They
                are designed to support drafting, briefing, and recordkeeping
                workflow, while instructors and pilots remain responsible for
                confirming applicability to the specific aircraft, operation,
                and training scenario.
              </p>
            </div>
          </div>
        </section>

        <section className="section-panel-about px-6 py-8 sm:px-8">
          <h2 className="section-title text-3xl font-semibold">
            Verify current FAA applicability
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

          <section
            className="content-card section-bg-image p-6"
            style={{ ["--panel-image" as string]: `url(${disclaimerImages.notes.src})` }}
          >
            <h2 className="section-title text-2xl font-semibold">
              Official interpretations
            </h2>
            <p className="copy-muted mt-4 leading-8">
              If you need an official interpretation or policy determination,
              consult current FAA regulations, FAA guidance, or qualified
              aviation professionals with responsibility for the operation.
            </p>
          </section>
        </section>

        <section
          className="section-panel-about section-bg-image px-6 py-8 sm:px-8"
          style={{ ["--panel-image" as string]: `url(${dis3Image.src})` }}
        >
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
