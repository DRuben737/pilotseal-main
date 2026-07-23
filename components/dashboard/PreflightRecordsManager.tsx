"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import {
  createFlightBriefRevision,
  fetchMyFlightBriefs,
  fetchOrganizationStudentBriefs,
  type FlightBriefRecord,
} from "@/lib/preflight";

export default function PreflightRecordsManager() {
  const { session } = useAuthSession();
  const { activeOrganization } = useOrganization();
  const [records, setRecords] = useState<FlightBriefRecord[]>([]);
  const [activeRecord, setActiveRecord] = useState<FlightBriefRecord | null>(null);
  const [query, setQuery] = useState("");
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
          fetchMyFlightBriefs(session.user.id),
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
  }, [activeOrganization?.id, session?.user?.id]);

  const filteredRecords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((record) =>
      [
        record.student_name,
        record.instructor_name,
        record.aircraft_tail_number,
        record.route ?? "",
        record.flight_date ?? "",
        record.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [query, records]);

  async function handleCreateRevision(record: FlightBriefRecord) {
    setBusy(true);
    setStatus("");
    try {
      const revisionId = await createFlightBriefRevision(record.id);
      const refreshed = session?.user?.id ? await fetchMyFlightBriefs(session.user.id) : [];
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

  return (
    <section className="saas-panel">
      <div className="people-toolbar">
        <div>
          <p className="saas-kicker">Preflight records</p>
          <h2 className="saas-subsection-title">Flight Brief history</h2>
          <p className="saas-meta-text mt-2">
            Your records and finalized student briefs visible through the current organization.
          </p>
        </div>
        <Link className="secondary-button" href="/tools/flight-brief">New Flight Brief</Link>
      </div>

      <input
        className="mt-5 w-full rounded-xl border border-slate-300 px-3 py-2"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search pilot, co-pilot, aircraft, route, or date"
      />
      {status ? <p className="mt-3 text-sm text-slate-600">{status}</p> : null}

      {loading ? <p className="saas-empty-state mt-5">Loading preflight records...</p> : null}
      {!loading && filteredRecords.length === 0 ? (
        <p className="saas-empty-state mt-5">No matching preflight records.</p>
      ) : null}

      <div className="mt-5 grid gap-3">
        {filteredRecords.map((record) => {
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
                  {isOwn && record.status !== "draft" ? (
                    <button className="ghost-button" type="button" disabled={busy} onClick={() => void handleCreateRevision(record)}>Create revision</button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {activeRecord ? (
        <div className="mt-5 rounded-2xl border border-slate-300 bg-slate-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Preflight record detail</h3>
              <p className="saas-meta-text">Finalized {formatDateTime(activeRecord.finalized_at)} · Immutable snapshot</p>
            </div>
            <button className="ghost-button" type="button" onClick={() => setActiveRecord(null)}>Close</button>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Snapshot title="Flight brief" value={activeRecord.brief_data} />
            <Snapshot title="MX / Dispatch" value={activeRecord.mx_snapshot} />
            <Snapshot title="Weight & Balance" value={activeRecord.wb_snapshot} />
            <Snapshot title="Weather" value={activeRecord.weather_snapshot} />
            <div className="lg:col-span-2"><Snapshot title="NOTAMs" value={activeRecord.notam_snapshot} /></div>
          </div>
          <p className="saas-meta-text mt-4">
            This is a preflight planning record, not a maintenance release, aircraft logbook entry, or legal weather briefing certificate.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Snapshot({ title, value }: { title: string; value: Record<string, unknown> }) {
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-3" open={title === "Flight brief" || title === "MX / Dispatch"}>
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
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return fallback;
}
