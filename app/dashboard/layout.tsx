import DashboardShell from "@/components/dashboard/DashboardShell";
import OrganizationProvider from "@/components/organizations/OrganizationProvider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OrganizationProvider>
      <DashboardShell>{children}</DashboardShell>
    </OrganizationProvider>
  );
}
