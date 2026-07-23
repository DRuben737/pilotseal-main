"use client";

import { useEffect, useState } from "react";
import { AdminDataTable, AdminPageHeader, EmptyState, StatusBadge } from "@/components/admin/AdminConsole";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import { fetchAircraftAssignmentAudit, type AircraftAssignmentAuditEntry } from "@/lib/aircraft";

export default function AssignmentAuditLog({ platform = false }: { platform?: boolean }) {
  const { activeOrganization } = useOrganization();
  const [entries, setEntries] = useState<AircraftAssignmentAuditEntry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const organizationId = platform ? null : activeOrganization?.id;
    let cancelled = false;
    async function load() {
      if (!platform && !organizationId) {
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
  }, [activeOrganization?.id, platform]);
  return <section className="space-y-5"><AdminPageHeader eyebrow={platform ? "Platform administration" : activeOrganization?.name} title="Audit Log" description="Immutable aircraft organization-access changes, newest first." />{error ? <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p> : null}<AdminDataTable label="Aircraft assignment audit log"><thead><tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><th className="px-4 py-3">Time</th><th className="px-4 py-3">Aircraft</th><th className="px-4 py-3">Organization</th><th className="px-4 py-3">Action</th></tr></thead><tbody>{loading ? <tr><td colSpan={4} className="p-8 text-center text-slate-500">Loading audit log…</td></tr> : null}{!loading && !entries.length ? <tr><td colSpan={4}><EmptyState title="No assignment changes" description="Aircraft access changes will appear here." /></td></tr> : entries.map((entry) => <tr key={entry.id} className="border-b border-slate-100"><td className="px-4 py-3 text-slate-500">{new Date(entry.created_at).toLocaleString()}</td><td className="px-4 py-3 font-semibold text-slate-900">{entry.aircraft_tail_number}</td><td className="px-4 py-3">{entry.organization_name}</td><td className="px-4 py-3"><StatusBadge tone={entry.action === "assigned" ? "success" : "warning"}>{entry.action === "assigned" ? "＋ Assigned" : "− Unassigned"}</StatusBadge></td></tr>)}</tbody></AdminDataTable></section>;
}
