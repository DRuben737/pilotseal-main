import CfiScheduleManager from "@/components/dashboard/CfiScheduleManager";

export const metadata = {
  title: "Schedule | PilotSeal",
  description: "Plan lessons and student availability.",
};

export default function DashboardSchedulePage() {
  return <CfiScheduleManager />;
}
