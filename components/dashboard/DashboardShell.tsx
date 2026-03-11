"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { getSupabaseClient } from "@/lib/supabase";

const dashboardLinks = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/notifications", label: "Notifications" },
  { href: "/dashboard/saved-people", label: "Saved People" },
  { href: "/dashboard/account-settings", label: "Account Settings" },
];

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, session } = useAuthSession();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!loading && !session?.user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, pathname, router, session]);

  const statusLabel = useMemo(() => {
    if (loading) {
      return "Checking live session...";
    }

    if (!session?.user) {
      return "No active session. Redirecting to login.";
    }

    return "Session active and synchronized with Supabase.";
  }, [loading, session]);

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
          <aside className="saas-sidebar">
            <div className="saas-sidebar-card">
              <p className="eyebrow">PilotSeal SaaS</p>
              <h1 className="saas-sidebar-title">Operations dashboard</h1>
              <p className="saas-sidebar-copy">
                Run saved-profile workflows and manage site messaging from one control surface.
              </p>
            </div>

            <nav className="saas-sidebar-nav">
              {dashboardLinks.map((item) => {
                const active = pathname === item.href;

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
              <p className="saas-label">User</p>
              <p className="saas-sidebar-email">{session?.user?.email || "Guest session"}</p>
              <p className="saas-sidebar-status">{statusLabel}</p>
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
            {loading || !session?.user ? (
              <div className="saas-panel">
                <p className="eyebrow">Session</p>
                <h2 className="saas-section-title">Preparing dashboard</h2>
                <p className="saas-section-copy">{statusLabel}</p>
              </div>
            ) : (
              children
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
