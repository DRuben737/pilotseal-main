import MyAircraftManager from "@/components/dashboard/MyAircraftManager";

export const metadata = {
  title: "My Aircraft | PilotSeal",
  description: "Add shared aircraft to your account and submit weight-and-balance updates.",
};

export default function DashboardMyAircraftPage() {
  return <MyAircraftManager />;
}
