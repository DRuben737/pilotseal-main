import { Suspense } from "react";
import OrganizationEndorsementsWorkspace from "@/components/dashboard/OrganizationEndorsementsWorkspace";

export const metadata = { title: "Organization Endorsements | PilotSeal" };

export default function Page() {
  return <Suspense fallback={null}><OrganizationEndorsementsWorkspace /></Suspense>;
}
