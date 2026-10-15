"use client";

import { useOrganization } from "@/components/organizations/OrganizationProvider";
import NotificationPublicationManager from "@/components/notifications/NotificationPublicationManager";
import { hasOrganizationPermission } from "@/lib/organizations";

export default function OrganizationNotificationPublisher({ activeOrganizationOnly = false }: { activeOrganizationOnly?: boolean }) {
  const { activeOrganizationId, activeOrganization, organizations, setActiveOrganizationId, loading } = useOrganization();
  const managed = organizations.filter(o => hasOrganizationPermission(o, "notifications"));
  const publishing = activeOrganizationOnly ? (hasOrganizationPermission(activeOrganization, "notifications") ? activeOrganization : null) : managed.find(o => o.id === activeOrganizationId) ?? managed[0] ?? null;
  if (loading) return <p className="saas-panel">Loading organization…</p>;
  if (!publishing) return activeOrganizationOnly ? <p className="saas-panel">You do not have permission to publish notifications for this organization.</p> : null;
  return <div className="grid min-w-0 gap-4">
    {!activeOrganizationOnly && managed.length > 1 ? <label className="dashboard-notification-organization-picker"><span>Publishing for</span><select aria-label="Organization to notify" value={publishing.id} onChange={e => setActiveOrganizationId(e.target.value)}>{managed.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label> : null}
    <NotificationPublicationManager key={publishing.id} organizationId={publishing.id} sourceName={publishing.name} />
  </div>;
}
