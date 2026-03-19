"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { getDeterministicGreeting } from "@/lib/greetings";
import { resolveDisplayIdentity } from "@/lib/identity";
import { fetchCurrentProfile } from "@/lib/profile";
import { fetchDefaultCfi } from "@/lib/saved-people";
import { getSupabaseClient } from "@/lib/supabase";

const dashboardLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/saved-people", label: "Saved People" },
  { href: "/dashboard/notifications", label: "Notifications" },
  { href: "/dashboard/account-settings", label: "Profile" },
];

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, session } = useAuthSession();
  const [signingOut, setSigningOut] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [defaultCfiName, setDefaultCfiName] = useState("");
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    if (!loading && !session?.user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, pathname, router, session]);

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
      } catch (error) {
        console.error(error);
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
    if (session?.user?.id) {
      setGreeting(getDeterministicGreeting(session.user.id));
      return;
    }

    setGreeting("");
  }, [session?.user?.id]);

  const identityLabel = resolveDisplayIdentity({
    displayName,
    defaultCfiName,
    email: session?.user?.email,
  });

  async function handleSignOut() {
    setSigningOut(true);

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error(error);
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <main className="page-shell px-3">
      <div className="site-shell page-stack">
        <div className="saas-dashboard-grid">
          <aside className="saas-sidebar saas-sidebar-desktop">
            <nav className="saas-sidebar-nav">
              {dashboardLinks.map((item) => {
                const active =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`saas-sidebar-link ${active ? "saas-sidebar-link-active" : ""}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="saas-sidebar-card">
              <p className="saas-sidebar-email">{identityLabel}</p>
              <button
                type="button"
                className="secondary-button mt-4 w-full justify-center"
                disabled={!session?.user || signingOut}
                onClick={handleSignOut}
              >
                {signingOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          </aside>

          <section className="saas-content">
            {greeting ? (
              <div className="saas-panel">
                <p className="saas-greeting saas-greeting-visible">{greeting}</p>
              </div>
            ) : null}

            <div className="saas-mobile-shell">
              <div className="saas-panel saas-mobile-header">
                <div className="saas-mobile-user">
                  <p className="saas-sidebar-email">{identityLabel}</p>
                  <button
                    type="button"
                    className="secondary-button w-full justify-center"
                    disabled={!session?.user || signingOut}
                    onClick={handleSignOut}
                  >
                    {signingOut ? "Signing out..." : "Sign out"}
                  </button>
                </div>
              </div>

              <nav className="saas-mobile-nav" aria-label="Dashboard navigation">
                {dashboardLinks.map((item) => {
                  const active =
                    item.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`saas-mobile-nav-link ${
                        active ? "saas-mobile-nav-link-active" : ""
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {loading || !session?.user ? null : children}
          </section>
        </div>
      </div>
    </main>
  );
}
