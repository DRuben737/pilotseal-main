import EndorsementRecordsManager from "@/components/dashboard/EndorsementRecordsManager";

export const metadata = {
  title: "Records | PilotSeal",
  description: "View saved endorsement PDF records.",
};

export default function DashboardRecordsPage() {
  return <EndorsementRecordsManager />;
}
