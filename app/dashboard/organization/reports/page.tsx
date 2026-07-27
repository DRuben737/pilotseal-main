import { Suspense } from "react";

import ReportsManager from "@/components/dashboard/ReportsManager";

export const metadata = {
  title: "Organization Safety Reports | PilotSeal",
  description:
    "Submit and manage organization aircraft discrepancy and ASR reports.",
};

export default function OrganizationReportsPage() {
  return (
    <Suspense
      fallback={(
        <section className="saas-panel">
          <p className="saas-empty-state">Loading safety reports…</p>
        </section>
      )}
    >
      <ReportsManager />
    </Suspense>
  );
}
