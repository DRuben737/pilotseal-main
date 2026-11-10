"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useState } from "react";

import styles from "./home-template.module.css";

const navigation = [
  { href: "/home", label: "Home" },
  { href: "/tools", label: "Tools" },
  { href: "/learn", label: "Learn" },
  { href: "/read", label: "Read" },
  { href: "/login", label: "Account" },
];

export default function HomeNavigation() {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen]);

  return (
    <>
      <header className={styles.header}>
        <Link className={styles.wordmark} href="/home" aria-label="PilotSeal home">
          PilotSeal
        </Link>

        <nav className={styles.navigation} aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link
              key={item.href}
              className={item.href === "/home" ? styles.activeNavLink : styles.navLink}
              href={item.href}
              aria-current={item.href === "/home" ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          className={`${styles.menuToggle} ${mobileOpen ? styles.menuToggleOpen : ""}`}
          aria-expanded={mobileOpen}
          aria-controls="pilot-home-mobile-menu"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          onClick={() => setMobileOpen((value) => !value)}
        >
          <span />
          <span />
        </button>
      </header>

      <div
        id="pilot-home-mobile-menu"
        className={`${styles.mobileMenu} ${mobileOpen ? styles.mobileMenuOpen : ""}`}
        aria-hidden={!mobileOpen}
        onClick={() => setMobileOpen(false)}
      >
        <nav
          className={styles.mobileMenuLinks}
          aria-label="Mobile navigation"
          onClick={(event) => event.stopPropagation()}
        >
          {navigation.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              className={styles.mobileMenuLink}
              style={{ "--menu-index": index } as CSSProperties}
              tabIndex={mobileOpen ? 0 : -1}
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/tools/endorsement-generator"
            className={styles.mobileMenuCta}
            tabIndex={mobileOpen ? 0 : -1}
            onClick={() => setMobileOpen(false)}
          >
            Create an endorsement
          </Link>
        </nav>
      </div>
    </>
  );
}
