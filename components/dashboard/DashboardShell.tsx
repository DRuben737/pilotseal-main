"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import {
  getDashboardLinksForWorkspace,
  getPersonalDashboardHref,
  getDashboardWorkspace,
  getDashboardWorkspaceLinks,
  getDashboardNavChildHref,
  isDashboardDestinationActive,
  type DashboardNavChild,
  type DashboardNavItem,
  type DashboardWorkspace,
} from "@/lib/dashboard-navigation";
import { resolveDisplayIdentity } from "@/lib/identity";
import { fetchEnabledFeatureIds, type OptionalFeatureId } from "@/lib/dashboard-preferences";
import { fetchCurrentProfile } from "@/lib/profile";
import { fetchDefaultCfi } from "@/lib/saved-people";
import { getSupabaseClient } from "@/lib/supabase";
import { canManageOrganization } from "@/lib/organizations";
import {
  fetchUnreadNotificationCount,
  refreshMyProfileReminders,
  subscribeToNotificationChanges,
} from "@/lib/notifications";

function DashboardIcon({ kind }: { kind: string }) {
  const common = "h-[18px] w-[18px]";

  switch (kind) {
    case "Overview":
    case "Home":
    case "Dashboard":
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
    case "People management":
    case "Team management":
    case "Members":
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
    case "Flight Briefs":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <path d="M3.8 7.5h6l1.6 2H20v9.2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.7V5.3A1.5 1.5 0 0 1 5.5 3.8h4.2l1.6 2h7.2" />
        </svg>
      );
    case "Schedule":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <rect x="4" y="5.5" width="16" height="14" rx="2" />
          <path d="M8 3.5v4M16 3.5v4M4 10h16M8 14h3M13 14h3M8 17h3" />
        </svg>
      );
    case "Training Guide":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h5v16H7a2.5 2.5 0 0 0-2.5 2V5.5Z" />
          <path d="M19.5 5.5A2.5 2.5 0 0 0 17 3h-5v16h5a2.5 2.5 0 0 1 2.5 2V5.5Z" />
          <path d="M7.5 7.5h2M14.5 7.5h2M7.5 11h2M14.5 11h2" />
        </svg>
      );
    case "Reports":
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
    case "Activity":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <path d="M6 4h12v16H6z" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </svg>
      );
    case "Notifications":
    case "Notices":
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
    case "Fleet management":
    case "Aircraft & Maintenance":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <path d="M2 13.5h7l5.2-7.2c.5-.7 1.5-.8 2.1-.3.5.4.7 1.1.4 1.7L15 13.5h5.2c.9 0 1.8.5 2.2 1.3l-.9.7H15l-1.4 4.1h-1.7l.2-4.1H8.7L7 18H5.4l.5-2.5H2v-2Z" />
        </svg>
      );
    case "Endorsements":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <path d="M6 3.8h12v16.4H6z" />
          <path d="M9 8h6M9 11h4" />
          <circle cx="14.8" cy="16" r="2.6" />
          <path d="m13.7 18.3-.5 2.2 1.6-.8 1.6.8-.5-2.2" />
        </svg>
      );
    case "Organizations":
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

