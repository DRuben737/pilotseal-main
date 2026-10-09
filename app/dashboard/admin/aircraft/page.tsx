import AircraftAdminPanel from "@/components/dashboard/AircraftAdminPanel";
import { Suspense } from "react";

export const metadata = {
  title: "Aircraft | PilotSeal",
  description: "Create, edit, and remove aircraft definitions for PilotSeal tools.",
};

export default function DashboardAircraftAdminPage() {
  return <Suspense fallback={null}><AircraftAdminPanel /></Suspense>;
}
