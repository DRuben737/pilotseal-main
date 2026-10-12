import { Suspense } from "react";

import { AdminPageHeader } from "@/components/admin/AdminConsole";
import OrganizationManager from "@/components/dashboard/OrganizationManager";

export const metadata = { title: "Organization Aircraft" };

export default function Page() {
  return <div className="grid gap-3"><AdminPageHeader eyebrow="Organization" title="Aircraft" /><Suspense fallback={null}><OrganizationManager view="fleet" /></Suspense></div>;
}
