"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/tools", label: "Tools" },
  { href: "/intro", label: "Articles" },
  { href: "/disclaimer", label: "Disclaimer" },
];

export default function SiteNav() {
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (!navRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className="site-nav" ref={navRef}>
      <button
        type="button"
        className="site-nav-toggle"
        aria-expanded={open}
        aria-label="Toggle navigation"
        onClick={() => setOpen((value) => !value)}
      >
        <span />
        <span />
        <span />
      </button>

      <nav className={`site-nav-menu ${open ? "site-nav-menu-open" : ""}`}>
        {navItems.map((item) => (
          <Link
            key={item.href}
            className="secondary-button site-nav-link"
            href={item.href}
            onClick={() => setOpen(false)}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
