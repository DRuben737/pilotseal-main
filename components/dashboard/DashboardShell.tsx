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
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/saved-people", label: "People" },
  { href: "/dashboard/records", label: "Records" },
  { href: "/dashboard/notifications", label: "Notifications" },
  { href: "/dashboard/account-settings", label: "Account" },
];
const organizationLinks = [
  { href: "/dashboard/organization/overview", label: "Overview" },
  { href: "/dashboard/organization/people", label: "People" },
  { href: "/dashboard/organization/fleet", label: "Fleet & MX" },
  { href: "/dashboard/organization/briefs", label: "Preflight Records" },
  { href: "/dashboard/organization/endorsements", label: "Endorsements" },
  { href: "/dashboard/organization/messages", label: "Messages" },
  { href: "/dashboard/organization/audit", label: "Audit Log" },
];
const platformLinks = [
  { href: "/dashboard/admin/overview", label: "Platform Overview" },
  { href: "/dashboard/admin/access", label: "Organizations & Access" },
  { href: "/dashboard/admin/aircraft", label: "Platform Fleet" },
  { href: "/dashboard/admin/aircraft-assignments", label: "Aircraft Assignments" },
  { href: "/dashboard/admin/endorsements", label: "Endorsement Approvals" },
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
    case "Reports":
    case "Preflight Records":
    case "Audit Log":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <path d="M7 3.8h7.2L18 7.6V20a1.2 1.2 0 0 1-1.2 1.2H7A1.2 1.2 0 0 1 5.8 20V5A1.2 1.2 0 0 1 7 3.8Z" />
          <path d="M14 4v4h4" />
          <path d="M8.8 12h6.4" />
          <path d="M8.8 15.3h6.4" />
          <path d="M8.8 18.6h3.8" />
        </svg>
      );
    case "Notifications":
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
    case "Fleet & MX":
    case "Platform Fleet":
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
          <path d="M6.5 3.8h8.2L18 7.1V20a1.2 1.2 0 0 1-1.2 1.2H6.5A1.2 1.2 0 0 1 5.3 20V5a1.2 1.2 0 0 1 1.2-1.2Z" />
          <path d="M14.3 4.2v3.4h3.3" />
          <path d="M8.5 12h6.8" />
          <path d="M8.5 15.2h6.8" />
          <path d="M8.5 18.4h4.4" />
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
      visible: Boolean(activeOrganization && canManageOrganization(activeOrganization.member_role)),
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
            <aside className="dashboard-sidebar sticky top-4 max-h-[calc(100vh-2rem)] w-[240px] shrink-0 overflow-x-hidden overflow-y-auto rounded-[24px] bg-[linear-gradient(180deg,#173b56_0%,#123149_100%)] p-3 text-white shadow-[0_18px_44px_rgba(15,23,42,0.14)]">
              <div>
                <div className="block">
                  <div className="flex items-center gap-3 overflow-hidden px-1">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-white/12 bg-white/8 text-sm font-semibold">
                      PS
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">PilotSeal</p>
                      <p className="truncate text-xs text-white/55">{identityLabel}</p>
                    </div>
                  </div>
                  <div className="mt-5 h-px w-full bg-white/10" />
                </div>

                {workspaceSwitches.length > 1 ? (
                  <div className="mt-4 grid grid-cols-3 gap-1 rounded-[14px] bg-white/8 p-1" aria-label="Switch workspace">
                    {workspaceSwitches.map((item) => {
                      const active = workspace === item.label.toLowerCase();
                      return <Link key={item.href} href={item.href} title={`${item.label} workspace`} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-[11px] px-1 text-[0.65rem] font-semibold transition-colors ${active ? "bg-white text-slate-900" : "text-white/65 hover:bg-white/10 hover:text-white"}`}><DashboardIcon kind={item.icon} /><span>{item.label}</span></Link>;
                    })}
                  </div>
                ) : null}

                <nav aria-label={`${workspaceLabel} navigation`} className="mt-5 grid gap-1.5">
                  <p className="px-3 pb-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-white/45">{workspaceLabel}</p>
                  {visibleDashboardLinks.map((item) => {
                    const active = isDashboardLinkActive(item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-label={item.label}
                        title={item.label}
                        className={`relative flex min-h-11 items-center gap-3 rounded-[13px] px-3 text-sm font-medium transition-colors duration-200 ${
                          active
                            ? "bg-blue-500 text-white shadow-[0_8px_20px_rgba(37,99,235,0.28)]"
                            : "text-white/70 hover:bg-white/8 hover:text-white"
                        }`}
                      >
                        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                          <DashboardIcon kind={item.label} />
                          {item.label === "Notifications" && unreadNotificationCount > 0 ? (
                            <span className="absolute -right-2 -top-2 flex min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-4 text-white">
                              {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                            </span>
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1 leading-5">{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>

                <div className="mt-4 grid gap-2 border-t border-white/10 pt-4">
                  <Link
                    href="/tools/endorsement-generator"
                    aria-label="New endorsement"
                    title="New endorsement"
                    className="relative flex min-h-11 items-center gap-3 rounded-[13px] px-3 text-sm font-medium text-white/70 transition hover:bg-white/8 hover:text-white"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                      <DashboardIcon kind="new" />
                    </span>
                    <span>New endorsement</span>
                  </Link>
                  <button
                    type="button"
                    aria-label="Sign out"
                    title={`Sign out ${identityLabel}`}
                    className="relative flex min-h-11 w-full items-center gap-3 rounded-[13px] px-3 text-sm font-medium text-white/70 transition hover:bg-white/8 hover:text-white disabled:opacity-60"
                    disabled={!session?.user || signingOut}
                    onClick={handleSignOut}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                      <DashboardIcon kind="signout" />
                    </span>
                    <span>{signingOut ? "Signing out..." : "Sign out"}</span>
                  </button>
                </div>
              </div>
            </aside>

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
              {!organizationsLoading && organizations.length > 0 && (profileRole !== "admin" || workspace === "organization") ? (
                <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-slate-200/80 bg-white/80 px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Current organization
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {activeOrganization?.name ?? "Select an organization"}
                    </p>
                  </div>
                  <select
                    aria-label="Current organization"
                    className="max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    value={activeOrganizationId}
                    onChange={(event) => setActiveOrganizationId(event.target.value)}
                  >
                    {organizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                      </option>
                    ))}
                  </select>
                </section>
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
