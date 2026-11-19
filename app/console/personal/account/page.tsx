import { AdminPageHeader } from "@/components/admin/AdminConsole";
import AccountSettingsPanel from "@/components/dashboard/AccountSettingsPanel";
import OrganizationMembershipSettings from "@/components/dashboard/OrganizationMembershipSettings";

export const metadata = { title: "Account" };

export default function Page() {
  return <div className="grid gap-3"><AdminPageHeader title="Account" /><AccountSettingsPanel /><OrganizationMembershipSettings /></div>;
}
