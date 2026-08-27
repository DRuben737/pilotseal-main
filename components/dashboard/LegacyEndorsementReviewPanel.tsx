"use client";

import { useEffect, useState } from "react";

import {
  fetchLegacyEndorsementReviewContext,
  fetchPendingLegacyEndorsementRecords,
  reviewLegacyEndorsementScope,
  type EndorsementRecord,
  type LegacyEndorsementReviewContext,
} from "@/lib/endorsement-records";
import { formatUsDateTime } from "@/lib/date-format";
import { DetailDrawer } from "@/components/admin/AdminConsole";

export default function LegacyEndorsementReviewPanel() {
  const [records, setRecords] = useState<EndorsementRecord[]>([]);
  const [selected, setSelected] = useState<EndorsementRecord | null>(null);
  const [reviewContext, setReviewContext] = useState<LegacyEndorsementReviewContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [note, setNote] = useState("");
  const [confirmHistoricalEvidence, setConfirmHistoricalEvidence] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [reviewStatus, setReviewStatus] = useState<{ tone: "error" | "success"; message: string } | null>(null);

  async function load() {
    try {
      setRecords(await fetchPendingLegacyEndorsementRecords());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load legacy records.");
    }
  }

  useEffect(() => { void load(); }, []);

  async function openReview(record: EndorsementRecord) {
    setSelected(record);
    setReviewContext(null);
    setConfirmHistoricalEvidence(false);
    setNote("");
    setStatus("");
    setReviewStatus(null);
    setContextLoading(true);
    try {
      setReviewContext(await fetchLegacyEndorsementReviewContext(record.id));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load review evidence.");
    } finally {
      setContextLoading(false);
    }
  }

  function closeReview() {
    if (busy) return;
    setSelected(null);
    setReviewContext(null);
    setConfirmHistoricalEvidence(false);
    setNote("");
    setReviewStatus(null);
  }

  async function decide(decision: "personal" | "confirmed" | "defer") {
    if (!selected) return;
    const trimmedNote = note.trim();
    if (decision !== "defer" && !trimmedNote) {
      setReviewStatus({ tone: "error", message: "Enter the audit reason before making a final decision." });
      return;
    }
    if (decision === "confirmed" && reviewContext?.requires_historical_attestation && trimmedNote.length < 12) {
      setReviewStatus({
        tone: "error",
        message: `Describe the historical evidence in at least 12 characters (${trimmedNote.length}/12).`,
      });
      return;
    }
    if (decision === "confirmed" && reviewContext?.requires_historical_attestation && !confirmHistoricalEvidence) {
      setReviewStatus({ tone: "error", message: "Check the historical membership evidence box before confirming this record." });
      return;
    }
    setBusy(true);
    setReviewStatus(null);
    try {
      await reviewLegacyEndorsementScope({
        recordId: selected.id,
        decision,
        note,
        confirmHistoricalEvidence: decision === "confirmed" && confirmHistoricalEvidence,
      });
      if (decision !== "defer") {
        setRecords((current) => current.filter((record) => record.id !== selected.id));
        setSelected(null);
        setReviewContext(null);
        setNote("");
        setConfirmHistoricalEvidence(false);
        setStatus(decision === "confirmed" ? "Record confirmed for the organization." : "Record moved to Personal.");
      } else {
        setReviewStatus({ tone: "success", message: "Record remains quarantined. The review decision was logged." });
      }
    } catch (error) {
      setReviewStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to save this review decision.",
      });
    } finally {
      setBusy(false);
    }
  }

  const trimmedNoteLength = note.trim().length;
  const historicalNoteTooShort = Boolean(reviewContext?.requires_historical_attestation) && trimmedNoteLength < 12;

  return (
    <section className="saas-panel mb-4">
      <div className="saas-section-toggle">
        <div className="saas-section-toggle-main">
          <h2 className="saas-section-title">Legacy organization record review</h2>
          <p className="saas-meta-text">Quarantined records are hidden from organizations until identity and historical membership evidence are confirmed.</p>
        </div>
        <span className="saas-pill">{records.length}</span>
      </div>
      {status ? <p role="status" className="saas-meta-text mt-3">{status}</p> : null}
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="bg-slate-100 text-slate-700"><tr><th className="px-3 py-2">Student</th><th className="px-3 py-2">Instructor</th><th className="px-3 py-2">Created</th><th className="px-3 py-2">Action</th></tr></thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="border-t border-slate-200 hover:bg-blue-50">
                <td className="px-3 py-2 font-semibold text-slate-950">{record.student_name}</td>
                <td className="px-3 py-2">{record.instructor_name}</td>
                <td className="px-3 py-2">{formatUsDateTime(record.created_at, record.created_at)}</td>
                <td className="px-3 py-2"><button className="ghost-button" type="button" onClick={() => void openReview(record)}>Review</button></td>
              </tr>
            ))}
            {records.length === 0 ? <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-500">No quarantined legacy records.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <DetailDrawer
        open={Boolean(selected)}
        title={selected ? `Review ${selected.student_name}` : "Review legacy record"}
        description={selected ? `Record ${selected.id}` : undefined}
        onClose={closeReview}
      >
        {contextLoading ? <p className="text-sm text-slate-500">Checking account and membership evidence…</p> : null}
        {!contextLoading && reviewContext ? (
          <div className="grid gap-4">
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-2">
                <dt className="text-slate-500">Organization</dt><dd className="font-semibold text-slate-950">{reviewContext.organization_name}</dd>
                <dt className="text-slate-500">Linked account</dt><dd>{reviewContext.account_linked ? `${reviewContext.linked_student_name || "Registered student"} · ${reviewContext.linked_student_email || "verified account"}` : "Not linked"}</dd>
                <dt className="text-slate-500">Student member</dt><dd>{reviewContext.organization_student ? "Confirmed" : "Not confirmed"}</dd>
                <dt className="text-slate-500">Original-time evidence</dt><dd>{reviewContext.requires_historical_attestation ? "Reviewer evidence required" : "Membership periods found"}</dd>
              </dl>
            </section>

            {reviewContext.requires_historical_attestation && reviewContext.account_linked && reviewContext.organization_student ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="status">
                <strong className="block">Historical membership needs manual verification</strong>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>Check that you verified a reliable historical source.</li>
                  <li>Describe that source in at least 12 characters below.</li>
                  <li>Select “Confirm for organization.”</li>
                </ol>
                <p className="mt-2 text-xs text-amber-800">No document upload is required. The audit log stores your evidence description and confirmation.</p>
              </div>
            ) : reviewContext.blocker ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="status">
                {reviewContext.blocker}
              </div>
            ) : null}

            {reviewContext.account_linked && reviewContext.organization_student && reviewContext.requires_historical_attestation ? (
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm">
                <input
                  className="mt-0.5"
                  type="checkbox"
                  checked={confirmHistoricalEvidence}
                  onChange={(event) => {
                    setConfirmHistoricalEvidence(event.target.checked);
                    setReviewStatus(null);
                  }}
                />
                <span><strong className="block text-slate-950">Step 1 — I verified historical membership evidence</strong>Use a roster, enrollment record, contract, scheduling record, or another reliable source showing both parties belonged to the organization when this record was created.</span>
              </label>
            ) : null}

            <label className="saas-field">
              <span>{reviewContext.requires_historical_attestation ? "Step 2 — Evidence source *" : "Audit reason *"}</span>
              <textarea
                rows={4}
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                  setReviewStatus(null);
                }}
                placeholder={reviewContext.requires_historical_attestation ? "Example: Verified archived student roster dated January 2020." : "Describe the decision and supporting evidence."}
                aria-describedby="legacy-review-note-help"
              />
              <span id="legacy-review-note-help" className={historicalNoteTooShort && trimmedNoteLength > 0 ? "text-amber-700" : "text-slate-500"}>
                {reviewContext.requires_historical_attestation
                  ? `At least 12 characters are required to identify the evidence (${trimmedNoteLength}/12).`
                  : "Required for a final review decision."}
              </span>
            </label>

            {reviewStatus ? (
              <div
                className={`rounded-xl border p-3 text-sm ${reviewStatus.tone === "error" ? "border-rose-300 bg-rose-50 text-rose-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}
                role={reviewStatus.tone === "error" ? "alert" : "status"}
                aria-live="polite"
              >
                {reviewStatus.message}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
              <button className="primary-button" type="button" disabled={busy} onClick={() => void decide("personal")}>{busy ? "Saving…" : "Move to Personal"}</button>
              <button
                className="secondary-button"
                type="button"
                disabled={busy || !reviewContext.account_linked || !reviewContext.organization_student}
                onClick={() => void decide("confirmed")}
              >
                {busy ? "Saving…" : reviewContext.requires_historical_attestation ? "Step 3 — Confirm for organization" : "Confirm for organization"}
              </button>
              <button className="ghost-button" type="button" disabled={busy} onClick={() => void decide("defer")}>Keep quarantined</button>
              <button className="ghost-button" type="button" disabled={busy} onClick={closeReview}>Cancel</button>
            </div>
          </div>
        ) : null}
      </DetailDrawer>
    </section>
  );
}
