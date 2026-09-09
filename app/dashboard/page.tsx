import DashboardOverview from "@/components/dashboard/DashboardOverview";

export const metadata = {
  title: "Dashboard | PilotSeal",
  description: "View your schedule, records, people, aircraft, and organization activity.",
};

export default function DashboardPage() {
  return <DashboardOverview />;
}
