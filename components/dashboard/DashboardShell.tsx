"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import { resolveDisplayIdentity } from "@/lib/identity";
import { canManageOrganization } from "@/lib/organizations";
import { fetchCurrentProfile } from "@/lib/profile";
import { fetchDefaultCfi } from "@/lib/saved-people";
import { getSupabaseClient } from "@/lib/supabase";
import {
  fetchUnreadNotificationCount,
  refreshMyProfileReminders,
  subscribeToNotificationChanges,
} from "@/lib/notifications";

const dashboardLinks = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/my-aircraft", label: "My Aircraft" },
  { href: "/dashboard/reports", label: "Safety Reports" },
  { href: "/dashboard/saved-people", label: "People" },
  { href: "/dashboard/records", label: "Records" },
  { href: "/dashboard/notifications", label: "Notifications" },
  { href: "/dashboard/account-settings", label: "Account" },
];
const organizationLinks = [
  { href: "/dashboard/organization/overview", label: "Overview" },
  { href: "/dashboard/organization/people", label: "People" },
  { href: "/dashboard/organization/fleet", label: "Aircraft & Maintenance" },
  { href: "/dashboard/organization/reports", label: "Safety Reports" },
  { href: "/dashboard/organization/briefs", label: "Preflight Records" },
  { href: "/dashboard/organization/endorsements", label: "Endorsements" },
  { href: "/dashboard/organization/messages", label: "Messages" },
  { href: "/dashboard/organization/audit", label: "Audit Log" },
];
const platformLinks = [
  { href: "/dashboard/admin/overview", label: "Platform Overview" },
  { href: "/dashboard/admin/access", label: "Organizations & Access" },
  { href: "/dashboard/admin/aircraft", label: "Aircraft Library" },
  { href: "/dashboard/admin/aircraft-assignments", label: "Aircraft Assignments" },
  { href: "/dashboard/admin/endorsements", label: "Endorsement Approvals" },
  { href: "/dashboard/admin/notifications", label: "Platform Notices" },
  { href: "/dashboard/admin/audit", label: "Audit Log" },
];

