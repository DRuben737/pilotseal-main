import MyAircraftManager from "@/components/dashboard/MyAircraftManager";

export const metadata = {
  title: "My Aircraft | PilotSeal",
  description: "Attach shared aircraft to your account and submit W&B updates.",
};

export default function DashboardMyAircraftPage() {
  return <MyAircraftManager />;
}
