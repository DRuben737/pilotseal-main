"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    href: "/",
    label: "Home",
    icon: (
      <path d="M4.5 10.7 12 4.5l7.5 6.2V20a1 1 0 0 1-1 1h-4.2v-5.4H9.7V21H5.5a1 1 0 0 1-1-1v-9.3Z" />
    ),
  },
  {
    href: "/tools",
    label: "Tools",
    icon: (
      <>
        <path d="M14.7 4.8 19.2 9.3" />
        <path d="m16.8 2.7 4.5 4.5-11 11H5.8v-4.5l11-11Z" />
        <path d="M4 20h16" />
      </>
    ),
  },
  {
    href: "/read",
    label: "Read",
    icon: (
      <>
        <path d="M5 4.8h5.2c1 0 1.8.8 1.8 1.8V20c0-1.1-.9-2-2-2H5V4.8Z" />
        <path d="M19 4.8h-5.2c-1 0-1.8.8-1.8 1.8V20c0-1.1.9-2 2-2h5V4.8Z" />
      </>
    ),
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <>
        <rect x="4" y="4" width="7" height="7" rx="1.6" />
        <rect x="13" y="4" width="7" height="7" rx="1.6" />
        <rect x="4" y="13" width="7" height="7" rx="1.6" />
        <rect x="13" y="13" width="7" height="7" rx="1.6" />
      </>
    ),
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function MobileAppNav() {
  const pathname = usePathname();

  return (
    <nav className="mobile-app-nav" aria-label="Primary mobile navigation">
      {navItems.map((item) => {
        const active = isActive(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`mobile-app-nav-link ${active ? "mobile-app-nav-link-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.85"
            >
              {item.icon}
            </svg>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
