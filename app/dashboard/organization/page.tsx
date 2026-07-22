import OrganizationManager from "@/components/dashboard/OrganizationManager";

export const metadata = {
  title: "Organization | PilotSeal",
  description: "Manage your organization members and shared fleet.",
};

export default function DashboardOrganizationPage() {
  return <OrganizationManager />;
}
