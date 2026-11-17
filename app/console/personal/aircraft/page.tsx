import { Suspense } from "react";

import { AdminPageHeader } from "@/components/admin/AdminConsole";
import MyAircraftManager from "@/components/dashboard/MyAircraftManager";

export const metadata = { title: "Aircraft" };

export default function Page() {
  return <div className="grid gap-3"><AdminPageHeader eyebrow="Personal" title="Aircraft" /><Suspense fallback={null}><MyAircraftManager /></Suspense></div>;
}
