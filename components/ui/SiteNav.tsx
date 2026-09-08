"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import UserMenu from "@/components/ui/UserMenu";
import { resolveDisplayIdentity } from "@/lib/identity";
import { canManageOrganization } from "@/lib/organizations";
import { fetchCurrentProfile } from "@/lib/profile";
import { fetchDefaultCfi } from "@/lib/saved-people";
import { getSupabaseClient } from "@/lib/supabase";

const publicNavItems = [
  { href: "/home", label: "Home" },
  { href: "/tools", label: "Tools" },
  { href: "/read", label: "Read" },
];

export default function SiteNav() {
  const pathname = usePathname();
  const { loading, session } = useAuthSession();
  const { activeOrganization } = useOrganization();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [defaultCfiName, setDefaultCfiName] = useState("");
  const [profileRole, setProfileRole] = useState("");

  const isAuthenticated = Boolean(session?.user);
  const userEmail = session?.user?.email ?? "";
  const identityLabel = resolveDisplayIdentity({
    displayName,
    defaultCfiName,
    email: userEmail,
  });
  const inDashboard = pathname.startsWith("/dashboard");
  const activeWorkspace = pathname.startsWith("/dashboard/admin")
    ? "platform"
    : pathname.startsWith("/dashboard/organization")
      ? "organization"
      : "personal";
  const dashboardWorkspaces = [
    { href: "/dashboard", label: "Personal", id: "personal", visible: true },
    {
      href: "/dashboard/organization/overview",
      label: "Organization",
      id: "organization",
      visible: Boolean(
        activeOrganization && (
          canManageOrganization(activeOrganization.member_role)
          || activeOrganization.teaching_role === "instructor"
        )
      ),
    },
    {
      href: "/dashboard/admin/overview",
      label: "Platform",
      id: "platform",
      visible: profileRole === "admin",
    },
  ].filter((workspace) => workspace.visible);

  useEffect(() => {
    let cancelled = false;

    async function loadIdentity() {
      if (!session?.user?.id) {
        if (!cancelled) {
          setDisplayName("");
          setDefaultCfiName("");
          setProfileRole("");
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
          setProfileRole(profile?.role ?? "");
        }
      } catch {
        if (!cancelled) {
          setDisplayName("");
          setDefaultCfiName("");
          setProfileRole("");
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
        ) : pathname.startsWith("/dashboard") ? (
          <UserMenu email={userEmail} displayName={identityLabel} />
        ) : (
          <Link
            href="/dashboard"
            className={`site-nav-inline-link ${pathname.startsWith("/dashboard") ? "site-nav-inline-link-active" : ""}`}
          >
            Dashboard
          </Link>
        )}
      </div>

      <button
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

      <div
        id="site-mobile-menu"
        className={`site-nav-menu ${mobileOpen ? "site-nav-menu-open" : ""}`}
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
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </Link>
          ))}

          {!isAuthenticated ? (
            <Link
              className="site-nav-link site-nav-link-active site-nav-mobile-login"
              href="/login"
              onClick={() => setMobileOpen(false)}
            >
              {loading ? "Loading..." : "Login"}
            </Link>
          ) : (
            <div className="site-nav-mobile-account">
              {inDashboard && dashboardWorkspaces.length > 1 ? (
                <div className="site-nav-mobile-workspaces">
                  <p>Workspace</p>
                  <div>
                    {dashboardWorkspaces.map((workspace) => (
                      <Link
                        key={workspace.id}
                        href={workspace.href}
                        className={`site-nav-link ${activeWorkspace === workspace.id ? "site-nav-link-active" : ""}`}
                        aria-current={activeWorkspace === workspace.id ? "page" : undefined}
                        onClick={() => setMobileOpen(false)}
                      >
                        {workspace.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <Link
                  href="/dashboard"
                  className={`site-nav-link ${inDashboard ? "site-nav-link-active" : ""}`}
                  onClick={() => setMobileOpen(false)}
                >
                  Dashboard
                </Link>
              )}

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
