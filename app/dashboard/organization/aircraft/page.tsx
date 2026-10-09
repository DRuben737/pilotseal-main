import OrganizationManager from "@/components/dashboard/OrganizationManager";
import { AdminPageHeader } from "@/components/admin/AdminConsole";
import { Suspense } from "react";
export const metadata = { title: "Organization Aircraft | PilotSeal" };
export default function Page() { return <div className="grid gap-3"><AdminPageHeader eyebrow="Organization" title="Aircraft" /><Suspense fallback={null}><OrganizationManager view="fleet" /></Suspense></div>; }
