"use client";

import { AdminPageHeader, ManagementTabs } from "@/components/admin/AdminConsole";
import { usePersistentDashboardView } from "@/components/admin/usePersistentDashboardView";
import OrganizationManager from "@/components/dashboard/OrganizationManager";

export default function OrganizationEndorsementsWorkspace() {
  const [activeView, setActiveView] = usePersistentDashboardView({
    defaultValue: "records",
    storageKey: "organization-endorsements",
    values: ["records", "requests"] as const,
  });

  return (
    <div className="grid gap-3">
      <AdminPageHeader eyebrow="Organization" title="Endorsements" />
      <ManagementTabs
        id="organization-endorsements"
        label="Organization endorsement sections"
        items={[{ id: "records", label: "Issued endorsements" }, { id: "requests", label: "Change requests" }]}
        activeId={activeView}
        onChange={(id) => setActiveView(id as typeof activeView)}
      >
        <OrganizationManager view="endorsements" endorsementView={activeView} />
      </ManagementTabs>
    </div>
  );
}
