import { Suspense } from "react";

import { AdminPageHeader } from "@/components/admin/AdminConsole";
import OrganizationManager from "@/components/dashboard/OrganizationManager";
import OrganizationRolePermissions from "@/components/dashboard/OrganizationRolePermissions";

export const metadata = { title: "Team Management" };

export default function Page() {
  return <div className="grid min-w-0 gap-3"><AdminPageHeader eyebrow="Organization" title="Team management" /><Suspense fallback={null}><OrganizationManager view="people" peopleActions={<OrganizationRolePermissions />} /></Suspense></div>;
}