function DashboardIcon({ kind }: { kind: string }) {
  const common = "h-[18px] w-[18px]";

  switch (kind) {
    case "Overview":
    case "Platform Overview":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "People":
    case "Organization":
    case "Organizations & Access":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M4.5 18c.9-2.5 3-4 5.5-4s4.6 1.5 5.5 4" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M15.5 18c.5-1.6 1.8-2.8 3.7-3.2" />
        </svg>
      );
    case "Records":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <path d="M3.8 7.5h6l1.6 2H20v9.2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.7V5.3A1.5 1.5 0 0 1 5.5 3.8h4.2l1.6 2h7.2" />
        </svg>
      );
    case "Safety Reports":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <path d="M12 3.5 19 6v5.2c0 4.1-2.8 7.6-7 9.3-4.2-1.7-7-5.2-7-9.3V6l7-2.5Z" />
          <path d="M12 8v4.6" />
          <path d="M12 16h.01" />
        </svg>
      );
    case "Preflight Records":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <circle cx="5" cy="17.5" r="1.5" />
          <circle cx="18.5" cy="5.5" r="1.5" />
          <path d="M6.5 17.2c4.8-.7 2.7-7 7.3-7.5 1.7-.2 3.3.4 4.2 1.5" strokeDasharray="2.2 2.2" />
          <path d="m15.2 15.6 5.2-1.8-3.4-2.5-1.8-5-1.2.4.5 4.8-4.1 2.7.7 1 4.1-1.6Z" />
        </svg>
      );
    case "Audit Log":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <path d="M6 4h12v16H6z" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </svg>
      );
    case "Notifications":
    case "Platform Notices":
    case "Messages":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <path d="M12 4a4 4 0 0 1 4 4v2.7c0 1 .4 2 .9 2.9l1 1.5H6.1l1-1.5c.5-.9.9-1.9.9-2.9V8a4 4 0 0 1 4-4Z" />
          <path d="M10 18a2 2 0 0 0 4 0" />
        </svg>
      );
    case "Account":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 19c1.2-3 3.6-4.7 6.5-4.7S17.3 16 18.5 19" />
        </svg>
      );
    case "Aircraft":
    case "Aircraft & Maintenance":
    case "Aircraft Library":
    case "Aircraft Assignments":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <path d="M2 13.5h7l5.2-7.2c.5-.7 1.5-.8 2.1-.3.5.4.7 1.1.4 1.7L15 13.5h5.2c.9 0 1.8.5 2.2 1.3l-.9.7H15l-1.4 4.1h-1.7l.2-4.1H8.7L7 18H5.4l.5-2.5H2v-2Z" />
        </svg>
      );
    case "Endorsements":
    case "Endorsement Approvals":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <path d="M6 3.8h12v16.4H6z" />
          <path d="M9 8h6M9 11h4" />
          <circle cx="14.8" cy="16" r="2.6" />
          <path d="m13.7 18.3-.5 2.2 1.6-.8 1.6.8-.5-2.2" />
        </svg>
      );
    case "Access":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <path d="M12 3.5 19 6v5.4c0 4.2-2.8 7.7-7 9.1-4.2-1.4-7-4.9-7-9.1V6l7-2.5Z" />
          <path d="M9.2 12.1 11 14l4-4.2" />
        </svg>
      );
    case "My Aircraft":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <path d="M3 14h7l5.2-7.2c.5-.7 1.5-.8 2.1-.3.5.4.7 1.1.4 1.7L16 14h4.4c1 0 1.9.6 2.3 1.5l-.9.7H16l-1.3 3.8H13l.2-3.8H9.5L8 18.5H6.3l.5-2.3H3V14Z" />
          <circle cx="18.8" cy="5.2" r="2.2" />
        </svg>
      );
    case "new":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "signout":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <path d="M10 6H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" />
          <path d="M14 16l4-4-4-4" />
          <path d="M18 12H9" />
        </svg>
      );
    case "pin":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <path d="m9 4 6 6" />
          <path d="m14.7 4.8 4.5 4.5-3 1.5-3.6 3.6-1.2 5.1-1.8-1.8-1.8-1.8 5.1-1.2 3.6-3.6 1.5-3Z" />
          <path d="m8.8 15.2-4 4" />
        </svg>
      );
    default:
      return null;
  }
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, session } = useAuthSession();
  const {
    organizations,
    activeOrganization,
    activeOrganizationId,
    loading: organizationsLoading,
    setActiveOrganizationId,
  } = useOrganization();
  const [signingOut, setSigningOut] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [defaultCfiName, setDefaultCfiName] = useState("");
  const [profileRole, setProfileRole] = useState("");
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const sidebarExpanded = sidebarHovered;

  useEffect(() => {
    if (!loading && !session?.user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, pathname, router, session]);

  useEffect(() => {
    setSidebarHovered(false);
  }, [pathname]);

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
    const userId = session?.user?.id ?? "";
    if (!userId) {
      setUnreadNotificationCount(0);
      return undefined;
    }

    let cancelled = false;
    async function refreshUnreadCount(syncProfileReminders = false) {
      try {
        if (syncProfileReminders) await refreshMyProfileReminders();
        const count = await fetchUnreadNotificationCount(userId);
        if (!cancelled) setUnreadNotificationCount(count);
      } catch (error) {
        console.error("Unable to load unread notifications:", error);
      }
    }

    void refreshUnreadCount(true);
    const unsubscribe = subscribeToNotificationChanges(userId, () => void refreshUnreadCount());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [session?.user?.id]);

  const identityLabel = resolveDisplayIdentity({
    displayName,
    defaultCfiName,
    email: session?.user?.email,
  });

  const workspace = pathname.startsWith("/dashboard/admin")
    ? "platform"
    : pathname.startsWith("/dashboard/organization")
      ? "organization"
      : "personal";
  const visibleDashboardLinks = workspace === "platform"
    ? platformLinks
    : workspace === "organization"
      ? organizationLinks
      : dashboardLinks;
  const workspaceLabel = workspace === "platform"
    ? "Platform administration"
    : workspace === "organization"
      ? activeOrganization?.name ?? "Organization"
      : "Personal workspace";
  const workspaceSwitches = [
    { href: "/dashboard", label: "Personal", icon: "Overview", visible: true },
    {
      href: "/dashboard/organization/overview",
      label: "Organization",
      icon: "Organization",
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
      icon: "Access",
      visible: profileRole === "admin",
    },
  ].filter((item) => item.visible);
  const isDashboardLinkActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname.startsWith(`${href}/`);
  const mobileDashboardLinks = visibleDashboardLinks;

  async function handleSignOut() {
    setSigningOut(true);

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <main className="page-shell dashboard-shell px-3">
      <div className="site-shell page-stack">
        {loading || !session?.user ? null : (
          <section className="dashboard-app-layout flex items-start gap-3 sm:gap-4">
            <div className="dashboard-sidebar-slot">
              <aside
                className="dashboard-sidebar"
                data-expanded={sidebarExpanded}
                aria-label={`${workspaceLabel} sidebar`}
                onPointerEnter={() => setSidebarHovered(true)}
                onPointerLeave={() => setSidebarHovered(false)}
                onClickCapture={(event) => {
                  if (event.detail <= 0) return;

                  const control = (event.target as HTMLElement | null)?.closest<HTMLElement>("a, button");
                  if (!control) return;

                  requestAnimationFrame(() => control.blur());
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setSidebarHovered(false);
                    (event.currentTarget.querySelector(":focus") as HTMLElement | null)?.blur();
                  }
                }}
              >
                <header className="dashboard-sidebar-header">
                  <div className="dashboard-sidebar-brand-row">
                    <Link
                      href="/dashboard"
                      className="dashboard-sidebar-logo"
                      aria-label="PilotSeal dashboard"
                      title="PilotSeal dashboard"
                    >
                      <span>PS</span>
                    </Link>
                    <div className="dashboard-sidebar-copy min-w-0">
                      <p className="truncate text-sm font-semibold text-white">PilotSeal</p>
                      <p className="truncate text-xs text-white/55">{identityLabel}</p>
                    </div>
                  </div>

                  {workspaceSwitches.length > 1 ? (
                    <div className="dashboard-workspace-switcher">
                      <p className="dashboard-workspace-label">Workspace</p>
                      <nav
                        className="dashboard-workspace-grid"
                        style={{
                          gridTemplateColumns: `repeat(${workspaceSwitches.length}, minmax(0, 1fr))`,
                        }}
                        aria-label="Switch workspace"
                      >
                        {workspaceSwitches.map((item) => {
                          const active = workspace === item.label.toLowerCase();
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              aria-label={`${item.label} workspace`}
                              title={`${item.label} workspace`}
                              className={`dashboard-workspace-link ${active ? "dashboard-workspace-link-active" : ""}`}
                            >
                              <DashboardIcon kind={item.icon} />
                              <span>{item.label}</span>
                            </Link>
                          );
                        })}
                      </nav>
                    </div>
                  ) : null}
                </header>

                <nav aria-label={`${workspaceLabel} navigation`} className="dashboard-sidebar-nav">
                  <p className="dashboard-sidebar-section-label">{workspaceLabel}</p>
                  {visibleDashboardLinks.map((item) => {
                    const active = isDashboardLinkActive(item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-label={item.label}
                        title={item.label}
                        className={`dashboard-sidebar-link ${active ? "dashboard-sidebar-link-active" : ""}`}
                      >
                        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                          <DashboardIcon kind={item.label} />
                          {item.label === "Notifications" && unreadNotificationCount > 0 ? (
                            <span className="absolute -right-2 -top-2 flex min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-4 text-white">
                              {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                            </span>
                          ) : null}
                        </span>
                        <span className="dashboard-sidebar-copy min-w-0 flex-1 truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>

                <footer className="dashboard-sidebar-footer">
                  <Link
                    href="/tools/endorsement-generator"
                    aria-label="New endorsement"
                    title="New endorsement"
                    className="dashboard-sidebar-link"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                      <DashboardIcon kind="new" />
                    </span>
                    <span className="dashboard-sidebar-copy min-w-0 flex-1 truncate">New endorsement</span>
                  </Link>
                  <button
                    type="button"
                    aria-label="Sign out"
                    title={`Sign out ${identityLabel}`}
                    className="dashboard-sidebar-link w-full disabled:opacity-60"
                    disabled={!session?.user || signingOut}
                    onClick={handleSignOut}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                      <DashboardIcon kind="signout" />
                    </span>
                    <span className="dashboard-sidebar-copy min-w-0 flex-1 truncate">
                      {signingOut ? "Signing out..." : "Sign out"}
                    </span>
                  </button>
                </footer>
              </aside>
            </div>

            <div className="min-w-0 flex-1">
              <section className="dashboard-mobile-top">
                <div className="min-w-0">
                  <p className="dashboard-mobile-kicker">{workspaceLabel}</p>
                  <p className="dashboard-mobile-identity">{identityLabel}</p>
                </div>
                <Link
                  href="/tools/endorsement-generator"
                  className="dashboard-mobile-action"
                >
                  <DashboardIcon kind="new" />
                  <span>New</span>
                </Link>
              </section>
              {workspaceSwitches.length > 1 ? (
                <nav className="dashboard-mobile-workspaces mb-3 gap-2 overflow-x-auto" aria-label="Switch workspace">
                  {workspaceSwitches.map((item) => {
                    const active = workspace === item.label.toLowerCase();
                    return <Link key={item.href} href={item.href} className={`min-h-10 shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold ${active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{item.label}</Link>;
                  })}
                </nav>
              ) : null}
              {!organizationsLoading && organizations.length > 1 && (profileRole !== "admin" || workspace === "organization") ? (
                <div className="mb-3 flex justify-end">
                  <select
                    aria-label="Current organization"
                    className="h-9 max-w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                    value={activeOrganizationId}
                    onChange={(event) => setActiveOrganizationId(event.target.value)}
                  >
                    {organizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {children}
            </div>

            <nav className="dashboard-bottom-nav" aria-label="Dashboard navigation">
              {mobileDashboardLinks.map((item) => {
                const active =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`dashboard-bottom-nav-link relative ${
                      active ? "dashboard-bottom-nav-link-active" : ""
                    }`}
                  >
                    <DashboardIcon kind={item.label} />
                    {item.label === "Notifications" && unreadNotificationCount > 0 ? (
                      <span className="absolute right-2 top-1 flex min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-4 text-white">
                        {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                      </span>
                    ) : null}
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </section>
        )}
      </div>
    </main>
  );
}
