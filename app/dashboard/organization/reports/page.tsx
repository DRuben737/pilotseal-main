import { Suspense } from "react";
import ReportsManager from "@/components/dashboard/ReportsManager";
import { AdminPageHeader } from "@/components/admin/AdminConsole";
export const metadata = { title: "Organization Reports | PilotSeal" };
export default function Page() { return <div className="grid gap-3"><AdminPageHeader eyebrow="Organization" title="Reports" /><Suspense fallback={null}><ReportsManager /></Suspense></div>; }
