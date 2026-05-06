"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import {
  createEndorsementRecordSignedUrl,
  deleteEndorsementRecord,
  fetchEndorsementRecords,
  type EndorsementRecord,
} from "@/lib/endorsement-records";

function formatRecordDate(value: string) {
  if (!value) {
    return "No date";
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function formatCreatedAt(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
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

export default function EndorsementRecordsManager() {
  const { session } = useAuthSession();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [records, setRecords] = useState<EndorsementRecord[]>([]);
  const [query, setQuery] = useState("");
  const [activeRecord, setActiveRecord] = useState<EndorsementRecord | null>(null);
  const [activePdfUrl, setActivePdfUrl] = useState("");
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [expandedStudent, setExpandedStudent] = useState("");

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

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
        const nextRecords = await fetchEndorsementRecords(session.user.id);
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
  }, [session?.user?.id]);

  const filteredRecords = useMemo(
    () => records.filter((record) => matchesRecord(record, query)),
    [query, records]
  );

  const groupedRecords = useMemo(() => {
    const groups = new Map<string, EndorsementRecord[]>();

    filteredRecords.forEach((record) => {
      const key = record.student_name.trim() || "Unknown student";
      groups.set(key, [...(groups.get(key) ?? []), record]);
    });

    return Array.from(groups.entries()).sort(([leftName], [rightName]) =>
      leftName.localeCompare(rightName)
    );
  }, [filteredRecords]);

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
    if (!window.confirm("Delete this saved endorsement record?")) {
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
      <section className="saas-panel">
        <div className="saas-section-toggle">
          <div className="saas-section-toggle-main">
            <h2 className="saas-section-title">Endorsement Records</h2>
          </div>
          <span className="saas-pill">{filteredRecords.length}</span>
        </div>

        <label className="saas-field mt-5">
          <span>Search</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search student, certificate, instructor, date, or endorsement"
          />
        </label>

        {loading ? <p className="saas-meta-text mt-5">Loading records...</p> : null}
        {!loading && status ? <p className="saas-meta-text mt-5">{status}</p> : null}

        {!loading && groupedRecords.length === 0 ? (
          <p className="saas-empty-state mt-5">
            {query.trim() ? "No records match your search." : "No endorsement records saved yet."}
          </p>
        ) : null}

        <div className="records-student-list mt-5">
          {groupedRecords.map(([studentName, studentRecords]) => {
            const isExpanded = expandedStudent === studentName;
            return (
              <section key={studentName} className="records-student-group">
                <button
                  type="button"
                  className="records-student-row"
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedStudent((current) => current === studentName ? "" : studentName)}
                >
                  <span className={`records-expand-icon ${isExpanded ? "records-expand-icon-open" : ""}`}>
                    <ActionIcon kind="expand" />
                  </span>
                  <span className="saas-subsection-title">{studentName}</span>
                  <span className="saas-pill">{studentRecords.length}</span>
                </button>

                {isExpanded ? (
                  <div className="records-detail-list">
                    {studentRecords.map((record) => (
                      <article key={record.id} className="records-detail-row">
                        <div className="saas-list-main">
                          <div className="saas-list-header">
                            <h4 className="saas-card-title">
                              {record.template_titles.length > 0
                                ? record.template_titles.join(", ")
                                : "Endorsement PDF"}
                            </h4>
                            <span className="saas-pill">{formatRecordDate(record.endorsement_date)}</span>
                          </div>
                          <p className="saas-meta-text">
                            Instructor: {record.instructor_name}
                            {record.instructor_cert_number
                              ? ` | ${record.instructor_cert_number}`
                              : ""}
                          </p>
                          <p className="saas-list-meta">
                            Saved {formatCreatedAt(record.created_at)}
                            {formatFileSize(record.file_size_bytes)
                              ? ` | ${formatFileSize(record.file_size_bytes)}`
                              : ""}
                          </p>
                        </div>

                        <div className="saas-inline-actions">
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
                          <button
                            type="button"
                            className="danger-button icon-button"
                            aria-label="Delete endorsement record"
                            title="Delete record"
                            disabled={busy}
                            onClick={() => void handleDelete(record)}
                          >
                            <ActionIcon kind="delete" />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </section>

      {activeRecord && portalRoot
        ? createPortal(
            <div className="Overlay" onClick={closeRecord}>
              <div className="Modal" onClick={(event) => event.stopPropagation()}>
                <div className="tools-child-shell flex h-full min-h-0 flex-col">
                  <div className="tools-child-header records-pdf-header">
                    <div />
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
                      <button
                        type="button"
                        className="danger-button icon-button"
                        aria-label="Delete endorsement record"
                        title="Delete record"
                        disabled={busy}
                        onClick={() => void handleDelete(activeRecord)}
                      >
                        <ActionIcon kind="delete" />
                      </button>
                      <button
                        type="button"
                        className="ghost-button icon-button"
                        aria-label="Close PDF preview"
                        title="Close"
                        onClick={closeRecord}
                      >
                        <ActionIcon kind="close" />
                      </button>
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
                </div>
              </div>
            </div>,
            portalRoot
          )
        : null}
    </>
  );
}
