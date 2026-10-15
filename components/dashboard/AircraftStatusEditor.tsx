"use client";

import { useState } from "react";
import { CompactButton, QuickEditPopover, StatusBadge } from "@/components/admin/AdminConsole";
import { updateOrganizationAircraftStatus, type AircraftOperationalStatus, type AircraftRecord } from "@/lib/aircraft";

const statusLabels = { available: "Available", away: "Away", in_maintenance: "In maintenance", grounded: "Grounded" };

export default function AircraftStatusEditor({ aircraft, organizationId, onSaved }: {
  aircraft: AircraftRecord;
  organizationId: string;
  onSaved: (change: Awaited<ReturnType<typeof updateOrganizationAircraftStatus>>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AircraftOperationalStatus>(aircraft.operational_status ?? "available");
  const [note, setNote] = useState(aircraft.operational_status_note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const current = aircraft.operational_status ?? "available";

  function changeOpen(next: boolean) {
    if (saving) return;
    if (next) {
      setStatus(aircraft.operational_status ?? "available");
      setNote(aircraft.operational_status_note ?? "");
      setError("");
    }
    setOpen(next);
  }

  return <QuickEditPopover open={open} onOpenChange={changeOpen} label={`Status · ${aircraft.tail_number}`} trigger={
    <button type="button" aria-label={`Change status for ${aircraft.tail_number}`} aria-haspopup="dialog" aria-expanded={open} className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
      <StatusBadge tone={current === "grounded" ? "danger" : current === "in_maintenance" ? "warning" : current === "away" ? "info" : "success"}>{statusLabels[current]} <span aria-hidden="true">▾</span></StatusBadge>
    </button>
  }>
    <form className="grid gap-3" onSubmit={async (event) => {
      event.preventDefault();
      if (saving) return;
      if (status === "grounded" && note.trim().length < 3) { setError("Enter at least 3 characters for the grounding reason."); return; }
      setSaving(true);
      setError("");
      try {
        const change = await updateOrganizationAircraftStatus({ organizationId, aircraftId: aircraft.id, operationalStatus: status, operationalStatusNote: note });
        onSaved(change);
        setOpen(false);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : typeof nextError === "object" && nextError && "message" in nextError ? String(nextError.message) : "Unable to update status. Try again.");
      } finally { setSaving(false); }
    }}>
      <label className="grid gap-1 text-xs font-semibold text-slate-700">Status
        <select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value as AircraftOperationalStatus)} disabled={saving} className="h-8 rounded-sm border border-slate-300 bg-white px-2 text-xs">
          {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-700">{status === "grounded" ? "Grounding reason" : "Status note"}
        <textarea aria-label={status === "grounded" ? "Grounding reason" : "Status note"} value={note} onChange={(event) => setNote(event.target.value)} required={status === "grounded"} disabled={saving} rows={2} className="rounded-sm border border-slate-300 px-2 py-1 text-xs font-normal" />
      </label>
      {error ? <p role="alert" className="text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2"><CompactButton type="button" disabled={saving} onClick={() => changeOpen(false)}>Cancel</CompactButton><CompactButton type="submit" tone="primary" disabled={saving}>{saving ? "Saving…" : "Apply"}</CompactButton></div>
    </form>
  </QuickEditPopover>;
}
