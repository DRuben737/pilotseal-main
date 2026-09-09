"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const appRoutePrefixes = [
  "/dashboard",
  "/tools",
  "/account",
  "/login",
  "/register",
  "/reset-password",
  "/join-organization",
];

export default function AppFooter() {
  const pathname = usePathname();
  const isApplicationRoute = appRoutePrefixes.some((prefix) => (
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  ));

  if (isApplicationRoute) return null;

  return (
    <footer className="app-footer-shell px-3">
      <div className="app-footer-desktop site-shell">
        <div className="grid gap-10 md:grid-cols-[1.35fr_0.8fr_0.8fr]">
          <div>
            <p className="muted-kicker">FAA-oriented workflow support</p>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--muted)]">
              PilotSeal tools reference FAA guidance such as Advisory Circular AC 61-65. They assist
              instructors and pilots but do not replace FAA regulations or instructor judgment.
            </p>
          </div>
          <div className="text-sm text-[var(--muted)]">
            <p className="font-semibold text-[var(--foreground)]">Site</p>
            <div className="mt-4 grid gap-3">
              <Link href="/home">Home</Link>
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
              <a href="https://ruben.pilotseal.com" target="_blank" rel="noreferrer">Blog</a>
            </div>
            <p className="mt-6">© {new Date().getFullYear()} PilotSeal</p>
          </div>
        </div>
      </div>

      <div className="app-footer-mobile site-shell">
        <p>© {new Date().getFullYear()} PilotSeal</p>
        <nav aria-label="Legal links">
          <Link href="/privacy">Privacy</Link>
          <Link href="/disclaimer">Disclaimer</Link>
          <a href="mailto:admin@pilotseal.com">Contact</a>
        </nav>
      </div>
    </footer>
  );
}