function SidebarNavigationItem({
  active,
  item,
  selectedChildValue,
  subitems,
  unreadNotificationCount,
}: {
  active: boolean;
  item: DashboardNavItem;
  selectedChildValue: string | null;
  subitems: readonly DashboardNavChild[];
  unreadNotificationCount: number;
}) {
  return (
    <div className="dashboard-sidebar-item-group">
      <Link
        href={item.href}
        aria-current={active && !subitems.length ? "page" : undefined}
        aria-label={item.label}
        title={item.label}
        className={`dashboard-sidebar-link ${active ? (subitems.length ? "dashboard-sidebar-link-section-active" : "dashboard-sidebar-link-active") : ""}`}
      >
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
          <DashboardIcon kind={item.label} />
          {item.href === "/console/personal/notifications" && unreadNotificationCount > 0 ? (
            <span className="absolute -right-2 -top-2 flex min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-4 text-white">
              {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
            </span>
          ) : null}
        </span>
        <span className="dashboard-sidebar-copy min-w-0 flex-1 truncate">{item.label}</span>
      </Link>
      {active && subitems.length ? (
        <div className="dashboard-sidebar-subnav" role="group" aria-label={`${item.label} sections`}>
          {subitems.map((child) => {
            const childActive = child.value === selectedChildValue;
            return (
              <Link
                key={`${child.param ?? "view"}:${child.value}`}
                href={getDashboardNavChildHref(item, child)}
                aria-current={childActive ? "page" : undefined}
                className={`dashboard-sidebar-sublink ${childActive ? "dashboard-sidebar-sublink-active" : ""}`}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SidebarNavigationItemWithQuery(props: Omit<React.ComponentProps<typeof SidebarNavigationItem>, "selectedChildValue">) {
  const searchParams = useSearchParams();
  const requested = props.subitems.find((child) => searchParams.get(child.param ?? "view") === child.value);
  const selectedChildValue = requested?.value
    ?? props.subitems.find((child) => child.default)?.value
    ?? props.subitems[0]?.value
    ?? null;
  return <SidebarNavigationItem {...props} selectedChildValue={selectedChildValue} />;
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, session } = useAuthSession();
  const {
    organizations,
    activeOrganizationId,
    loading: organizationsLoading,
    setActiveOrganizationId,
  } = useOrganization();
  const [signingOut, setSigningOut] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [defaultCfiName, setDefaultCfiName] = useState("");
  const [profileRole, setProfileRole] = useState("");
  const [identityReadyUserId, setIdentityReadyUserId] = useState("");
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [enabledFeatureIds, setEnabledFeatureIds] = useState<OptionalFeatureId[]>([]);
  const [featuresReadyUserId, setFeaturesReadyUserId] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileNavigationRef = useRef<HTMLElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarExpanded = true;

  useEffect(() => {
    if (!loading && !session?.user) {
      const nextPath = `${pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
    }
  }, [loading, pathname, router, session]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !mobileNavigationRef.current?.contains(event.target)) {
        setMobileMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileMenuOpen(false);
      mobileMenuButtonRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    let cancelled = false;

    async function loadIdentity() {
      setIdentityReadyUserId("");
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
          setIdentityReadyUserId(session.user.id);
        }
      } catch {
        if (!cancelled) {
          setDisplayName("");
          setDefaultCfiName("");
          setProfileRole("");
          setIdentityReadyUserId(session.user.id);
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
    setFeaturesReadyUserId("");
    if (!userId) {
      setEnabledFeatureIds([]);
      return undefined;
    }

    let cancelled = false;
    const refreshFeatures = async () => {
      try {
        const features = await fetchEnabledFeatureIds(userId);
        if (!cancelled) setEnabledFeatureIds(features);
      } catch {
        if (!cancelled) setEnabledFeatureIds([]);
      } finally {
        if (!cancelled) setFeaturesReadyUserId(userId);
      }
    };
    const handleFeaturesChanged = (event: Event) => {
      const changedUserId = (event as CustomEvent<{ userId?: string }>).detail?.userId;
      if (changedUserId === userId) void refreshFeatures();
    };

    void refreshFeatures();
    window.addEventListener("pilotseal:features-changed", handleFeaturesChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("pilotseal:features-changed", handleFeaturesChanged);
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

  const managedOrganizations = organizations;
  const canManage = managedOrganizations.length > 0;
  const activeManagedOrganization = managedOrganizations.find(
    (organization) => organization.id === activeOrganizationId
  ) ?? managedOrganizations[0] ?? null;
  const organizationPermissions = useMemo(
    () => activeManagedOrganization?.permissions ?? [],
    [activeManagedOrganization?.permissions]
  );
  const isPlatformAdmin = profileRole === "admin";
  const requestedWorkspace = getDashboardWorkspace(pathname);
  const workspace: DashboardWorkspace = requestedWorkspace === "organization" && !canManage
    ? "personal"
    : requestedWorkspace === "platform" && !isPlatformAdmin
      ? "personal"
      : requestedWorkspace;
  const workspaceLinks = getDashboardWorkspaceLinks({
    canManageOrganization: canManage,
    enabledFeatureIds,
    isPlatformAdmin,
    organizationPermissions,
  });
  const visibleDashboardLinks = getDashboardLinksForWorkspace({
    enabledFeatureIds,
    workspace,
    organizationPermissions,
  });
  const accessibleDashboardLinks = useMemo(() => [
    ...getDashboardLinksForWorkspace({ enabledFeatureIds, workspace: "personal" }),
    ...(canManage
      ? getDashboardLinksForWorkspace({
          enabledFeatureIds,
          workspace: "organization",
          organizationPermissions,
        })
      : []),
    ...(isPlatformAdmin
      ? getDashboardLinksForWorkspace({ enabledFeatureIds, workspace: "platform" })
      : []),
  ], [canManage, enabledFeatureIds, isPlatformAdmin, organizationPermissions]);
  const workspaceLabel = workspace === "organization"
    ? (activeManagedOrganization?.name
        ?? "Organization")
    : workspace === "platform"
      ? "Platform administration"
      : "Personal";
  const currentLink = visibleDashboardLinks.find((item) => isDashboardDestinationActive(pathname, item.href));
  const canonicalPageHref = currentLink?.href ?? pathname;
  const currentPageLabel = currentLink?.label ?? "Console";
  const lastConsoleRouteStorageKey = `pilotseal:last-console-route:${session?.user?.id ?? "anonymous"}`;
  const showOrganizationContext = !organizationsLoading && organizations.length > 1 && (
    pathname.startsWith("/console/organization")
    || pathname.startsWith("/console/personal/aircraft")
    || pathname.startsWith("/console/personal/flight-briefs")
    || pathname.startsWith("/console/personal/endorsements")
    || pathname.startsWith("/console/personal/reports")
  );
  const organizationContextOptions = workspace === "organization" ? managedOrganizations : organizations;
  const organizationContextValue = organizationContextOptions.some((organization) => organization.id === activeOrganizationId)
    ? activeOrganizationId
    : organizationContextOptions[0]?.id ?? "";
  const canManageActiveOrganization = canManageOrganization(activeManagedOrganization?.member_role);
  function visibleChildren(item: DashboardNavItem) {
    return (item.children ?? []).filter((child) => {
      if (child.organizationRequired && !organizations.length) return false;
      if (child.organizationManagerOnly && !canManageActiveOrganization) return false;
      if (child.organizationPermission && !organizationPermissions.includes(child.organizationPermission)) return false;
      return true;
    });
  }

  useEffect(() => {
    if (
      requestedWorkspace !== "organization"
      || organizationsLoading
      || identityReadyUserId !== session?.user?.id
      || featuresReadyUserId !== session?.user?.id
    ) return;
    if (activeManagedOrganization?.id && activeManagedOrganization.id !== activeOrganizationId) {
      setActiveOrganizationId(activeManagedOrganization.id);
      return;
    }
  }, [
    activeManagedOrganization?.id,
    activeOrganizationId,
    currentLink,
    organizationsLoading,
    identityReadyUserId,
    featuresReadyUserId,
    requestedWorkspace,
    router,
    session?.user?.id,
    setActiveOrganizationId,
    visibleDashboardLinks,
    workspace,
  ]);

  useEffect(() => {
    if (
      loading
      || !session?.user?.id
      || organizationsLoading
      || identityReadyUserId !== session.user.id
      || featuresReadyUserId !== session.user.id
    ) return;

    const personalFallback = getPersonalDashboardHref(enabledFeatureIds);

    if (pathname === "/console") {
      const stored = window.localStorage.getItem(lastConsoleRouteStorageKey);
      const destination = accessibleDashboardLinks.some((item) => item.href === stored)
        ? stored
        : personalFallback;
      router.replace(destination ?? personalFallback);
      return;
    }

    if (!currentLink) {
      const destination = workspace === requestedWorkspace && visibleDashboardLinks.length > 0
        ? visibleDashboardLinks[0].href
        : personalFallback;
      router.replace(destination);
    }
  }, [
    accessibleDashboardLinks,
    currentLink,
    enabledFeatureIds,
    featuresReadyUserId,
    identityReadyUserId,
    lastConsoleRouteStorageKey,
    loading,
    organizationsLoading,
    pathname,
    requestedWorkspace,
    router,
    session?.user?.id,
    visibleDashboardLinks,
    workspace,
  ]);

  useEffect(() => {
    if (!session?.user?.id || !currentLink) return;
    window.localStorage.setItem(lastConsoleRouteStorageKey, canonicalPageHref);
  }, [canonicalPageHref, currentLink, lastConsoleRouteStorageKey, session?.user?.id]);

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
    <main className="page-shell dashboard-shell console-shell px-3">
      <div className="site-shell page-stack">
        {loading || !session?.user ? null : (
          <section className="dashboard-app-layout flex items-start gap-3 sm:gap-4">
            <div className="dashboard-sidebar-slot" data-expanded={sidebarExpanded}>
              <aside
                className="dashboard-sidebar"
                data-expanded={sidebarExpanded}
                aria-label={`${workspaceLabel} navigation`}
                onClickCapture={(event) => {
                  if (event.detail <= 0) return;

                  const control = (event.target as HTMLElement | null)?.closest<HTMLElement>("a, button");
                  if (!control) return;

                  requestAnimationFrame(() => control.blur());
                }}
              >
                <header className="dashboard-sidebar-header">
                  <div className="dashboard-sidebar-brand-row">
                    <Link
                      href="/console"
                      className="dashboard-sidebar-logo"
                      aria-label="PilotSeal Console"
                      title="PilotSeal Console"
                    >
                      <span>PS</span>
                    </Link>
                    <div className="dashboard-sidebar-copy min-w-0">
                      <p className="truncate text-sm font-semibold text-white">PilotSeal Console</p>
                      <p className="truncate text-xs text-white/55">{identityLabel}</p>
                    </div>
                  </div>

                  {workspaceLinks.length > 1 ? (
                    <div className="dashboard-workspace-switcher">
                      <p className="dashboard-workspace-label">Workspace</p>
                      <nav
                        className="dashboard-workspace-grid"
                        style={{ gridTemplateColumns: `repeat(${workspaceLinks.length}, minmax(0, 1fr))` }}
                        aria-label="Switch workspace"
                      >
                        {workspaceLinks.map((item) => (
                          <Link
                            key={item.workspace}
                            href={item.href}
                            aria-current={workspace === item.workspace ? "page" : undefined}
                            className={`dashboard-workspace-link ${workspace === item.workspace ? "dashboard-workspace-link-active" : ""}`}
                            onClick={() => {
                              if (item.workspace === "organization" && organizationContextValue !== activeOrganizationId) {
                                setActiveOrganizationId(organizationContextValue);
                              }
                            }}
                          >
                            <DashboardIcon kind={item.workspace === "platform" ? "Organizations" : item.workspace === "organization" ? "Organization" : "Overview"} />
                            <span>{item.label}</span>
                          </Link>
                        ))}
                      </nav>
                    </div>
                  ) : null}
                </header>

                <nav aria-label={`${workspaceLabel} pages`} className="dashboard-sidebar-nav">
                  <p className="dashboard-sidebar-section-label">{workspaceLabel}</p>
                  {visibleDashboardLinks.map((item) => {
                    const active = isDashboardDestinationActive(pathname, item.href);
                    const subitems = visibleChildren(item);
                    const fallbackChildValue = subitems.find((child) => child.default)?.value ?? subitems[0]?.value ?? null;
                    return (
                      <Suspense
                        key={item.href}
                        fallback={<SidebarNavigationItem active={active} item={item} selectedChildValue={fallbackChildValue} subitems={subitems} unreadNotificationCount={unreadNotificationCount} />}
                      >
                        <SidebarNavigationItemWithQuery active={active} item={item} subitems={subitems} unreadNotificationCount={unreadNotificationCount} />
                      </Suspense>
                    );
                  })}
                </nav>

                <footer className="dashboard-sidebar-footer">
                  <Link href="/home" aria-label="Back to PilotSeal" title="Back to PilotSeal" className="dashboard-sidebar-link">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="h-[18px] w-[18px]">
                        <path d="m11.5 4-6 6 6 6" />
                        <path d="M6 10h9" />
                      </svg>
                    </span>
                    <span className="dashboard-sidebar-copy min-w-0 flex-1 truncate">Back to PilotSeal</span>
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

            <div className="dashboard-content min-w-0 flex-1">
              <section ref={mobileNavigationRef} className="dashboard-mobile-navigation" aria-label="Console navigation">
                {workspaceLinks.length > 1 ? (
                  <nav className="dashboard-mobile-workspace-tabs" aria-label="Switch workspace">
                    {workspaceLinks.map((item) => (
                      <Link
                        key={item.workspace}
                        href={item.href}
                        aria-current={workspace === item.workspace ? "page" : undefined}
                        className={workspace === item.workspace ? "dashboard-mobile-workspace-active" : ""}
                        onClick={() => {
                          if (item.workspace === "organization" && organizationContextValue !== activeOrganizationId) {
                            setActiveOrganizationId(organizationContextValue);
                          }
                        }}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </nav>
                ) : null}
                <div className="dashboard-mobile-page-menu">
                  <button
                    ref={mobileMenuButtonRef}
                    type="button"
                    aria-expanded={mobileMenuOpen}
                    aria-controls="dashboard-mobile-page-list"
                    onClick={() => setMobileMenuOpen((open) => !open)}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <DashboardIcon kind={currentLink?.label ?? "Overview"} />
                      <span className="truncate">{currentLink?.label ?? workspaceLabel}</span>
                    </span>
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" />
                    </svg>
                  </button>
                  {mobileMenuOpen ? (
                    <nav id="dashboard-mobile-page-list" aria-label={`${workspaceLabel} pages`}>
                      {visibleDashboardLinks.map((item) => {
                        const active = isDashboardDestinationActive(pathname, item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            className={active ? "dashboard-mobile-page-active" : ""}
                            onClick={() => setMobileMenuOpen(false)}
                          >
                            <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                              <DashboardIcon kind={item.label} />
                              {item.label === "Notifications" && unreadNotificationCount > 0 ? (
                                <span className="dashboard-mobile-notification-badge">{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</span>
                              ) : null}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            {active ? (
                              <svg className="dashboard-mobile-current-mark" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <path d="m4.5 10.5 3.2 3.2 7.8-8" />
                              </svg>
                            ) : null}
                          </Link>
                        );
                      })}
                      <Link
                        href="/home"
                        className="dashboard-mobile-page-exit"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="h-[18px] w-[18px]">
                            <path d="m11.5 4-6 6 6 6" />
                            <path d="M6 10h9" />
                          </svg>
                        </span>
                        <span className="min-w-0 flex-1 truncate">Back to PilotSeal</span>
                      </Link>
                      <button
                        type="button"
                        className="dashboard-mobile-page-signout"
                        disabled={signingOut}
                        onClick={() => void handleSignOut()}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                          <DashboardIcon kind="signout" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {signingOut ? "Signing out..." : "Sign out"}
                        </span>
                      </button>
                    </nav>
                  ) : null}
                </div>
              </section>

              <div className="dashboard-admin-chrome">
                <nav className="dashboard-breadcrumbs" aria-label="Breadcrumb">
                  <span>{workspace === "platform" ? "Platform" : workspace === "organization" ? "Organization" : "Personal"}</span>
                  <span aria-hidden="true">/</span>
                  <span>{currentPageLabel}</span>
                </nav>
              </div>

              {showOrganizationContext ? (
                <div className="dashboard-organization-context">
                  <span>{workspace === "organization" ? "Managing" : "Organization"}</span>
                  <select
                    aria-label="Current organization"
                    value={organizationContextValue}
                    onChange={(event) => setActiveOrganizationId(event.target.value)}
                  >
                    {organizationContextOptions.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {currentLink ? children : null}
            </div>

          </section>
        )}
      </div>
    </main>
  );
}
