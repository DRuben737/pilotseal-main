import type { OrganizationPermission } from "@/lib/organizations";

export type DashboardNavAccess = "all" | "organization" | "organization-manager" | "platform";
export type DashboardWorkspace = "personal" | "organization" | "platform";

export type DashboardNavItem = {
  href: string;
  label: string;
  access: DashboardNavAccess;
  featureId?: "cfi_schedule";
  organizationPermission?: OrganizationPermission;
};

export const dashboardPrimaryNavigation: DashboardNavItem[] = [
  { href: "/dashboard/schedule", label: "Schedule", access: "all", featureId: "cfi_schedule" },
  { href: "/dashboard/saved-people", label: "People", access: "all" },
  { href: "/dashboard/my-aircraft", label: "Aircraft", access: "all" },
  { href: "/dashboard/reports", label: "Safety Reports", access: "all" },
  { href: "/dashboard/records", label: "Records", access: "all" },
  { href: "/dashboard/notifications", label: "Notifications", access: "all" },
  { href: "/dashboard/account-settings", label: "Account", access: "all" },
];

export const dashboardOrganizationNavigation: DashboardNavItem[] = [
  { href: "/dashboard/organization/fleet", label: "Fleet management", access: "organization-manager", organizationPermission: "fleet" },
  { href: "/dashboard/organization/people", label: "Members", access: "organization-manager", organizationPermission: "members" },
  { href: "/dashboard/organization/endorsements", label: "Endorsement approvals", access: "organization-manager", organizationPermission: "endorsements" },
  { href: "/dashboard/organization/audit", label: "Audit Log", access: "organization-manager", organizationPermission: "audit" },
];

export const dashboardPlatformNavigation: DashboardNavItem[] = [
  { href: "/dashboard/admin/overview", label: "Platform Overview", access: "platform" },
  { href: "/dashboard/admin/access", label: "Organizations & Access", access: "platform" },
  { href: "/dashboard/admin/aircraft", label: "Aircraft Library", access: "platform" },
  { href: "/dashboard/admin/aircraft-assignments", label: "Aircraft Assignments", access: "platform" },
  { href: "/dashboard/admin/endorsements", label: "Endorsement Approvals", access: "platform" },
  { href: "/dashboard/admin/notifications", label: "Platform Notices", access: "platform" },
  { href: "/dashboard/admin/audit", label: "Audit Log", access: "platform" },
];

export function isDashboardDestinationActive(pathname: string, href: string) {
  return href === "/dashboard"
    ? pathname === "/dashboard"
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function getDashboardWorkspace(pathname: string): DashboardWorkspace {
  if (pathname.startsWith("/dashboard/admin")) return "platform";
  if (pathname.startsWith("/dashboard/organization")) return "organization";
  return "personal";
}

export function getPersonalDashboardHref(enabledFeatureIds: readonly string[]) {
  return enabledFeatureIds.includes("cfi_schedule")
    ? "/dashboard/schedule"
    : "/dashboard/account-settings";
}

export type DashboardWorkspaceLink = {
  href: string;
  label: string;
  workspace: DashboardWorkspace;
};

export function getDashboardWorkspaceLinks(input: {
  canManageOrganization: boolean;
  enabledFeatureIds: readonly string[];
  isPlatformAdmin: boolean;
  organizationPermissions?: readonly OrganizationPermission[];
}): DashboardWorkspaceLink[] {
  return [
    {
      href: getPersonalDashboardHref(input.enabledFeatureIds),
      label: "Personal",
      workspace: "personal" as const,
    },
    ...(input.canManageOrganization
      ? [{
          href: getOrganizationDashboardHref(input.organizationPermissions ?? []),
          label: "Organization",
          workspace: "organization" as const,
        }]
      : []),
    ...(input.isPlatformAdmin
      ? [{
          href: "/dashboard/admin/overview",
          label: "Platform",
          workspace: "platform" as const,
        }]
      : []),
  ];
}

export function getDashboardLinksForWorkspace(input: {
  enabledFeatureIds: readonly string[];
  workspace: DashboardWorkspace;
  organizationPermissions?: readonly OrganizationPermission[];
}) {
  if (input.workspace === "organization") {
    return dashboardOrganizationNavigation.filter(
      (item) => !item.organizationPermission || input.organizationPermissions?.includes(item.organizationPermission)
    );
  }
  if (input.workspace === "platform") return dashboardPlatformNavigation;
  return dashboardPrimaryNavigation.filter(
    (item) => !item.featureId || input.enabledFeatureIds.includes(item.featureId)
  );
}

export function getOrganizationDashboardHref(permissions: readonly OrganizationPermission[]) {
  return dashboardOrganizationNavigation.find(
    (item) => item.organizationPermission && permissions.includes(item.organizationPermission)
  )?.href ?? "/dashboard/account-settings";
}
