import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { AuthSessionProvider } from "@/components/auth/AuthSessionProvider";
import OrganizationProvider from "@/components/organizations/OrganizationProvider";
import AppFooter from "@/components/ui/AppFooter";
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
    <html lang="en" data-scroll-behavior="smooth">
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

              <AppFooter />
            </OrganizationProvider>
          </AuthSessionProvider>
        </ToolProvider>
      </body>
    </html>
  );
}
