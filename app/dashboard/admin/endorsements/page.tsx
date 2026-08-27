import EndorsementTemplateAdminPanel from "@/components/dashboard/EndorsementTemplateAdminPanel";
import LegacyEndorsementReviewPanel from "@/components/dashboard/LegacyEndorsementReviewPanel";

export const metadata = {
  title: "Endorsement Templates Admin | PilotSeal",
  description: "Create, edit, and publish endorsement generator templates.",
};

export default function DashboardEndorsementsAdminPage() {
  return (
    <>
      <LegacyEndorsementReviewPanel />
      <EndorsementTemplateAdminPanel />
    </>
  );
}
