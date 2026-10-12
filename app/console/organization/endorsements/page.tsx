import { Suspense } from "react";

import OrganizationEndorsementsWorkspace from "@/components/dashboard/OrganizationEndorsementsWorkspace";

export const metadata = { title: "Organization Endorsements" };

export default function Page() {
  return <Suspense fallback={null}><OrganizationEndorsementsWorkspace /></Suspense>;
}
