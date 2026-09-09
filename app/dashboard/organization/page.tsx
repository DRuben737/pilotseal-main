import { redirect } from "next/navigation";

export const metadata = {
  title: "Organization | PilotSeal",
  description: "Manage your organization members and shared fleet.",
};

export default function DashboardOrganizationPage() {
  redirect("/dashboard");
}
