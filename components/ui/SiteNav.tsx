"use client";

import { useState } from "react";
import Link from "next/link";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/tools", label: "Tools" },
  { href: "/intro", label: "Articles" },
  { href: "/disclaimer", label: "Disclaimer" },
];

export default function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="site-nav">
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
