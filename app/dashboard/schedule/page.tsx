import CfiScheduleManager from "@/components/dashboard/CfiScheduleManager";

export const metadata = {
  title: "CFI Schedule | PilotSeal",
  description: "Coordinate CFI lessons and student availability.",
};

export default function DashboardSchedulePage() {
  return <CfiScheduleManager />;
}
