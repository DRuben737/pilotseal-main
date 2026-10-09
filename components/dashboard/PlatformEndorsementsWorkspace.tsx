"use client";

import { AdminPageHeader, ManagementTabs } from "@/components/admin/AdminConsole";
import { usePersistentDashboardView } from "@/components/admin/usePersistentDashboardView";
import EndorsementTemplateAdminPanel from "@/components/dashboard/EndorsementTemplateAdminPanel";
import LegacyEndorsementReviewPanel from "@/components/dashboard/LegacyEndorsementReviewPanel";

export default function PlatformEndorsementsWorkspace() {
  const [activeView, setActiveView] = usePersistentDashboardView({
    defaultValue: "requests",
    storageKey: "platform-endorsements",
    values: ["requests", "templates", "legacy"] as const,
  });

  return (
    <div className="grid gap-3">
      <AdminPageHeader eyebrow="Platform administration" title="Endorsements" />
      <ManagementTabs
        id="platform-endorsements"
        label="Endorsement sections"
        items={[{ id: "requests", label: "Requests" }, { id: "templates", label: "Templates" }, { id: "legacy", label: "Legacy review" }]}
        activeId={activeView}
        onChange={(id) => setActiveView(id as typeof activeView)}
      >
        {activeView === "requests" ? <EndorsementTemplateAdminPanel view="requests" /> : null}
        {activeView === "templates" ? <EndorsementTemplateAdminPanel view="templates" /> : null}
        {activeView === "legacy" ? <LegacyEndorsementReviewPanel /> : null}
      </ManagementTabs>
    </div>
  );
}
