import Link from "next/link";
import { Fraunces, Manrope } from "next/font/google";
import SiteNav from "@/components/ui/SiteNav";
import "./globals.css";
import "@/components/tools-native/styles/Nighttime.css";
import "@/components/tools-native/styles/EndorsementGenerator.css";
import "@/components/tools-native/styles/FlightBrief.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

export const metadata = {
  title: "PilotSeal | FAA Pilot Tools for CFIs and Student Pilots",
  description:
    "FAA-oriented pilot tools built around FAR 61 regulations. Endorsement generator and training utilities for CFIs and student pilots.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${fraunces.variable} app-body text-black`}>
        <header className="px-3 pt-3 sm:sticky sm:top-0 sm:z-50">
          <div className="site-shell app-header-shell glass-panel rounded-[20px] px-4 py-3 sm:rounded-[24px] sm:px-6 sm:py-4">
            <div className="flex items-center justify-between gap-4">
              <Link href="/" className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-extrabold text-white sm:h-11 sm:w-11">
                  PS
                </span>
                <span className="display-title block text-xl font-semibold leading-none text-[var(--foreground)]">
                  PilotSeal
                </span>
              </Link>

              <SiteNav />
            </div>
          </div>
        </header>

        <div className="pb-12 pt-4 sm:pt-8">{children}</div>

        <footer className="px-3 pb-8">
          <div className="site-shell app-footer-shell section-panel px-6 py-8">
            <div className="grid gap-8 md:grid-cols-[1.4fr_0.8fr_0.8fr]">
              <div>
                <p className="eyebrow">Pilot workflow, not legal advice</p>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--muted)]">
                  Faster drafting, briefing, and planning. Verify FAA applicability before use.
                </p>
              </div>

              <div className="text-sm text-[var(--muted)]">
                <p className="text-[var(--foreground)] font-semibold">Site</p>
                <div className="mt-3 grid gap-2">
                  <Link href="/">Home</Link>
                  <Link href="/tools">Tools</Link>
                  <Link href="/intro">Articles</Link>
                  <Link href="/disclaimer">Disclaimer</Link>
                </div>
              </div>

              <div className="text-sm text-[var(--muted)]">
                <p className="text-[var(--foreground)] font-semibold">Company</p>
                <div className="mt-3 grid gap-2">
                  <Link href="/privacy">Privacy</Link>
                  <a href="mailto:admin@pilotseal.com">Contact</a>
                  <a
                    href="https://ruben.pilotseal.com"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Blog
                  </a>
                </div>
                <p className="mt-5">© {new Date().getFullYear()} PilotSeal</p>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
