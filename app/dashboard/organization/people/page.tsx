import OrganizationManager from "@/components/dashboard/OrganizationManager";
import OrganizationRolePermissions from "@/components/dashboard/OrganizationRolePermissions";

export default function Page() {
  return (
    <div className="grid min-w-0 gap-3">
      <OrganizationRolePermissions />
      <OrganizationManager view="people" />
    </div>
  );
}
