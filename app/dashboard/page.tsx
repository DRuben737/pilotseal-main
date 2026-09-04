import { redirect } from "next/navigation";

export const metadata = {
  title: "Schedule | PilotSeal",
  description: "Open your personal schedule.",
};

export default function DashboardPage() {
  redirect("/dashboard/schedule");
}
