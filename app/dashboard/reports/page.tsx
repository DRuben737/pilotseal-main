import { Suspense } from "react";

import ReportsManager from "@/components/dashboard/ReportsManager";

export const metadata = {
  title: "Safety Reports | PilotSeal",
  description:
    "Submit and manage organization aircraft discrepancy and aviation safety reports.",
};

export default function DashboardReportsPage() {
  return (
    <Suspense fallback={<section className="saas-panel"><p className="saas-empty-state">Loading reports…</p></section>}>
      <ReportsManager />
    </Suspense>
  );
}
