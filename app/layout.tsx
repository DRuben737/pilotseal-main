import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthSessionProvider } from "@/components/auth/AuthSessionProvider";
import SiteNav from "@/components/ui/SiteNav";
import SiteNotificationBanner from "@/components/notifications/SiteNotificationBanner";
import logoImage from "@/images/logo.png";
import { getSiteUrl } from "@/lib/seo";
import { ToolProvider } from "@/stores/toolState";
import "./globals.css";
import "@/components/tools-native/styles/Nighttime.css";
import "@/components/tools-native/styles/EndorsementGenerator.css";
import "@/components/tools-native/styles/FlightBrief.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "PilotSeal | FAA Pilot Tools for CFIs and Student Pilots",
    template: "%s | PilotSeal",
  },
  description:
    "FAA-oriented pilot tools built around FAR 61 regulations. Endorsement generator and training utilities for CFIs and student pilots.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "PilotSeal | FAA Pilot Tools for CFIs and Student Pilots",
    description:
      "FAA-oriented pilot tools built around FAR 61 regulations. Endorsement generator and training utilities for CFIs and student pilots.",
    url: "/",
    siteName: "PilotSeal",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PilotSeal | FAA Pilot Tools for CFIs and Student Pilots",
    description:
      "FAA-oriented pilot tools built around FAR 61 regulations. Endorsement generator and training utilities for CFIs and student pilots.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${inter.className} app-body text-black`}>
        <ToolProvider>
          <AuthSessionProvider>
            <header className="sticky top-0 z-80 border-b border-slate-200/70 bg-white/78 backdrop-blur-xl">
              <div className="site-shell flex items-center justify-between gap-6 px-1 py-4">
                <Link href="/" className="site-brand-link">
                  <span className="site-brand-logo-wrap">
                    <Image
                      src={logoImage}
                      alt="PilotSeal logo"
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
            </header>

            <div className="pb-16 pt-6 sm:pt-10">
              <SiteNotificationBanner />
              {children}
            </div>

            <footer className="border-t border-slate-200/70 px-3 pb-10 pt-10">
              <div className="site-shell">
                <div className="grid gap-10 md:grid-cols-[1.35fr_0.8fr_0.8fr]">
                  <div>
                    <p className="muted-kicker">FAA-oriented workflow support</p>
                    <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--muted)]">
                      PilotSeal tools reference FAA guidance such as Advisory
                      Circular AC 61-65. They are intended to assist instructors
                      and pilots but do not replace FAA regulations or instructor
                      judgment.
                    </p>
                  </div>

                  <div className="text-sm text-[var(--muted)]">
                    <p className="font-semibold text-[var(--foreground)]">Site</p>
                    <div className="mt-4 grid gap-3">
                      <Link href="/">Home</Link>
                      <Link href="/tools">Tools</Link>
                      <Link href="/endorsements">Endorsements</Link>
                      <Link href="/intro">Articles</Link>
                      <Link href="/disclaimer">Disclaimer</Link>
                    </div>
                  </div>

                  <div className="text-sm text-[var(--muted)]">
                    <p className="font-semibold text-[var(--foreground)]">Company</p>
                    <div className="mt-4 grid gap-3">
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
                    <p className="mt-6">© {new Date().getFullYear()} PilotSeal</p>
                  </div>
                </div>
              </div>
            </footer>
          </AuthSessionProvider>
        </ToolProvider>
      </body>
    </html>
  );
}
