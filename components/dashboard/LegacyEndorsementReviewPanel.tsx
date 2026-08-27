"use client";

import { useEffect, useState } from "react";

import {
  fetchPendingLegacyEndorsementRecords,
  reviewLegacyEndorsementScope,
  type EndorsementRecord,
} from "@/lib/endorsement-records";
import { formatUsDateTime } from "@/lib/date-format";

export default function LegacyEndorsementReviewPanel() {
  const [records, setRecords] = useState<EndorsementRecord[]>([]);
  const [selected, setSelected] = useState<EndorsementRecord | null>(null);
  const [note, setNote] = useState("");
  const [studentUserId, setStudentUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function load() {
    try {
      setRecords(await fetchPendingLegacyEndorsementRecords());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load legacy records.");
    }
  }

  useEffect(() => { void load(); }, []);

  async function decide(decision: "personal" | "confirmed" | "defer") {
    if (!selected) return;
    if (decision !== "defer" && !note.trim()) {
      setStatus("Enter the audit reason before making a final decision.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      await reviewLegacyEndorsementScope({
        recordId: selected.id,
        decision,
        studentUserId: decision === "confirmed" ? studentUserId : null,
        note,
      });
      if (decision !== "defer") {
        setRecords((current) => current.filter((record) => record.id !== selected.id));
        setSelected(null);
        setNote("");
        setStudentUserId("");
      }
      setStatus(decision === "defer" ? "Record remains quarantined." : "Legacy review decision saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save this review decision.");
    } finally {
      setBusy(false);
    }
  }

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
          <thead className="bg-slate-100 text-slate-700"><tr><th className="px-3 py-2">Student</th><th className="px-3 py-2">Instructor</th><th className="px-3 py-2">Created</th><th className="px-3 py-2">State</th></tr></thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="cursor-pointer border-t border-slate-200 hover:bg-blue-50" onClick={() => setSelected(record)}>
                <td className="px-3 py-2 font-semibold text-slate-950">{record.student_name}</td>
                <td className="px-3 py-2">{record.instructor_name}</td>
                <td className="px-3 py-2">{formatUsDateTime(record.created_at, record.created_at)}</td>
                <td className="px-3 py-2"><span className="saas-pill">Pending review</span></td>
              </tr>
            ))}
            {records.length === 0 ? <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-500">No quarantined legacy records.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {selected ? (
        <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-2">
          <div><p className="font-semibold text-slate-950">{selected.student_name}</p><p className="text-xs text-slate-600">Record {selected.id}</p></div>
          <label className="saas-field"><span>Verified student user ID (only for organization confirmation)</span><input value={studentUserId} onChange={(event) => setStudentUserId(event.target.value)} placeholder="UUID" /></label>
          <label className="saas-field md:col-span-2"><span>Audit reason *</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></label>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button className="primary-button" type="button" disabled={busy} onClick={() => void decide("personal")}>Move to Personal</button>
            <button className="secondary-button" type="button" disabled={busy || !studentUserId.trim()} onClick={() => void decide("confirmed")}>Confirm legacy organization record</button>
            <button className="ghost-button" type="button" disabled={busy} onClick={() => void decide("defer")}>Keep quarantined</button>
            <button className="ghost-button" type="button" disabled={busy} onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
