"use client";

import { AdminPageHeader, ManagementTabs } from "@/components/admin/AdminConsole";
import { usePersistentDashboardView } from "@/components/admin/usePersistentDashboardView";
import PlatformAccessManager from "@/components/dashboard/PlatformAccessManager";
import AssignmentAuditLog from "@/components/dashboard/AssignmentAuditLog";

export default function PlatformActivityWorkspace() {
  const [activeView, setActiveView] = usePersistentDashboardView({
    defaultValue: "access",
    storageKey: "platform-activity",
    values: ["access", "aircraft"] as const,
  });

  return (
    <div className="grid gap-3">
      <AdminPageHeader eyebrow="Platform administration" title="Activity" />
      <ManagementTabs
        id="platform-activity"
        label="Platform activity type"
        items={[{ id: "access", label: "Access activity" }, { id: "aircraft", label: "Aircraft activity" }]}
        activeId={activeView}
        onChange={(id) => setActiveView(id as typeof activeView)}
      >
        {activeView === "access" ? <PlatformAccessManager activityOnly embedded /> : null}
        {activeView === "aircraft" ? <AssignmentAuditLog platform embedded /> : null}
      </ManagementTabs>
    </div>
  );
}
