import Image from "next/image";
import Link from "next/link";

import { guideCards } from "@/app/endorsements/guide-content";
import authWorkspaceIllustration from "@/images/auth-workspace-illustration.png";
import endorsementsHeroIllustration from "@/images/endorsements-hero-illustration.png";
import homeHeroAviation from "@/images/home-hero-aviation.png";
import utilityToolsIllustration from "@/images/utility-tools-illustration.png";

export default function Home() {
  const guideLinks = [
    guideCards["student-solo"],
    guideCards["solo-cross-country"],
    guideCards["knowledge-test"],
  ];

  return (
    <main className="page-shell page-home px-3">
      <div className="site-shell page-stack space-y-6">
        <section className="overflow-hidden border-b border-slate-200/75 pb-6">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
            <div className="relative min-h-[260px] overflow-hidden bg-slate-900 lg:min-h-[460px]">
              <Image
                src={homeHeroAviation}
                alt="PilotSeal aviation hero illustration"
                className="absolute inset-0 h-full w-full object-cover"
                priority
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.08),rgba(15,23,42,0.48))]" />
            </div>

            <div className="bg-[#143247] px-6 py-6 text-white lg:px-8">
              <div className="space-y-4">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-sky-200/75">
                  PilotSeal
                </p>
                <p className="max-w-md text-xl font-semibold leading-tight text-white">
                  For instructors and students, find the right tools here to smooth your training path.
                </p>
                <p className="max-w-md text-sm leading-7 text-slate-200/86">
                  We offer FAA endorsement generator, W&amp;B, quick preflight brief, and more.
                </p>
                <div className="flex flex-wrap gap-4 pt-2 text-sm font-medium text-sky-200/90">
                  <Link href="/tools" className="hover:text-white">
                    Tools
                  </Link>
                  <Link href="/intro" className="hover:text-white">
                    Articles
                  </Link>
                  <Link href="/login" className="hover:text-white">
                    Login
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Link href="/tools" className="group overflow-hidden rounded-[14px] border border-slate-200/75 bg-white/70">
            <div className="relative h-40 overflow-hidden">
              <Image
                src={utilityToolsIllustration}
                alt="PilotSeal tools section preview"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            </div>
          </Link>

          <Link href={guideLinks[0].href} className="group overflow-hidden rounded-[14px] border border-slate-200/75 bg-white/70">
            <div className="relative h-40 overflow-hidden">
              <Image
                src={endorsementsHeroIllustration}
                alt="PilotSeal guide preview"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            </div>
          </Link>

          <Link href="/login" className="group overflow-hidden rounded-[14px] border border-slate-200/75 bg-white/70">
            <div className="relative h-40 overflow-hidden">
              <Image
                src={authWorkspaceIllustration}
                alt="PilotSeal account workspace preview"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            </div>
          </Link>
        </section>

        <section className="divide-y divide-slate-200/75 border-t border-slate-200/75">
          {guideLinks.map((guide) => (
            <Link
              key={guide.href}
              href={guide.href}
              className="grid gap-2 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
            >
              <div className="min-w-0">
                <h2 className="text-[1.05rem] font-semibold text-slate-950">{guide.title}</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{guide.desc}</p>
              </div>
              <span className="text-sm font-semibold text-[var(--accent-strong)]">Open</span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
