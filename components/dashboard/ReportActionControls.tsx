"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/admin/AdminConsole";
import { RecordMenu } from "@/components/admin/RecordMenu";
import { fetchReportActionContext, performReportAction, type ReportActionContext, type ReportActionRecord } from "@/lib/report-actions";

function errorText(error: unknown) {
  return typeof (error as { message?: unknown })?.message === "string" ? String((error as { message: string }).message) : "Unable to update this report. Try again.";
}

export function ReturnAircraftOption({ context, checked, onChange, disabled }: {
  context: ReportActionContext | null; checked: boolean; onChange: (value: boolean) => void; disabled: boolean;
}) {
  if (!context || context.aircraft_status !== "grounded") return null;
  return <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 text-sm">
    <p className="line-clamp-3 break-words text-slate-700">Aircraft: Grounded{context.grounding_note ? ` · ${context.grounding_note}` : ""}</p>
    {context.other_grounding_count > 0 ? <div className="rounded-sm border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
      <p>{context.other_grounding_count} other open {context.other_grounding_count === 1 ? "report marks" : "reports mark"} this aircraft down.</p>
      {context.other_grounding_reports.slice(0, 5).map(report => <p key={report.id} className="mt-1 line-clamp-2 break-words">{report.description}</p>)}
    </div> : null}
    <label className="flex items-start gap-2"><input type="checkbox" checked={checked} disabled={disabled || !context.can_return_to_service} onChange={event => onChange(event.target.checked)} /><span>Return aircraft to service</span></label>
    {!context.can_return_to_service ? <p className="text-xs text-slate-500">Fleet management access to this aircraft is required.</p> : null}
  </div>;
}

export function useReportActionContext(reportId: string, open: boolean) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ reportId: string; open: boolean; revision: number; context: ReportActionContext | null; error: string; loading: boolean }>({ reportId, open, revision, context: null, error: "", loading: open });
  if (state.reportId !== reportId || state.open !== open || state.revision !== revision) {
    setState({ reportId, open, revision, context: null, error: "", loading: open });
  }
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchReportActionContext(reportId).then(context => { if (!cancelled) setState({ reportId, open, revision, context, error: "", loading: false }); }, value => { if (!cancelled) setState({ reportId, open, revision, context: null, error: errorText(value), loading: false }); });
    return () => { cancelled = true; };
  }, [reportId, open, revision]);
  return { context: state.context, error: state.error, loading: state.loading, reload: () => setRevision(value => value + 1) };
}

export function ReportActionControls({ report, canManage, isPlatformAdmin, disabled = false, onChanged }: {
  report: ReportActionRecord; canManage: boolean; isPlatformAdmin: boolean; disabled?: boolean;
  onChanged: (deleted: boolean) => Promise<void>;
}) {
  const [action, setAction] = useState<"hide" | "unhide" | "delete" | null>(null);
  const [returnToService, setReturnToService] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const state = useReportActionContext(report.id, action !== null);
  if (!isPlatformAdmin && !(canManage && (report.status === "closed" || report.hidden_at))) return null;
  function start(next: "hide" | "unhide" | "delete") {
    if (busyRef.current || disabled) return;
    setReturnToService(false); setReason(""); setError(""); setAction(next);
  }
  async function confirm() {
    if (!action || !state.context || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      await performReportAction({ report, action, reason, returnToService: returnToService && state.context.aircraft_status === "grounded", contextToken: state.context.token });
      setAction(null);
      await onChanged(action === "delete");
      requestAnimationFrame(() => { if (document.activeElement === document.body) document.querySelector<HTMLElement>('[aria-label="Search reports"]')?.focus(); });
    } catch (value) { setError(errorText(value)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <>
    <RecordMenu label="Report actions" disabled={disabled || busy}>
        {canManage && (report.status === "closed" || report.hidden_at) ? <button type="button" disabled={disabled || busy} onClick={() => start(report.hidden_at ? "unhide" : "hide")} className="block w-full px-3 py-2 text-left text-xs hover:bg-slate-50">{report.hidden_at ? "Unhide" : "Hide"}</button> : null}
        {isPlatformAdmin ? <button type="button" disabled={disabled || busy} onClick={() => start("delete")} className="block w-full px-3 py-2 text-left text-xs text-rose-700 hover:bg-rose-50">Delete report</button> : null}
    </RecordMenu>
    <ConfirmDialog open={action !== null} title={action === "delete" ? "Delete this report?" : action === "hide" ? "Hide this report?" : "Unhide this report?"}
      description={action === "delete" ? "Permanently delete this report? This cannot be undone." : action === "hide" ? "Remove this report from the organization's default list." : "Show this report in the organization's default list."}
      confirmLabel={action === "delete" ? "Delete report" : action === "hide" ? "Hide" : "Unhide"}
      busy={busy} destructive={action === "delete"} confirmDisabled={state.loading || !state.context || (action === "delete" ? reason.trim().length < 3 || !state.context.can_delete : !state.context.can_hide)}
      onCancel={() => setAction(null)} onConfirm={() => void confirm()}>
      {action === "delete" ? <label className="mt-3 block text-sm">Reason<textarea rows={2} maxLength={1000} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} className="mt-1 w-full" /></label> : null}
      {action === "delete" ? <ReturnAircraftOption context={state.context} checked={returnToService} onChange={setReturnToService} disabled={busy} /> : null}
      {state.loading ? <p className="mt-3 text-xs">Loading report…</p> : null}
      {error || state.error ? <div className="mt-3 text-xs text-rose-700" role="alert"><p>{error || state.error}</p><button type="button" className="mt-2 underline" disabled={busy} onClick={() => { void onChanged(false).then(() => { state.reload(); setError(""); }, value => setError(errorText(value))); }}>Reload confirmation</button></div> : null}
    </ConfirmDialog>
  </>;
}
