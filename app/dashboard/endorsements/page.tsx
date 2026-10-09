import { Suspense } from "react";
import EndorsementRecordsManager from "@/components/dashboard/EndorsementRecordsManager";
export const metadata = { title: "Endorsements | PilotSeal" };
export default function Page() { return <Suspense fallback={null}><EndorsementRecordsManager /></Suspense>; }
