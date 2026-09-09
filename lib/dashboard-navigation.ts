export type DashboardNavAccess = "all" | "organization" | "organization-manager" | "platform";

export type DashboardNavItem = {
  href: string;
  label: string;
  access: DashboardNavAccess;
  featureId?: "cfi_schedule";
};

export const dashboardPrimaryNavigation: DashboardNavItem[] = [
  { href: "/dashboard", label: "Dashboard", access: "all" },
  { href: "/dashboard/schedule", label: "Schedule", access: "all", featureId: "cfi_schedule" },
  { href: "/dashboard/saved-people", label: "People", access: "all" },
  { href: "/dashboard/my-aircraft", label: "Aircraft", access: "all" },
  { href: "/dashboard/reports", label: "Safety Reports", access: "all" },
  { href: "/dashboard/records", label: "Records", access: "all" },
  { href: "/dashboard/notifications", label: "Notifications", access: "all" },
  { href: "/dashboard/account-settings", label: "Account", access: "all" },
];

export const dashboardOrganizationNavigation: DashboardNavItem[] = [
  { href: "/dashboard/organization/people", label: "Members", access: "organization" },
  { href: "/dashboard/organization/fleet", label: "Fleet management", access: "organization" },
  { href: "/dashboard/organization/endorsements", label: "Endorsement approvals", access: "organization-manager" },
  { href: "/dashboard/organization/messages", label: "Messages", access: "organization-manager" },
  { href: "/dashboard/organization/audit", label: "Audit Log", access: "organization-manager" },
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
