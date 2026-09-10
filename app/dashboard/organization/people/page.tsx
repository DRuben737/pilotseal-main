import OrganizationManager from "@/components/dashboard/OrganizationManager";
import OrganizationRolePermissions from "@/components/dashboard/OrganizationRolePermissions";

export default function Page() {
  return (
    <div className="grid gap-3">
      <OrganizationRolePermissions />
      <OrganizationManager view="people" />
    </div>
  );
}
