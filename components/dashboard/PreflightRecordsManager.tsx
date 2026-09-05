"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ConfirmDialog, DetailDrawer, ManagementDisclosure } from "@/components/admin/AdminConsole";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import { formatUsDateTime } from "@/lib/date-format";
import {
  createFlightBriefRevision,
  deleteFlightBriefDraft,
  fetchMyFlightBriefs,
  fetchOrganizationStudentBriefs,
  type FlightBriefRecord,
} from "@/lib/preflight";

type PreflightStatusFilter = "all" | FlightBriefRecord["status"];
const preflightStatusOrder: FlightBriefRecord["status"][] = ["draft", "finalized", "superseded"];

export default function PreflightRecordsManager({ organizationOnly = false }: { organizationOnly?: boolean }) {
  const { session } = useAuthSession();
  const { activeOrganization } = useOrganization();
  const [records, setRecords] = useState<FlightBriefRecord[]>([]);
  const [activeRecord, setActiveRecord] = useState<FlightBriefRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FlightBriefRecord | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PreflightStatusFilter>("all");
  const [collapsedStatuses, setCollapsedStatuses] = useState<Set<FlightBriefRecord["status"]>>(
    () => new Set(preflightStatusOrder)
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!session?.user?.id) {
        if (!cancelled) {
          setRecords([]);
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      setStatus("");
      try {
        const [own, organization] = await Promise.all([
          organizationOnly ? Promise.resolve([]) : fetchMyFlightBriefs(),
          activeOrganization?.id
            ? fetchOrganizationStudentBriefs(activeOrganization.id)
            : Promise.resolve([]),
        ]);
        const merged = Array.from(
          new Map([...own, ...organization].map((record) => [record.id, record])).values()
        ).sort((left, right) => right.created_at.localeCompare(left.created_at));
        if (!cancelled) setRecords(merged);
      } catch (error) {
        if (!cancelled) setStatus(getErrorMessage(error, "Unable to load preflight records."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeOrganization?.id, organizationOnly, session?.user?.id]);

  const filteredRecords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((record) =>
      (statusFilter === "all" || record.status === statusFilter)
      && (!needle || [
          record.student_name,
          record.instructor_name,
          record.aircraft_tail_number,
          record.route ?? "",
          record.flight_date ?? "",
          record.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle))
    );
  }, [query, records, statusFilter]);

  const groupedRecords = useMemo(
    () => preflightStatusOrder
      .map((recordStatus) => ({
        status: recordStatus,
        records: filteredRecords.filter((record) => record.status === recordStatus),
      }))
      .filter((group) => group.records.length > 0),
    [filteredRecords]
  );

  function toggleStatus(recordStatus: FlightBriefRecord["status"]) {
    setCollapsedStatuses((current) => {
      const next = new Set(current);
      if (next.has(recordStatus)) next.delete(recordStatus);
      else next.add(recordStatus);
      return next;
    });
  }

  async function handleCreateRevision(record: FlightBriefRecord) {
    setBusy(true);
    setStatus("");
    try {
      const revisionId = await createFlightBriefRevision(record.id);
      const refreshed = session?.user?.id ? await fetchMyFlightBriefs() : [];
      setRecords((current) =>
        Array.from(new Map([...refreshed, ...current].map((item) => [item.id, item])).values())
      );
      setStatus(`Revision draft created (${revisionId.slice(0, 8)}). Open Flight Brief to prepare the corrected version.`);
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to create a revision."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteDraft() {
    if (!pendingDelete) return;
    setBusy(true);
    setStatus("");
    try {
      await deleteFlightBriefDraft(pendingDelete.id);
      setRecords((current) => current.filter((item) => item.id !== pendingDelete.id));
      if (activeRecord?.id === pendingDelete.id) setActiveRecord(null);
      setPendingDelete(null);
      setStatus("Unfinished Flight Brief deleted.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to delete the unfinished Flight Brief."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    {status ? <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600" role="status">{status}</p> : null}
    <ManagementDisclosure
      id={organizationOnly ? "organization-flight-briefs" : "flight-brief-history"}
      eyebrow="Preflight records"
      title={organizationOnly ? "Organization Flight Briefs" : "Flight Brief history"}
      summary={loading ? "Loading…" : `${records.length}`}
      actions={<Link className="secondary-button" href="/tools/flight-brief">New Flight Brief</Link>}
      helpContent={
        <>
          <p>{organizationOnly ? "This view contains organization-scoped member briefs." : "This view combines your own briefs with organization records you are permitted to see."}</p>
          <p>Flight Brief records, including drafts and finalized history, are retained for up to 7 days and then expire automatically.</p>
          <p>Unfinished drafts you own can be continued or deleted. Finalized records cannot be edited; create a revision when a correction is needed.</p>
          <p>A Flight Brief is a planning record, not a maintenance release, aircraft logbook entry, or legal weather briefing certificate.</p>
        </>
      }
    >

      <div className="mt-5 grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_auto]">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search pilot, co-pilot, aircraft, route, or date"
          aria-label="Search preflight records"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as PreflightStatusFilter)}
          aria-label="Filter preflight records by status"
        >
          <option value="all">All statuses</option>
          <option value="draft">Drafts</option>
          <option value="finalized">Finalized</option>
          <option value="superseded">Superseded</option>
        </select>
        {query || statusFilter !== "all" ? (
          <button className="ghost-button" type="button" onClick={() => { setQuery(""); setStatusFilter("all"); }}>
            Clear filters
          </button>
        ) : null}
      </div>
      {loading ? <p className="saas-empty-state mt-5">Loading preflight records...</p> : null}
      {!loading && filteredRecords.length === 0 ? (
        <p className="saas-empty-state mt-5">No matching preflight records.</p>
      ) : null}

      <div className="mt-5 grid gap-3">
        {groupedRecords.map((group) => {
          const isCollapsed = collapsedStatuses.has(group.status);
          return (
          <section key={group.status} className="overflow-hidden rounded-2xl border border-slate-200 bg-white/70">
            <button
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              type="button"
              aria-expanded={!isCollapsed}
              onClick={() => toggleStatus(group.status)}
            >
              <span className="text-sm font-semibold text-slate-900">{formatStatus(group.status)}</span>
              <span className="saas-pill">{group.records.length}</span>
            </button>
            {!isCollapsed ? <div className="grid gap-3 border-t border-slate-200 p-3">
        {group.records.map((record) => {
          const isOwn = record.created_by === session?.user?.id;
          return (
            <article key={record.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {record.aircraft_tail_number || "Aircraft not linked"} · {record.student_name || "Pilot"}
                  </p>
                  <p className="saas-meta-text">
                    {record.flight_date || "No date"} · {record.route || "No route"} · Revision {record.revision_number}
                  </p>
                  <p className="saas-meta-text">
                    {formatStatus(record.status)}{isOwn ? " · Your brief" : " · Organization flight brief"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="ghost-button" type="button" onClick={() => setActiveRecord(record)}>Open</button>
                  {isOwn && record.status === "draft" ? (
                    <Link className="ghost-button" href={`/tools/flight-brief?briefId=${record.id}`}>Continue draft</Link>
                  ) : null}
                  {isOwn && record.status === "draft" ? (
                    <button className="danger-button" type="button" disabled={busy} onClick={() => setPendingDelete(record)}>Delete draft</button>
                  ) : null}
                  {isOwn && record.status !== "draft" ? (
                    <button className="ghost-button" type="button" disabled={busy} onClick={() => void handleCreateRevision(record)}>Create revision</button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
            </div> : null}
          </section>
          );
        })}
      </div>

      <DetailDrawer
        open={Boolean(activeRecord)}
        title="Preflight record detail"
        description={activeRecord ? `Finalized ${formatDateTime(activeRecord.finalized_at)} · Saved record cannot be changed` : undefined}
        width="wide"
        onClose={() => setActiveRecord(null)}
      >
        {activeRecord ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Snapshot title="Flight brief" value={activeRecord.brief_data} />
            <Snapshot title="Maintenance & flight status" value={activeRecord.mx_snapshot} />
            <Snapshot title="Weight & Balance" value={activeRecord.wb_snapshot} />
            <Snapshot title="Weather" value={activeRecord.weather_snapshot} />
            <div className="lg:col-span-2"><Snapshot title="NOTAMs" value={activeRecord.notam_snapshot} /></div>
          </div>
        ) : null}
      </DetailDrawer>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete unfinished Flight Brief?"
        description="This permanently removes the draft. Completed Flight Briefs cannot be deleted manually and expire automatically after 7 days."
        confirmLabel="Delete draft"
        destructive
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void handleDeleteDraft()}
      />
    </ManagementDisclosure>
    </>
  );
}

function Snapshot({ title, value }: { title: string; value: Record<string, unknown> }) {
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-900">{title}</summary>
      <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-700">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function formatStatus(status: FlightBriefRecord["status"]) {
  if (status === "superseded") return "Superseded";
  if (status === "finalized") return "Finalized";
  return "Draft";
}

function formatDateTime(value: string | null) {
  return formatUsDateTime(value, "--");
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return fallback;
}
