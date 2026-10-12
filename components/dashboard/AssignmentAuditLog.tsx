"use client";

import { useEffect, useState } from "react";
import { AdminDataTable, AdminPageHeader, EmptyState, ManagementDisclosure, StatusBadge } from "@/components/admin/AdminConsole";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import { fetchAircraftAssignmentAudit, type AircraftAssignmentAuditEntry } from "@/lib/aircraft";
import { formatUsDateTime } from "@/lib/date-format";
import { hasOrganizationPermission } from "@/lib/organizations";

export default function AssignmentAuditLog({
  platform = false,
  embedded = false,
  flat = false,
}: {
  platform?: boolean;
  embedded?: boolean;
  flat?: boolean;
}) {
  const { activeOrganization } = useOrganization();
  const canView = platform || hasOrganizationPermission(activeOrganization, "audit");
  const [entries, setEntries] = useState<AircraftAssignmentAuditEntry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const organizationId = platform ? null : activeOrganization?.id;
    let cancelled = false;
    async function load() {
      if (!canView || (!platform && !organizationId)) {
        if (!cancelled) { setEntries([]); setLoading(false); }
        return;
      }
      try {
        const nextEntries = await fetchAircraftAssignmentAudit(organizationId);
        if (!cancelled) setEntries(nextEntries);
      } catch (value) {
        if (!cancelled) setError(value instanceof Error ? value.message : "Unable to load the audit log.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [activeOrganization?.id, canView, platform]);
  if (!canView) return <div className="saas-panel">You do not have permission to view this organization audit log.</div>;
  const columnCount = platform ? 4 : 3;
  const table = <AdminDataTable label="Aircraft assignment history"><thead><tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><th className="px-4 py-3">Time</th><th className="px-4 py-3">Aircraft</th>{platform ? <th className="px-4 py-3">Organization</th> : null}<th className="px-4 py-3">Action</th></tr></thead><tbody>{loading ? <tr><td colSpan={columnCount} className="p-8 text-center text-slate-500">Loading history…</td></tr> : null}{!loading && !entries.length ? <tr><td colSpan={columnCount}><EmptyState title="No assignment history" description="Aircraft access changes will appear here." /></td></tr> : entries.map((entry) => <tr key={entry.id} className="border-b border-slate-100"><td className="px-4 py-3 text-slate-500">{formatUsDateTime(entry.created_at)}</td><td className="px-4 py-3 font-semibold text-slate-900">{entry.aircraft_tail_number}</td>{platform ? <td className="px-4 py-3">{entry.organization_name}</td> : null}<td className="px-4 py-3"><StatusBadge tone={entry.action === "assigned" ? "success" : "warning"}>{entry.action === "assigned" ? "Assigned" : "Unassigned"}</StatusBadge></td></tr>)}</tbody></AdminDataTable>;
  if (flat) return <div className="space-y-3">{error ? <p role="alert" className="border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}{table}</div>;
  return <section className="space-y-3">{!embedded ? <AdminPageHeader eyebrow={platform ? "Platform administration" : activeOrganization?.name} title="Activity" /> : null}{error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}<ManagementDisclosure id={platform ? "platform-assignment-audit" : "organization-assignment-audit"} title="Aircraft activity" summary={loading ? "Loading…" : `${entries.length}`}>{table}</ManagementDisclosure></section>;
}
