import OrganizationManager from "@/components/dashboard/OrganizationManager";
import OrganizationRolePermissions from "@/components/dashboard/OrganizationRolePermissions";
import { AdminPageHeader } from "@/components/admin/AdminConsole";
import { Suspense } from "react";

export const metadata = { title: "Organization People | PilotSeal" };

export default function Page() {
  return (
    <div className="grid min-w-0 gap-3">
      <AdminPageHeader eyebrow="Organization" title="People" action={<OrganizationRolePermissions />} />
      <Suspense fallback={null}><OrganizationManager view="people" /></Suspense>
    </div>
  );
}
