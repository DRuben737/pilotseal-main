import AccountSettingsPanel from "@/components/dashboard/AccountSettingsPanel";
import OrganizationMembershipSettings from "@/components/dashboard/OrganizationMembershipSettings";

export const metadata = { title: "Account" };

export default function Page() {
  return <div className="grid gap-4"><AccountSettingsPanel /><OrganizationMembershipSettings /></div>;
}
