"use client";

import { useEffect, useRef, useState } from "react";
import { AdminDataTable, CompactButton, DetailDrawer } from "@/components/admin/AdminConsole";
import { fetchNotificationPublications, fetchPublicationAudience, fetchPublicationReport, saveNotificationPublication, withdrawNotificationPublication, type NotificationPublication, type PublicationAudienceMember, type PublicationReceipt } from "@/lib/notification-publications";
import NotificationAudiencePicker from "@/components/notifications/NotificationAudiencePicker";
import type { NotificationPriority } from "@/lib/notifications";

const emptyForm = { id: "", title: "", message: "", priority: "normal" as NotificationPriority, status: "sent" as "draft" | "scheduled" | "sent", scheduled_at: "", expires_at: "", requires_acknowledgement: false, audience_user_ids: null as string[] | null };
function localInputDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function errorMessage(error: unknown) { return error && typeof error === "object" && "message" in error ? String(error.message) : "Unable to save. Please try again."; }

export default function NotificationPublicationManager({ organizationId, sourceName }: { organizationId: string | null; sourceName: string }) {
  const [history, setHistory] = useState<NotificationPublication[]>([]);
  const [audience, setAudience] = useState<PublicationAudienceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [form, setForm] = useState(emptyForm);
  const [report, setReport] = useState<{ title: string; rows: PublicationReceipt[] } | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [withdraw, setWithdraw] = useState<NotificationPublication | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [publications, members] = await Promise.all([fetchNotificationPublications(organizationId), fetchPublicationAudience(organizationId)]);
        if (!cancelled) { setHistory(publications); setAudience(members); setError(""); }
      } catch (e) { if (!cancelled) setError(errorMessage(e)); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [organizationId]);
  async function refresh() { setHistory(await fetchNotificationPublications(organizationId)); }
  function edit(publication?: NotificationPublication) {
    setForm(publication ? { ...publication, status: publication.status === "withdrawn" ? "draft" : publication.status === "scheduled" && publication.scheduled_at && Date.parse(publication.scheduled_at) <= Date.now() ? "sent" : publication.status, scheduled_at: localInputDate(publication.scheduled_at), expires_at: localInputDate(publication.expires_at) } : { ...emptyForm });
    setError(""); setPreview(false); setOpen(true);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    if (form.audience_user_ids?.length === 0) { setError("Select at least one recipient."); return; }
    savingRef.current = true; setSaving(true); setError("");
    try {
      await saveNotificationPublication(organizationId, { ...form, scheduled_at: form.status === "scheduled" ? new Date(form.scheduled_at).toISOString() : null, expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null, action_url: null });
      setOpen(false); setStatus(form.status === "draft" ? "Draft saved." : form.status === "scheduled" ? "Notification scheduled." : "Notification published.");
      await refresh();
    } catch (e) { setError(errorMessage(e)); }
    finally { savingRef.current = false; setSaving(false); }
  }
  async function showReport(publication: NotificationPublication) {
    setReportLoading(true); setError("");
    try { setReport({ title: publication.title, rows: await fetchPublicationReport(publication.id) }); }
    catch (e) { setError(errorMessage(e)); }
    finally { setReportLoading(false); }
  }
  async function confirmWithdraw() {
    if (!withdraw || savingRef.current) return;
    savingRef.current = true; setSaving(true); setError("");
    try { await withdrawNotificationPublication(withdraw.id); setWithdraw(null); setStatus("Notification withdrawn."); await refresh(); }
    catch (e) { setError(errorMessage(e)); }
    finally { savingRef.current = false; setSaving(false); }
  }
  const visible = history.filter(p => `${p.title} ${p.message} ${p.status}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="grid min-w-0 gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">{sourceName} notifications</h2><CompactButton type="button" tone="primary" onClick={() => edit()}>New notification</CompactButton></div>
    {status ? <p role="status" className="text-sm text-slate-600">{status}</p> : null}
    {error && !open && !withdraw ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
    <input aria-label="Search published notifications" type="search" placeholder="Search notifications" value={query} onChange={e => setQuery(e.target.value)} />
    {loading ? <p className="text-sm text-slate-500">Loading notifications…</p> : !visible.length ? <p className="saas-empty-state">No notifications.</p> : <AdminDataTable label="Published notifications"><thead><tr><th>Title</th><th>Status</th><th>Audience</th><th>Published</th><th>Expires</th><th aria-label="Actions" /></tr></thead><tbody>{visible.map(p => <tr key={p.id}>
      <td className="font-medium">{p.title}</td><td>{p.status === "scheduled" && p.scheduled_at && Date.parse(p.scheduled_at) <= Date.now() ? "sent" : p.status}</td><td>{p.audience_user_ids ? `${p.audience_user_ids.length} selected` : "All members"}</td><td>{p.scheduled_at ? new Date(p.scheduled_at).toLocaleString() : new Date(p.created_at).toLocaleString()}</td><td>{p.expires_at ? new Date(p.expires_at).toLocaleString() : "—"}</td>
      <td><div className="data-row-actions"><CompactButton type="button" onClick={() => edit(p)}>{p.status === "draft" ? "Edit" : "Correct"}</CompactButton><CompactButton type="button" disabled={reportLoading} onClick={() => void showReport(p)}>Receipts</CompactButton>{p.status !== "withdrawn" ? <CompactButton type="button" onClick={() => { setError(""); setWithdraw(p); }}>Withdraw</CompactButton> : null}</div></td>
    </tr>)}</tbody></AdminDataTable>}
    <DetailDrawer open={open} title={form.id ? "Edit notification" : "New notification"} onClose={() => { if (!saving) setOpen(false); }}>
      <form onSubmit={event => void save(event)} className="grid gap-3">
        {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
        <fieldset disabled={saving} className="grid gap-3">
          <label className="grid gap-1 text-sm">Title<input required maxLength={200} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
          <label className="grid gap-1 text-sm">Message<textarea aria-label="Message" required rows={6} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm">Priority<select aria-label="Priority" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as NotificationPriority })}>{["low","normal","high","critical"].map(v => <option key={v}>{v}</option>)}</select></label><label className="grid gap-1 text-sm">Publish<select aria-label="Publish" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as typeof form.status })}><option value="draft">Save draft</option><option value="sent">Now</option><option value="scheduled">Schedule</option></select></label></div>
          {form.status === "scheduled" ? <label className="grid gap-1 text-sm">Publish at<input required type="datetime-local" value={form.scheduled_at} onChange={e => setForm({ ...form, scheduled_at: e.target.value })} /></label> : null}
          <label className="grid gap-1 text-sm">Expires at<input type="datetime-local" value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.requires_acknowledgement} onChange={e => setForm({ ...form, requires_acknowledgement: e.target.checked })} />Require receipt confirmation</label>
          <NotificationAudiencePicker audience={audience} value={form.audience_user_ids} onChange={value => { setError(""); setForm(current => ({ ...current, audience_user_ids: value })); }} />
          <button type="button" className="secondary-button justify-self-start" aria-expanded={preview} onClick={() => setPreview(!preview)}>{preview ? "Hide preview" : "Preview"}</button>
          {preview ? <article aria-label="Notification preview" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><span className="text-xs text-slate-500">{sourceName}</span><h3 className="mt-2 font-semibold">{form.title || "Notification title"}</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{form.message || "Message"}</p>{form.requires_acknowledgement ? <span className="mt-2 block text-xs text-slate-500">Receipt confirmation required</span> : null}</article> : null}
          <div className="flex justify-end gap-2"><CompactButton type="button" onClick={() => setOpen(false)}>Cancel</CompactButton><CompactButton type="submit" tone="primary">{saving ? "Saving…" : form.status === "draft" ? "Save draft" : form.status === "scheduled" ? "Schedule" : form.id ? "Publish correction" : "Publish"}</CompactButton></div>
        </fieldset>
      </form>
    </DetailDrawer>
    <DetailDrawer open={Boolean(report)} title={report ? `Receipts: ${report.title}` : "Receipts"} onClose={() => setReport(null)}>
      {report ? <><p className="mb-3 text-sm text-slate-600">{report.rows.filter(r => r.read_at).length} read · {report.rows.filter(r => r.acknowledged_at).length} confirmed · {report.rows.length} recipients</p><AdminDataTable label="Notification receipts"><thead><tr><th>Recipient</th><th>Displayed</th><th>Read</th><th>Confirmed</th></tr></thead><tbody>{report.rows.map(r => <tr key={r.user_id}><td>{r.display_name}</td><td>{r.displayed_at ? "Yes" : "—"}</td><td>{r.read_at ? "Yes" : "—"}</td><td>{r.acknowledged_at ? "Yes" : "—"}</td></tr>)}</tbody></AdminDataTable></> : null}
    </DetailDrawer>
    <DetailDrawer open={Boolean(withdraw)} title="Withdraw notification" onClose={() => { if (!saving) setWithdraw(null); }}>
      <p className="text-sm">Withdraw “{withdraw?.title}” from recipients’ inboxes?</p>
      {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2"><CompactButton type="button" disabled={saving} onClick={() => setWithdraw(null)}>Cancel</CompactButton><CompactButton type="button" disabled={saving} onClick={() => void confirmWithdraw()}>{saving ? "Withdrawing…" : "Withdraw"}</CompactButton></div>
    </DetailDrawer>
  </section>;
}
