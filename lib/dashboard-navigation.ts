import type { OrganizationPermission } from "@/lib/organizations";

export type DashboardNavAccess =
  "all" | "organization" | "organization-manager" | "platform";
export type DashboardWorkspace = "personal" | "organization" | "platform";

export type DashboardNavChild = {
  label: string;
  param?: "view" | "type";
  value: string;
  default?: boolean;
  organizationRequired?: boolean;
  organizationManagerOnly?: boolean;
  organizationPermission?: OrganizationPermission;
};

export type DashboardNavItem = {
  href: string;
  label: string;
  access: DashboardNavAccess;
  featureId?: "cfi_schedule";
  organizationPermission?: OrganizationPermission;
  children?: readonly DashboardNavChild[];
};

export const dashboardPrimaryNavigation: DashboardNavItem[] = [
  {
    href: "/console/personal/schedule",
    label: "Schedule",
    access: "all",
    featureId: "cfi_schedule",
  },
  {
    href: "/console/personal/training-guide",
    label: "Training Guide",
    access: "all",
  },
  { href: "/console/personal/people", label: "People", access: "all" },
  {
    href: "/console/personal/aircraft",
    label: "Aircraft",
    access: "all",
    children: [
      { label: "My aircraft", value: "mine", default: true },
      {
        label: "Organization aircraft",
        value: "organization",
        organizationRequired: true,
      },
    ],
  },
  {
    href: "/console/personal/reports",
    label: "Reports",
    access: "all",
    children: [
      {
        label: "Aircraft reports",
        param: "type",
        value: "aircraft",
        default: true,
      },
      { label: "Safety reports", param: "type", value: "asr" },
    ],
  },
  {
    href: "/console/personal/flight-briefs",
    label: "Flight Briefs",
    access: "all",
  },
  {
    href: "/console/personal/endorsements",
    label: "Records",
    access: "all",
    children: [
      { label: "Student records", value: "personal", default: true },
      { label: "Shared with me", value: "received" },
      {
        label: "Organization endorsements",
        value: "organization",
        organizationManagerOnly: true,
      },
    ],
  },
  {
    href: "/console/personal/notifications",
    label: "Notifications",
    access: "all",
  },
  { href: "/console/personal/account", label: "Account", access: "all" },
];

export const dashboardOrganizationNavigation: DashboardNavItem[] = [
  {
    href: "/console/organization/training-guide",
    label: "Training Guide",
    access: "organization",
  },
  {
    href: "/console/organization/people",
    label: "Team management",
    access: "organization-manager",
    organizationPermission: "members",
    children: [
      { label: "Instructors", value: "instructors", default: true },
      { label: "Students", value: "students" },
      { label: "Unassigned", value: "unassigned" },
      { label: "Invitations", value: "invitations" },
    ],
  },
  {
    href: "/console/organization/aircraft",
    label: "Aircraft",
    access: "organization",
    children: [
      {
        label: "Aircraft",
        value: "aircraft",
        default: true,
        organizationManagerOnly: true,
      },
      { label: "Aircraft records", value: "records" },
      { label: "Models", value: "models", organizationManagerOnly: true },
      {
        label: "Maintenance items",
        value: "inspections",
        organizationManagerOnly: true,
      },
    ],
  },
  {
    href: "/console/organization/reports",
    label: "Reports",
    access: "organization",
    children: [
      {
        label: "Aircraft reports",
        param: "type",
        value: "aircraft",
        default: true,
      },
      { label: "Safety reports", param: "type", value: "asr" },
    ],
  },
  {
    href: "/console/organization/endorsements",
    label: "Endorsements",
    access: "organization-manager",
    organizationPermission: "endorsements",
    children: [
      { label: "Issued endorsements", value: "records", default: true },
      { label: "Change requests", value: "requests" },
    ],
  },
  {
    href: "/console/organization/notifications",
    label: "Notifications",
    access: "organization-manager",
    organizationPermission: "notifications",
  },
];

export const dashboardPlatformNavigation: DashboardNavItem[] = [
  {
    href: "/console/platform/training-guide",
    label: "Training Guide",
    access: "platform",
  },
  {
    href: "/console/platform/organizations",
    label: "Organizations",
    access: "platform",
    children: [
      { label: "Requests", value: "requests" },
      { label: "Organizations", value: "organizations", default: true },
      { label: "Platform admins", value: "admins" },
    ],
  },
  {
    href: "/console/platform/aircraft",
    label: "Aircraft",
    access: "platform",
    children: [
      { label: "Models", value: "models" },
      { label: "Aircraft", value: "aircraft", default: true },
      { label: "W&B requests", value: "requests" },
      { label: "Assignments", value: "assignments" },
    ],
  },
  {
    href: "/console/platform/endorsements",
    label: "Endorsements",
    access: "platform",
    children: [
      { label: "Requests", value: "requests", default: true },
      { label: "Templates", value: "templates" },
      { label: "Legacy review", value: "legacy" },
    ],
  },
  { href: "/console/platform/notices", label: "Notices", access: "platform" },
  {
    href: "/console/platform/activity",
    label: "Activity",
    access: "platform",
    children: [
      { label: "Access activity", value: "access", default: true },
      { label: "Aircraft activity", value: "aircraft" },
    ],
  },
];

export function getDashboardNavChildHref(
  item: DashboardNavItem,
  child: DashboardNavChild,
) {
  const param = child.param ?? "view";
  return `${item.href}?${param}=${encodeURIComponent(child.value)}`;
}

export function isDashboardDestinationActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getDashboardWorkspace(pathname: string): DashboardWorkspace {
  if (pathname.startsWith("/console/platform")) return "platform";
  if (pathname.startsWith("/console/organization")) return "organization";
  return "personal";
}

export function getPersonalDashboardHref(enabledFeatureIds: readonly string[]) {
  return enabledFeatureIds.includes("cfi_schedule")
    ? "/console/personal/schedule"
    : "/console/personal/people";
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
      ? [
          {
            href: getOrganizationDashboardHref(
              input.organizationPermissions ?? [],
            ),
            label: "Organization",
            workspace: "organization" as const,
          },
        ]
      : []),
    ...(input.isPlatformAdmin
      ? [
          {
            href: "/console/platform/organizations",
            label: "Platform",
            workspace: "platform" as const,
          },
        ]
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
      (item) =>
        !item.organizationPermission ||
        input.organizationPermissions?.includes(item.organizationPermission),
    );
  }
  if (input.workspace === "platform") return dashboardPlatformNavigation;
  return dashboardPrimaryNavigation.filter(
    (item) =>
      !item.featureId || input.enabledFeatureIds.includes(item.featureId),
  );
}

export function getOrganizationDashboardHref(
  permissions: readonly OrganizationPermission[],
) {
  return (
    dashboardOrganizationNavigation.find(
      (item) =>
        item.organizationPermission &&
        permissions.includes(item.organizationPermission),
    )?.href ?? "/console/organization/aircraft"
  );
}
