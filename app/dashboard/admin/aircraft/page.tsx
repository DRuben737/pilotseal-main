import AircraftAdminPanel from "@/components/dashboard/AircraftAdminPanel";

export const metadata = {
  title: "Aircraft Admin | PilotSeal",
  description: "Create, edit, and remove aircraft definitions for PilotSeal tools.",
};

export default function DashboardAircraftAdminPage() {
  return <AircraftAdminPanel />;
}
