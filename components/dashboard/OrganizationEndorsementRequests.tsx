"use client";

import { type Dispatch, type SetStateAction, useEffect, useState } from "react";

import {
  AdminDataTable,
  CompactButton,
  CompactToolbar,
  DetailDrawer,
  EmptyState,
  StatusBadge,
  WorksheetCell,
  WorksheetGrid,
  WorksheetHeader,
  worksheetInputClass,
} from "@/components/admin/AdminConsole";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import {
  fetchAdminEndorsementTemplates,
  fetchEndorsementTemplateChangeRequests,
  submitEndorsementTemplateChangeRequest,
  type EndorsementTemplate,
  type EndorsementTemplateChangeRequest,
  type EndorsementTemplateStatus,
} from "@/lib/endorsement-templates";

type Props = { organizationId: string; embedded?: boolean };
type FormState = {
  template_id: string;
  key: string;
  reference_number: string;
  title: string;
  body: string;
  fieldsJson: string;
  category: string;
  status: EndorsementTemplateStatus;
  sort_order: string;
};

const emptyForm: FormState = {
  template_id: "",
  key: "",
  reference_number: "",
  title: "",
  body: "",
  fieldsJson: "[]",
  category: "",
  status: "inactive",
  sort_order: "0",
};

export default function OrganizationEndorsementRequests({ organizationId, embedded = false }: Props) {
  const { session } = useAuthSession();
  const [templates, setTemplates] = useState<EndorsementTemplate[]>([]);
  const [requests, setRequests] = useState<EndorsementTemplateChangeRequest[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function reload() {
    const [nextTemplates, nextRequests] = await Promise.all([
      fetchAdminEndorsementTemplates(),
      fetchEndorsementTemplateChangeRequests(organizationId),
    ]);
    setTemplates(nextTemplates);
    setRequests(nextRequests);
  }

  useEffect(() => {
    setMessage("");
    void reload().catch((error) => setMessage(getErrorMessage(error, "Unable to load endorsement proposals.")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  function chooseTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) {
      setForm(emptyForm);
      return;
    }
    setForm({
      template_id: template.id,
      key: template.key,
      reference_number: template.reference_number ?? "",
      title: template.title,
      body: template.body,
      fieldsJson: JSON.stringify(template.fields, null, 2),
      category: template.category ?? "",
      status: template.status,
      sort_order: String(template.sort_order),
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const fields = JSON.parse(form.fieldsJson);
      await submitEndorsementTemplateChangeRequest(organizationId, form.template_id || null, {
        key: form.key,
        reference_number: form.reference_number,
        title: form.title,
        body: form.body,
        fields,
        category: form.category,
        status: form.status,
        sort_order: Number.parseInt(form.sort_order, 10),
        userId: session?.user?.id,
      });
      await reload();
      setForm(emptyForm);
      setOpen(false);
      setMessage("Template change request submitted for platform review.");
    } catch (error) {
      setMessage(getErrorMessage(error, "Unable to submit this endorsement proposal."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={embedded ? "" : "grid gap-3"}>
      {message ? <p role="status" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">{message}</p> : null}
      <AdminDataTable label="Endorsement template change requests">
        <thead>
          <tr>
            <th colSpan={5} className="p-0 font-normal">
              <CompactToolbar
                resultLabel={`${requests.length} requests`}
                actions={<CompactButton type="button" tone="primary" onClick={() => { setForm(emptyForm); setOpen(true); }}>Request change</CompactButton>}
              />
            </th>
          </tr>
          <tr className="border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700">
            <th className="px-3 py-2">Endorsement</th>
            <th className="px-3 py-2">Change</th>
            <th className="px-3 py-2">Submitted</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Review note</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {!requests.length ? <tr><td colSpan={5}><EmptyState title="No endorsement requests" description="Proposed wording changes will appear here." /></td></tr> : null}
          {requests.map((request) => (
            <tr key={request.id} className="hover:bg-blue-50/40">
              <td className="px-3 py-2 font-semibold text-slate-950">{request.proposed_data.reference_number ? `${request.proposed_data.reference_number} · ` : ""}{request.proposed_data.title}</td>
              <td className="px-3 py-2 text-xs text-slate-600">{request.action === "create" ? "New endorsement" : "Update"}</td>
              <td className="px-3 py-2 text-xs text-slate-500">{new Date(request.submitted_at).toLocaleString()}</td>
              <td className="px-3 py-2"><StatusBadge tone={request.status === "approved" ? "success" : request.status === "rejected" ? "danger" : "warning"}>{formatStatus(request.status)}</StatusBadge></td>
              <td className="max-w-sm px-3 py-2 text-xs text-slate-600">{request.review_note || "—"}</td>
            </tr>
          ))}
        </tbody>
      </AdminDataTable>

      <DetailDrawer open={open} width="wide" onClose={() => setOpen(false)} title="Request endorsement change" description="Choose an existing endorsement to copy, or leave it blank to propose a new one.">
        <form onSubmit={submit}>
          <label className="grid gap-1 text-xs font-semibold text-slate-700">
            Existing endorsement
            <select autoFocus className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-normal" value={form.template_id} onChange={(event) => chooseTemplate(event.target.value)}>
              <option value="">New endorsement</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.reference_number ? `${template.reference_number} · ` : ""}{template.title}</option>)}
            </select>
          </label>
          <div className="mt-3">
            <WorksheetGrid label="Endorsement request details" minWidth={760}>
              <thead><tr><WorksheetHeader>Unique key</WorksheetHeader><WorksheetHeader>AC number</WorksheetHeader><WorksheetHeader>Title</WorksheetHeader><WorksheetHeader>Category</WorksheetHeader><WorksheetHeader>Status</WorksheetHeader><WorksheetHeader>Order</WorksheetHeader></tr></thead>
              <tbody><tr>
                <WorksheetCell><GridInput label="Unique key" value={form.key} onChange={(value) => updateForm(setForm, "key", value)} required /></WorksheetCell>
                <WorksheetCell><GridInput label="AC number" value={form.reference_number} onChange={(value) => updateForm(setForm, "reference_number", value)} /></WorksheetCell>
                <WorksheetCell><GridInput label="Title" value={form.title} onChange={(value) => updateForm(setForm, "title", value)} required /></WorksheetCell>
                <WorksheetCell><GridInput label="Category" value={form.category} onChange={(value) => updateForm(setForm, "category", value)} /></WorksheetCell>
                <WorksheetCell><select aria-label="Status" className={worksheetInputClass} value={form.status} onChange={(event) => updateForm(setForm, "status", event.target.value as EndorsementTemplateStatus)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></WorksheetCell>
                <WorksheetCell><GridInput label="Sort order" type="number" value={form.sort_order} onChange={(value) => updateForm(setForm, "sort_order", value)} required /></WorksheetCell>
              </tr></tbody>
            </WorksheetGrid>
          </div>
          <label className="mt-3 grid gap-1 text-xs font-semibold text-slate-700">Wording<textarea rows={8} className="rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs font-normal" value={form.body} onChange={(event) => updateForm(setForm, "body", event.target.value)} required /></label>
          <label className="mt-3 grid gap-1 text-xs font-semibold text-slate-700">Fill-in fields (JSON)<textarea rows={7} className="rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs font-normal" value={form.fieldsJson} onChange={(event) => updateForm(setForm, "fieldsJson", event.target.value)} required /></label>
          <div className="mt-4 flex justify-end gap-2"><CompactButton type="button" onClick={() => setOpen(false)}>Cancel</CompactButton><CompactButton type="submit" tone="primary" disabled={saving}>{saving ? "Submitting…" : "Submit request"}</CompactButton></div>
        </form>
      </DetailDrawer>
    </section>
  );
}

function GridInput({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <input aria-label={label} type={type} required={required} className={worksheetInputClass} value={value} onChange={(event) => onChange(event.target.value)} />;
}

function updateForm<K extends keyof FormState>(setForm: Dispatch<SetStateAction<FormState>>, key: K, value: FormState[K]) {
  setForm((current) => ({ ...current, [key]: value }));
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return fallback;
}
