import { Suspense } from "react";

import EndorsementRecordsManager from "@/components/dashboard/EndorsementRecordsManager";

export const metadata = { title: "Records" };

export default function Page() {
  return <Suspense fallback={null}><EndorsementRecordsManager /></Suspense>;
}
