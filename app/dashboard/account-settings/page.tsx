import AccountSettingsPanel from "@/components/dashboard/AccountSettingsPanel";
import OrganizationMembershipSettings from "@/components/dashboard/OrganizationMembershipSettings";

export const metadata = {
  title: "Account Settings | PilotSeal",
  description: "View session and account settings for PilotSeal.",
};

export default function DashboardAccountSettingsPage() {
  return (
    <div className="grid gap-4">
      <AccountSettingsPanel />
      <OrganizationMembershipSettings />
    </div>
  );
}
