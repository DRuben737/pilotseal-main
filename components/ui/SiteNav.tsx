"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import UserMenu from "@/components/ui/UserMenu";
import { getSupabaseClient } from "@/lib/supabase";

const publicNavItems = [
  { href: "/", label: "Home" },
  { href: "/tools", label: "Tools" },
  { href: "/intro", label: "Articles" },
];

export default function SiteNav() {
  const pathname = usePathname();
  const { loading, session } = useAuthSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAuthenticated = Boolean(session?.user);
  const userEmail = session?.user?.email ?? "";

  return (
    <div className="site-nav">
      <div className="site-nav-desktop">
        <nav className="site-nav-inline">
          {publicNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`site-nav-inline-link ${pathname === item.href ? "site-nav-inline-link-active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
          {isAuthenticated ? (
            <Link
              href="/dashboard"
              className={`site-nav-inline-link ${pathname.startsWith("/dashboard") ? "site-nav-inline-link-active" : ""}`}
            >
              Dashboard
            </Link>
          ) : null}
        </nav>

        {!isAuthenticated ? (
          <Link href="/login" className="site-nav-inline-link site-nav-login">
            {loading ? "Loading..." : "Login"}
          </Link>
        ) : (
          <UserMenu email={userEmail} />
        )}
      </div>

      <button
        type="button"
        className="site-nav-toggle"
        aria-expanded={mobileOpen}
        aria-label="Toggle navigation"
        onClick={() => setMobileOpen((value) => !value)}
      >
        <span />
        <span />
        <span />
      </button>

      <div className={`site-nav-menu ${mobileOpen ? "site-nav-menu-open" : ""}`}>
        <nav className="site-nav-mobile-links">
          {publicNavItems.map((item) => (
            <Link
              key={item.href}
              className={`site-nav-link ${pathname === item.href ? "site-nav-link-active" : ""}`}
              href={item.href}
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </Link>
          ))}

          {!isAuthenticated ? (
            <Link
              className="primary-button site-nav-mobile-login"
              href="/login"
              onClick={() => setMobileOpen(false)}
            >
              {loading ? "Loading..." : "Login"}
            </Link>
          ) : (
            <div className="site-nav-mobile-account">
              <p className="site-user-dropdown-label">Signed in as</p>
              <p className="site-user-dropdown-email">{userEmail}</p>

              {[
                { href: "/dashboard", label: "Dashboard" },
                { href: "/dashboard/saved-people", label: "Saved People" },
                { href: "/dashboard/account-settings", label: "Account Settings" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="site-nav-link"
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </Link>
              ))}

              <button
                type="button"
                className="danger-button site-nav-mobile-signout"
                onClick={async () => {
                  try {
                    const supabase = getSupabaseClient();
                    const { error } = await supabase.auth.signOut();
                    if (error) {
                      throw error;
                    }
                    setMobileOpen(false);
                  } catch (error) {
                    console.error(error);
                  }
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </nav>
      </div>
    </div>
  );
}
