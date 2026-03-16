import Image from "next/image";
import Link from "next/link";
import { Inter, Merriweather } from "next/font/google";
import { AuthSessionProvider } from "@/components/auth/AuthSessionProvider";
import SiteNav from "@/components/ui/SiteNav";
import SiteNotificationBanner from "@/components/notifications/SiteNotificationBanner";
import logoImage from "@/images/logo.png";
import "./globals.css";
import "@/components/tools-native/styles/Nighttime.css";
import "@/components/tools-native/styles/EndorsementGenerator.css";
import "@/components/tools-native/styles/FlightBrief.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-merriweather",
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
      <body
        className={`${inter.variable} ${merriweather.variable} ${inter.className} app-body text-black`}
      >
        <AuthSessionProvider>
          <header className="relative z-80 px-3 pt-3">
            <div className="site-shell app-header-shell glass-panel rounded-[20px] px-4 py-3 sm:rounded-[24px] sm:px-6 sm:py-4">
              <div className="flex items-center justify-between gap-4">
                <Link href="/" className="site-brand-link">
                  <span className="site-brand-logo-wrap">
                    <Image
                      src={logoImage}
                      alt="PilotSeal Tools logo"
                      className="site-brand-logo"
                      width={56}
                      height={56}
                      priority
                    />
                  </span>
                  <span className="site-brand-title">
                    <span className="site-brand-wordmark text-[var(--foreground)]">
                      PilotSeal
                    </span>
                  </span>
                </Link>

                <SiteNav />
              </div>
            </div>
          </header>

          <div className="pb-12 pt-4 sm:pt-8">
            <SiteNotificationBanner />
            {children}
          </div>

          <footer className="px-3 pb-8">
            <div className="site-shell app-footer-shell section-panel px-6 py-8">
              <div className="grid gap-8 md:grid-cols-[1.4fr_0.8fr_0.8fr]">
                <div>
                  <p className="eyebrow">FAA-oriented workflow support</p>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--muted)]">
                    PilotSeal tools reference FAA guidance such as Advisory
                    Circular AC 61-65. They are intended to assist instructors
                    and pilots but do not replace FAA regulations or instructor
                    judgment.
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
        </AuthSessionProvider>
      </body>
    </html>
  );
}
