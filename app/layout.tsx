import Link from "next/link";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { AuthSessionProvider } from "@/components/auth/AuthSessionProvider";
import OrganizationProvider from "@/components/organizations/OrganizationProvider";
import MobileAppNav from "@/components/ui/MobileAppNav";
import SiteHeader from "@/components/ui/SiteHeader";
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
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-5VFT1X8VN2"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-5VFT1X8VN2');
          `}
        </Script>
        <ToolProvider>
          <AuthSessionProvider>
            <OrganizationProvider>
              <SiteHeader />

              <div className="app-main-content pb-16 pt-6 sm:pt-10">
                {children}
              </div>

              <MobileAppNav />

              <footer className="app-footer-shell px-3 pb-10 pt-10">
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
                        <Link href="/read">Read</Link>
                      </div>
                    </div>

                    <div className="text-sm text-[var(--muted)]">
                      <p className="font-semibold text-[var(--foreground)]">Info</p>
                      <div className="mt-4 grid gap-3">
                        <Link href="/privacy">Privacy</Link>
                        <Link href="/disclaimer">Disclaimer</Link>
                        <Link href="/sitelog">Site Log</Link>
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
            </OrganizationProvider>
          </AuthSessionProvider>
        </ToolProvider>
      </body>
    </html>
  );
}
