import SavedPeopleManager from "@/components/dashboard/SavedPeopleManager";

export const metadata = {
  title: "People | PilotSeal",
  description: "Manage saved people, certificates, and currency dates.",
};

export default function DashboardSavedPeoplePage() {
  return <SavedPeopleManager />;
}
