"use client";

import AircraftReportsManager from "@/components/dashboard/AircraftReportsManager";
import AsrReportsManager from "@/components/dashboard/AsrReportsManager";
import { ManagementTabs } from "@/components/admin/AdminConsole";
import { usePersistentDashboardView } from "@/components/admin/usePersistentDashboardView";

export default function ReportsManager() {
  const [activeType, setActiveType] = usePersistentDashboardView({
    defaultValue: "aircraft",
    param: "type",
    storageKey: "reports",
    values: ["aircraft", "asr"] as const,
  });

  return (
    <div className="space-y-3">
      <ManagementTabs
        id="reports-workspace"
        label="Report type"
        items={[{ id: "aircraft", label: "Aircraft reports" }, { id: "asr", label: "Safety reports" }]}
        activeId={activeType}
        onChange={(id) => setActiveType(id as typeof activeType)}
      >
      {activeType === "aircraft" ? <AircraftReportsManager /> : <AsrReportsManager />}
      </ManagementTabs>
    </div>
  );
}
