"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SiteNav from "@/components/ui/SiteNav";
import logoImage from "@/images/logo.png";

export default function SiteHeader() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <header
      className={[
        "border-b border-slate-200/70 bg-white/78 backdrop-blur-xl",
        isHome ? "sticky top-0 z-80" : "relative z-10",
      ].join(" ")}
    >
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
  );
}
