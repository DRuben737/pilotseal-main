import { Suspense } from "react";

import { AdminPageHeader } from "@/components/admin/AdminConsole";
import ReportsManager from "@/components/dashboard/ReportsManager";

export const metadata = { title: "Organization Reports" };

export default function Page() {
  return <div className="grid gap-3"><AdminPageHeader eyebrow="Organization" title="Reports" /><Suspense fallback={null}><ReportsManager /></Suspense></div>;
}
