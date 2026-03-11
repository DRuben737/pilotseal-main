import SavedPeopleManager from "@/components/dashboard/SavedPeopleManager";

export const metadata = {
  title: "Saved People | PilotSeal",
  description: "Manage saved CFI and student profiles.",
};

export default function DashboardSavedPeoplePage() {
  return <SavedPeopleManager />;
}
