import { Suspense } from "react";

import AircraftAdminPanel from "@/components/dashboard/AircraftAdminPanel";

export const metadata = { title: "Aircraft" };

export default function Page() {
  return <Suspense fallback={null}><AircraftAdminPanel /></Suspense>;
}
