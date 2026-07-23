import PlatformAccessManager from "@/components/dashboard/PlatformAccessManager";

export const metadata = {
  title: "Platform Access | PilotSeal",
  description: "Manage PilotSeal platform administrator access and review its audit trail.",
};

export default function DashboardPlatformAccessPage() {
  return <PlatformAccessManager />;
}
