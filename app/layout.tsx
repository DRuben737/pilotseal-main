import Link from "next/link";
import { Fraunces, Manrope } from "next/font/google";
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
              <Link href="/" className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-extrabold text-white sm:h-11 sm:w-11">
                  PS
                </span>
                <span>
                  <span className="display-title block text-xl font-semibold leading-none text-[var(--foreground)]">
                    PilotSeal
                  </span>
                  <span className="mt-1 block text-xs uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                    Tools, articles, compliance
                  </span>
                </span>
              </Link>

              <nav className="grid grid-cols-2 gap-2 text-sm sm:flex sm:flex-wrap sm:items-center sm:justify-end">
                <Link
                  className="secondary-button px-4 py-2 text-sm"
                  href="/"
                >
                  Home
                </Link>
                <Link
                  className="secondary-button px-4 py-2 text-sm"
                  href="/tools"
                >
                  Tools
                </Link>
                <Link
                  className="secondary-button px-4 py-2 text-sm"
                  href="/intro"
                >
                  Articles
                </Link>
                <Link
                  className="secondary-button px-4 py-2 text-sm"
                  href="/disclaimer"
                >
                  Disclaimer
                </Link>
              </nav>
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
                  PilotSeal helps CFIs and student pilots move through
                  endorsement drafting, flight briefing, and planning
                  workflows faster. Always verify applicability against current
                  FAA references before use.
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
