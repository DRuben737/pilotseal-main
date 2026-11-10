"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import UserMenu from "@/components/ui/UserMenu";
import { resolveDisplayIdentity } from "@/lib/identity";
import { fetchCurrentProfile } from "@/lib/profile";
import { fetchDefaultCfi } from "@/lib/saved-people";
import { getSupabaseClient } from "@/lib/supabase";

const publicNavItems = [
  { href: "/home", label: "Home" },
  { href: "/tools", label: "Tools" },
  { href: "/learn", label: "Learn" },
  { href: "/read", label: "Read" },
];

export default function SiteNav() {
  const pathname = usePathname();
  const { loading, session } = useAuthSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [displayName, setDisplayName] = useState("");
  const [defaultCfiName, setDefaultCfiName] = useState("");

  const isAuthenticated = Boolean(session?.user);
  const userEmail = session?.user?.email ?? "";
  const identityLabel = resolveDisplayIdentity({
    displayName,
    defaultCfiName,
    email: userEmail,
  });
  useEffect(() => {
    let cancelled = false;

    async function loadIdentity() {
      if (!session?.user?.id) {
        if (!cancelled) {
          setDisplayName("");
          setDefaultCfiName("");
        }
        return;
      }

      try {
        const [profile, defaultCfi] = await Promise.all([
          fetchCurrentProfile(session.user.id),
          fetchDefaultCfi(session.user.id),
        ]);
        if (!cancelled) {
          setDisplayName(profile?.display_name ?? "");
          setDefaultCfiName(defaultCfi?.display_name ?? "");
        }
      } catch {
        if (!cancelled) {
          setDisplayName("");
          setDefaultCfiName("");
        }
      }
    }

    void loadIdentity();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMobileOpen(false);
      toggleRef.current?.focus();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen]);

  return (
    <div className="site-nav">
      <div className="site-nav-desktop">
        <nav className="site-nav-inline">
          {publicNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`site-nav-inline-link ${
                pathname === item.href || pathname.startsWith(`${item.href}/`)
                  ? "site-nav-inline-link-active"
                  : ""
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {!isAuthenticated ? (
          <Link
            href="/login"
            className={`site-nav-inline-link ${pathname === "/login" ? "site-nav-inline-link-active" : ""}`}
          >
            {loading ? "Loading..." : "Login"}
          </Link>
        ) : (
          <UserMenu email={userEmail} displayName={identityLabel} />
        )}
      </div>

      <button
        ref={toggleRef}
        type="button"
        className={`site-nav-toggle ${mobileOpen ? "site-nav-toggle-open" : ""}`}
        aria-expanded={mobileOpen}
        aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        aria-controls="site-mobile-menu"
        onClick={() => setMobileOpen((value) => !value)}
      >
        <span />
        <span />
        <span />
      </button>

      <button
        type="button"
        className={`site-nav-backdrop ${mobileOpen ? "site-nav-backdrop-open" : ""}`}
        aria-label="Close navigation"
        aria-hidden={!mobileOpen}
        tabIndex={mobileOpen ? 0 : -1}
        onClick={() => setMobileOpen(false)}
      />

      <div
        id="site-mobile-menu"
        className={`site-nav-menu ${mobileOpen ? "site-nav-menu-open" : ""}`}
        aria-hidden={!mobileOpen}
      >
        <div className="site-nav-mobile-head">
          <span>Navigation</span>
          <span>{isAuthenticated ? identityLabel : "Guest"}</span>
        </div>
        <nav className="site-nav-mobile-links">
          {publicNavItems.map((item) => (
            <Link
              key={item.href}
              className={`site-nav-link ${
                pathname === item.href || pathname.startsWith(`${item.href}/`)
                  ? "site-nav-link-active"
                  : ""
              }`}
              href={item.href}
              tabIndex={mobileOpen ? 0 : -1}
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </Link>
          ))}

          {!isAuthenticated ? (
            <Link
              className="site-nav-link site-nav-link-active site-nav-mobile-login"
              href="/login"
              tabIndex={mobileOpen ? 0 : -1}
              onClick={() => setMobileOpen(false)}
            >
              {loading ? "Loading..." : "Login"}
            </Link>
          ) : (
            <div className="site-nav-mobile-account">
              <Link
                href="/console"
                className="site-nav-link"
                tabIndex={mobileOpen ? 0 : -1}
                onClick={() => setMobileOpen(false)}
              >
                Management Console
              </Link>
              <Link
                href="/console/personal/account"
                className="site-nav-link"
                tabIndex={mobileOpen ? 0 : -1}
                onClick={() => setMobileOpen(false)}
              >
                Account
              </Link>

              <button
                type="button"
                className="danger-button site-nav-mobile-signout"
                tabIndex={mobileOpen ? 0 : -1}
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
