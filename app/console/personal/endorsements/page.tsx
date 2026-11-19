import { Suspense } from "react";

import { AdminPageHeader } from "@/components/admin/AdminConsole";
import EndorsementRecordsManager from "@/components/dashboard/EndorsementRecordsManager";

export const metadata = { title: "Records" };

export default function Page() {
  return <div className="grid gap-3"><AdminPageHeader title="Endorsements" /><Suspense fallback={null}><EndorsementRecordsManager /></Suspense></div>;
}
