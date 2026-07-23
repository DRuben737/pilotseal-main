import EndorsementRecordsManager from "@/components/dashboard/EndorsementRecordsManager";
import PreflightRecordsManager from "@/components/dashboard/PreflightRecordsManager";

export const metadata = {
  title: "Records | PilotSeal",
  description: "View saved endorsement and preflight records.",
};

export default function DashboardRecordsPage() {
  return (
    <div className="grid gap-6">
      <PreflightRecordsManager />
      <EndorsementRecordsManager />
    </div>
  );
}
