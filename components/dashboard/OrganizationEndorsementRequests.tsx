"use client";

import { useEffect, useState } from "react";

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
      await submitEndorsementTemplateChangeRequest(
        organizationId,
        form.template_id || null,
        {
          key: form.key,
          reference_number: form.reference_number,
          title: form.title,
          body: form.body,
          fields,
          category: form.category,
          status: form.status,
          sort_order: Number.parseInt(form.sort_order, 10),
          userId: session?.user?.id,
        }
      );
      await reload();
      setForm(emptyForm);
      setOpen(false);
      setMessage("Template change request submitted. It will not affect the live endorsement until a platform administrator approves it.");
    } catch (error) {
      setMessage(getErrorMessage(error, "Unable to submit this endorsement proposal."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={embedded ? "" : "saas-panel"}>
      <div className="people-toolbar">
        <div>
          {!embedded ? <h2 className="saas-subsection-title">Endorsement template change requests</h2> : null}
          <p className="saas-meta-text">Organization administrators may propose wording changes. Platform approval is required before publication.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => setOpen((value) => !value)}>{open ? "Close" : "Request template change"}</button>
      </div>
      {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}

      {open ? (
        <form className="mt-5 grid gap-4 rounded-2xl border border-slate-200 bg-white/80 p-4 md:grid-cols-2" onSubmit={submit}>
          <label className="grid gap-2 text-sm md:col-span-2"><span>Change an existing endorsement, or leave blank to propose a new one</span><select className="rounded-xl border border-slate-300 px-3 py-2" value={form.template_id} onChange={(event) => chooseTemplate(event.target.value)}><option value="">New endorsement</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.reference_number ? `${template.reference_number} · ` : ""}{template.title}</option>)}</select></label>
          <Input label="Unique key" value={form.key} onChange={(value) => setForm((current) => ({ ...current, key: value }))} />
          <Input label="AC number" value={form.reference_number} onChange={(value) => setForm((current) => ({ ...current, reference_number: value }))} />
          <Input label="Title" value={form.title} onChange={(value) => setForm((current) => ({ ...current, title: value }))} />
          <Input label="Category" value={form.category} onChange={(value) => setForm((current) => ({ ...current, category: value }))} />
          <label className="grid gap-2 text-sm"><span>Status</span><select className="rounded-xl border border-slate-300 px-3 py-2" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as EndorsementTemplateStatus }))}><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></label>
          <Input label="Sort order" type="number" value={form.sort_order} onChange={(value) => setForm((current) => ({ ...current, sort_order: value }))} />
          <label className="grid gap-2 text-sm md:col-span-2"><span>Wording</span><textarea rows={7} className="rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs" value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} required /></label>
          <label className="grid gap-2 text-sm md:col-span-2"><span>Fill-in fields (JSON)</span><textarea rows={7} className="rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs" value={form.fieldsJson} onChange={(event) => setForm((current) => ({ ...current, fieldsJson: event.target.value }))} required /></label>
          <div className="md:col-span-2"><button className="primary-button" type="submit" disabled={saving}>{saving ? "Submitting..." : "Submit template change request"}</button></div>
        </form>
      ) : null}

      <div className="mt-5 grid gap-3">
        {requests.length === 0 ? <p className="saas-empty-state">No endorsement template change requests from this organization.</p> : requests.map((request) => (
          <div key={request.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-slate-900">{request.proposed_data.reference_number ? `${request.proposed_data.reference_number} · ` : ""}{request.proposed_data.title}</p><p className="saas-meta-text">{request.action === "create" ? "New endorsement" : "Update"} · {new Date(request.submitted_at).toLocaleString()}</p></div><span className="saas-pill">{request.status}</span></div>
            {request.review_note ? <p className="mt-2 text-sm text-slate-600">Review note: {request.review_note}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="grid gap-2 text-sm"><span>{label}</span><input type={type} className="rounded-xl border border-slate-300 px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)} required={label !== "AC number" && label !== "Category"} /></label>;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return fallback;
}
