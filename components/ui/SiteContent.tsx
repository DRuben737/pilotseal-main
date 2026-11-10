"use client";

import { usePathname } from "next/navigation";

export default function SiteContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/home";

  return (
    <div className={isHome ? "app-main-content-home" : "app-main-content pb-16 pt-8 sm:pt-12"}>
      {children}
    </div>
  );
}
