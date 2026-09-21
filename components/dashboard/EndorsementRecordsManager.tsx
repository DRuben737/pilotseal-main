"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminDataTable, DetailDrawer, ManagementDisclosure } from "@/components/admin/AdminConsole";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import {
  createEndorsementRecordSignedUrl,
  deleteEndorsementRecord,
  fetchEndorsementRecords,
  fetchIssuedOrganizationEndorsementRecords,
  fetchOrganizationEndorsementRecords,
  fetchReceivedEndorsementRecords,
  type EndorsementRecord,
} from "@/lib/endorsement-records";
import { canManageOrganization } from "@/lib/organizations";
import { formatUsDate, formatUsDateTime } from "@/lib/date-format";

function formatRecordDate(value: string) {
  if (!value) {
    return "No date";
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    return value;
  }

  return formatUsDate(value, value);
}

function formatCreatedAt(value: string) {
  return formatUsDateTime(value, "");
}

function formatFileSize(value: number | null) {
  if (!value) {
    return "";
  }

  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024))} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function matchesRecord(record: EndorsementRecord, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [
    record.student_name,
    record.student_cert_number ?? "",
    record.instructor_name,
    record.instructor_cert_number ?? "",
    record.endorsement_date,
    record.template_titles.join(" "),
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

function ActionIcon({ kind }: { kind: "open" | "external" | "delete" | "close" | "expand" }) {
  const common = "h-4 w-4";

  switch (kind) {
    case "open":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={common}>
          <path d="M6 4h9l3 3v13H6V4Z" />
          <path d="M14 4v4h4" />
          <path d="M9 13h6" />
          <path d="M9 16h4" />
        </svg>
      );
    case "external":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={common}>
          <path d="M14 4h6v6" />
          <path d="M20 4l-9 9" />
          <path d="M11 5H5v14h14v-6" />
        </svg>
      );
    case "delete":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={common}>
          <path d="M4 7h16" />
          <path d="M9 7V4h6v3" />
          <path d="M7 7l1 13h8l1-13" />
        </svg>
      );
    case "close":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={common}>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </svg>
      );
    case "expand":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={common}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      );
  }
}

