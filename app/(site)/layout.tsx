import Script from "next/script";

import AppFooter from "@/components/ui/AppFooter";
import SiteContent from "@/components/ui/SiteContent";
import SiteHeader from "@/components/ui/SiteHeader";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
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
      <SiteHeader />
      <SiteContent>{children}</SiteContent>
      <AppFooter />
    </>
  );
}