export default function EndorsementRecordsManager({ organizationOnly = false }: { organizationOnly?: boolean }) {
  const router = useRouter();
  const { session } = useAuthSession();
  const { activeOrganization } = useOrganization();
  const canViewOrganizationRecords = canManageOrganization(activeOrganization?.member_role);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [records, setRecords] = useState<EndorsementRecord[]>([]);
  const [query, setQuery] = useState("");
  const [activeRecord, setActiveRecord] = useState<EndorsementRecord | null>(null);
  const [activePdfUrl, setActivePdfUrl] = useState("");
  const [view, setView] = useState<"personal" | "received" | "organization">(
    organizationOnly ? "organization" : "personal"
  );

  useEffect(() => {
    let cancelled = false;

    async function loadRecords() {
      if (!session?.user?.id) {
        if (!cancelled) {
          setRecords([]);
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setStatus("");
        const effectiveView = organizationOnly ? "organization" : view;
        const [ownRecords, organizationRecords] = await Promise.all([
          effectiveView === "personal"
            ? fetchEndorsementRecords(session.user.id)
            : effectiveView === "received"
              ? fetchReceivedEndorsementRecords(session.user.id)
              : organizationOnly ? Promise.resolve([]) : fetchIssuedOrganizationEndorsementRecords(session.user.id),
          effectiveView === "organization" && activeOrganization?.id && canViewOrganizationRecords
            ? fetchOrganizationEndorsementRecords(activeOrganization.id)
            : Promise.resolve([]),
        ]);
        const nextRecords = Array.from(
          new Map([...ownRecords, ...organizationRecords].map((record) => [record.id, record])).values()
        );
        if (!cancelled) {
          setRecords(nextRecords);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Unable to load records.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadRecords();

    return () => {
      cancelled = true;
    };
  }, [activeOrganization?.id, canViewOrganizationRecords, organizationOnly, session?.user?.id, view]);

  const filteredRecords = useMemo(
    () => records.filter((record) => matchesRecord(record, query)),
    [query, records]
  );

  async function openRecord(record: EndorsementRecord) {
    setBusy(true);
    setStatus("");

    try {
      const signedUrl = await createEndorsementRecordSignedUrl(record.storage_path);
      setActiveRecord(record);
      setActivePdfUrl(signedUrl);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to open the saved PDF.");
    } finally {
      setBusy(false);
    }
  }

  function closeRecord() {
    setActiveRecord(null);
    setActivePdfUrl("");
  }

  async function handleDelete(record: EndorsementRecord) {
    if (!window.confirm("Permanently delete this endorsement? The student and every organization with access will lose it immediately. This cannot be undone.")) {
      return;
    }

    setBusy(true);
    setStatus("");

    try {
      await deleteEndorsementRecord(record);
      setRecords((current) => current.filter((item) => item.id !== record.id));
      closeRecord();
      setStatus("Endorsement record deleted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to delete record.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {status ? <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600" role="status">{status}</p> : null}
      <ManagementDisclosure
        id="endorsement-records"
        title={organizationOnly ? "Issued endorsements" : "Endorsement Records"}
        summary={loading ? "Loading…" : `${records.length}`}
        className="dashboard-data-workspace"
        defaultOpen
        helpContent={
          organizationOnly ? (
            <p>Shows endorsements issued while the instructor belonged to this organization. Students do not need to be organization members.</p>
          ) : (
            <>
              <p>Your issued records remain in your personal history.</p>
              <p>Records created while you belong to an organization also appear in that organization’s activity. This overlap is intentional and does not create duplicate records.</p>
              <p>Use the three views to switch between records you issued, records issued to you, and organization activity. Only the issuing instructor can edit or permanently delete an endorsement.</p>
            </>
          )
        }
      >

        {!organizationOnly ? <nav className="mt-4 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1" aria-label="Endorsement record views">
          {([
            ["personal", "My issued records"],
            ["received", "Issued to me"],
            ["organization", "Organization activity"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-current={view === key ? "page" : undefined}
              className={`min-h-8 shrink-0 rounded-lg px-3 text-xs font-semibold ${view === key ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-white"}`}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </nav> : null}

        <div className="mt-5 flex flex-col items-end gap-2 sm:flex-row">
          <label className="saas-field min-w-0 flex-1">
            <span>Search</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search student, certificate, instructor, date, or endorsement"
            />
          </label>
          {query ? <button className="ghost-button" type="button" onClick={() => setQuery("")}>Clear search</button> : null}
        </div>

        {loading ? <p className="saas-meta-text mt-5">Loading records...</p> : null}
        {!loading && filteredRecords.length === 0 ? (
          <p className="saas-empty-state mt-5">
            {query.trim() ? "No records match your search." : "No endorsement records saved yet."}
          </p>
        ) : null}

        {filteredRecords.length > 0 ? <div className="mt-3"><AdminDataTable label="Endorsement records">
          <thead><tr><th>Student</th><th>Endorsement</th><th>Date</th><th>Instructor</th><th>Saved</th><th>Scope</th><th aria-label="Actions" /></tr></thead>
          <tbody>
          {filteredRecords.map((record) => (
            <tr key={record.id}>
              <td className="font-semibold text-slate-900">{record.student_name}</td>
              <td>{record.template_titles.length ? record.template_titles.join(", ") : "Endorsement PDF"}</td>
              <td>{formatRecordDate(record.endorsement_date)}</td>
              <td>{record.instructor_name}{record.instructor_cert_number ? ` · ${record.instructor_cert_number}` : ""}</td>
              <td>{formatCreatedAt(record.created_at)}{formatFileSize(record.file_size_bytes) ? ` · ${formatFileSize(record.file_size_bytes)}` : ""}</td>
              <td>{record.scope_status === "pending_review" ? "Pending review" : record.scope_status === "confirmed" ? "Organization" : "Personal"}</td>
              <td><div className="data-row-actions">
                          <button
                            type="button"
                            className="secondary-button icon-button"
                            aria-label={`View PDF for ${record.student_name}`}
                            title="View PDF"
                            disabled={busy}
                            onClick={() => void openRecord(record)}
                          >
                            <ActionIcon kind="open" />
                          </button>
                          {record.user_id === session?.user?.id ? (
                            <button type="button" className="secondary-button" disabled={busy} onClick={() => router.push(`/tools/endorsement-generator?editRecord=${encodeURIComponent(record.id)}`)}>
                              Edit
                            </button>
                          ) : null}
                          {record.user_id === session?.user?.id ? <button
                            type="button"
                            className="danger-button icon-button"
                            aria-label="Delete endorsement record"
                            title="Delete record"
                            disabled={busy}
                            onClick={() => void handleDelete(record)}
                          >
                            <ActionIcon kind="delete" />
                          </button> : null}
              </div></td>
            </tr>
          ))}
          </tbody>
        </AdminDataTable></div> : null}
      </ManagementDisclosure>

      <DetailDrawer open={Boolean(activeRecord)} title={activeRecord ? `Endorsement record · ${activeRecord.student_name}` : "Endorsement record"} width="wide" onClose={closeRecord}>
        {activeRecord ? <div className="flex min-h-[70vh] flex-col">
                  <div className="records-pdf-header flex justify-end">
                    <div className="tools-child-actions">
                      {activePdfUrl ? (
                        <a
                          className="secondary-button icon-button"
                          href={activePdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Open PDF in a new tab"
                          title="Open PDF"
                        >
                          <ActionIcon kind="external" />
                        </a>
                      ) : null}
                      {activeRecord.user_id === session?.user?.id ? <button
                        type="button"
                        className="danger-button icon-button"
                        aria-label="Delete endorsement record"
                        title="Delete record"
                        disabled={busy}
                        onClick={() => void handleDelete(activeRecord)}
                      >
                        <ActionIcon kind="delete" />
                      </button> : null}
                    </div>
                  </div>

                  <div className="mt-4 min-h-0 flex-1 overflow-hidden rounded-[18px] border border-slate-200 bg-white">
                    {activePdfUrl ? (
                      <iframe
                        title={`Endorsement record for ${activeRecord.student_name}`}
                        src={activePdfUrl}
                        className="h-full min-h-[520px] w-full"
                      />
                    ) : (
                      <p className="saas-meta-text p-5">Loading PDF...</p>
                    )}
                  </div>
                </div> : null}
      </DetailDrawer>
    </>
  );
}
