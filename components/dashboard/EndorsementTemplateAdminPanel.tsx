"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { endorsementTemplateDataVersion } from "@/components/tools-native/templates";
import {
  ENDORSEMENT_TEMPLATE_CATEGORY_ORDER,
  getEndorsementTemplateCategory,
} from "@/lib/endorsement-template-categories";
import {
  createEndorsementTemplate,
  fetchAdminEndorsementTemplates,
  fetchEndorsementTemplateSettings,
  updateEndorsementTemplate,
  updateEndorsementTemplateSettings,
  type EndorsementTemplate,
  type EndorsementTemplateSettings,
  type EndorsementTemplateStatus,
} from "@/lib/endorsement-templates";
import { fetchCurrentProfile } from "@/lib/profile";

type TemplateFormState = {
  id: string | null;
  key: string;
  reference_number: string;
  title: string;
  body: string;
  fieldsJson: string;
  category: string;
  status: EndorsementTemplateStatus;
  sort_order: string;
};

type SourceFormState = {
  source: string;
  source_date: string;
  updated_date: string;
};

const emptyForm: TemplateFormState = {
  id: null,
  key: "",
  reference_number: "",
  title: "",
  body: "",
  fieldsJson: "[]",
  category: "",
  status: "inactive",
  sort_order: "0",
};

const emptySourceForm: SourceFormState = {
  source: endorsementTemplateDataVersion.source,
  source_date: endorsementTemplateDataVersion.sourceDate,
  updated_date: endorsementTemplateDataVersion.updatedAt,
};

const sampleValues: Record<string, string> = {
  aircraft: "Cessna 172",
  aircraftCategory: "Airplane",
  airspaceName: "Class B",
  airportName: "KJFK",
  airportPair: "KABC and KXYZ",
  annualReviewDueDate: "12/31/2026",
  categoryClass: "Airplane Single-Engine Land",
  certificateType: "Private Pilot certificate with Airplane Single-Engine Land rating",
  citizenshipDocument: "U.S. passport",
  citizenshipDocumentNumber: "123456789",
  categoryClassModel: "Airplane Single-Engine Land, Cessna 172",
  categoryClassType: "Airplane Single-Engine Land",
  certificateCategoryClass: "Airplane Single-Engine Land",
  certificateLevel: "Private Pilot",
  certificateRatingPrivilege: "Private Pilot",
  commercialPilotPracticalCategory: "Airplane Single-Engine Land",
  commercialPilotTestCategory: "Airplane",
  date: "07/16/2026",
  efvsOperationRule: "14 CFR § 91.176(a)",
  eventDate: "07/16/2026",
  flightInstructorKnowledgeTest: "Airplane",
  gliderLaunchMethod: "aerotow",
  instructorCertExpDate: "12/31/2027",
  instructorCertNumber: "9876543CFI",
  instructorName: "Alex Instructor",
  instrumentRatingCategory: "airplane",
  knowledgeTestName: "Private Pilot Airplane",
  limitations: "day VFR only",
  localConditions: "No additional limitations.",
  pilotCertificateGrade: "Student",
  practicalTestCertificate: "Private Pilot",
  practicalTestType: "Private Pilot Airplane Single-Engine Land practical test",
  privatePilotPracticalCategory: "Airplane Single-Engine Land",
  privatePilotTestCategory: "Airplane",
  recreationalPilotTestCategory: "Airplane Single-Engine Land",
  routeDescription: "direct",
  routeFrom: "KABC",
  routeLandings: "KDEF",
  routeStudentName: "Jordan Pilot",
  routeTo: "KXYZ",
  retestTestName: "Private Pilot practical test",
  spinAircraftCategory: "airplane",
  sportCfiKnowledgeTest: "Airplane",
  sportPilotPracticalCategory: "Airplane Single-Engine Land",
  sportPilotTestCategory: "Airplane",
  studentCertNumber: "1234567",
  studentName: "Jordan Pilot",
  trainingAircraft: "Cessna 172",
  trainingType: "flight",
  typeRating: "CE-525",
  wingsLevel: "Basic",
  wingsPhaseNumber: "1",
};

function slugifyTemplateKey(title: string) {
  return title
    .toLowerCase()
    .replace(/<=/g, "lte")
    .replace(/>=/g, "gte")
    .replace(/</g, "lt")
    .replace(/>/g, "gt")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function getVisibilityLabel(status: EndorsementTemplateStatus) {
  if (status === "active") {
    return "Shown in generator";
  }

  if (status === "archived") {
    return "Archived";
  }

  return "Hidden";
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint]
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean);

    if (parts.length > 0) {
      return parts.join(" ");
    }
  }

  return fallback;
}

function createFormFromTemplate(template: EndorsementTemplate): TemplateFormState {
  return {
    id: template.id,
    key: template.key,
    reference_number: template.reference_number ?? "",
    title: template.title,
    body: template.body,
    fieldsJson: JSON.stringify(template.fields, null, 2),
    category: template.category ?? "",
    status: template.status,
    sort_order: String(template.sort_order),
  };
}

function parseFieldsJson(fieldsJson: string) {
  try {
    return JSON.parse(fieldsJson);
  } catch {
    throw new Error("The fill-in questions list is not valid. Check the brackets, commas, and quotes.");
  }
}

function getFormInput(form: TemplateFormState, userId: string | null | undefined) {
  return {
    key: form.key,
    reference_number: form.reference_number,
    title: form.title,
    body: form.body,
    fields: parseFieldsJson(form.fieldsJson),
    category: form.category,
    status: form.status,
    sort_order: Number.parseInt(form.sort_order, 10),
    userId,
  };
}

function getPreviewState(form: TemplateFormState) {
  const tokenMatches = Array.from(new Set(form.body.match(/\{([^}]+)\}/g) ?? []))
    .map((token) => token.slice(1, -1))
    .filter(Boolean);
  let fieldKeys = new Set<string>();
  let fieldsError = "";

  try {
    const parsedFields = parseFieldsJson(form.fieldsJson);
    fieldKeys = new Set(
      Array.isArray(parsedFields)
        ? parsedFields
            .map((field) => (field && typeof field === "object" ? String(field.key ?? "") : ""))
            .filter(Boolean)
        : []
    );
  } catch (error) {
    fieldsError = getErrorMessage(error, "The fill-in questions list is not valid.");
  }

  const rendered = tokenMatches.reduce(
    (content, token) => content.replaceAll(`{${token}}`, sampleValues[token] ?? `[${token}]`),
    form.body
  );
  const missingFields = tokenMatches.filter((token) => !sampleValues[token] && !fieldKeys.has(token));
  const unusedFields = Array.from(fieldKeys).filter((key) => !tokenMatches.includes(key));

  return { fieldsError, missingFields, rendered, tokenMatches, unusedFields };
}

function getDisplayCategory(template: EndorsementTemplate) {
  return template.category || getEndorsementTemplateCategory(template.title, template.reference_number) || "Other endorsements";
}

function createSourceFormFromSettings(settings: EndorsementTemplateSettings): SourceFormState {
  return {
    source: settings.source,
    source_date: settings.source_date,
    updated_date: settings.updated_date,
  };
}

function renderOverlay(content: ReactNode) {
  if (typeof document === "undefined") {
    return content;
  }

  return createPortal(content, document.body);
}

export default function EndorsementTemplateAdminPanel() {
  const { session } = useAuthSession();
  const [profileRole, setProfileRole] = useState("");
  const [templates, setTemplates] = useState<EndorsementTemplate[]>([]);
  const [sourceSettings, setSourceSettings] = useState<EndorsementTemplateSettings | null>(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<TemplateFormState>(emptyForm);
  const [sourceForm, setSourceForm] = useState<SourceFormState>(emptySourceForm);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EndorsementTemplate | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [sourceEditorOpen, setSourceEditorOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const isAdmin = profileRole === "admin";
  const previewState = useMemo(() => getPreviewState(form), [form]);
  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return templates;
    }

    return templates.filter((template) =>
      [
        template.title,
        template.key,
        template.reference_number,
        template.category,
        template.status,
        template.body,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery))
    );
  }, [query, templates]);
  const groupedTemplates = useMemo(() => {
    const groups = filteredTemplates.reduce<Record<string, EndorsementTemplate[]>>((accumulator, template) => {
      const category = getDisplayCategory(template);
      accumulator[category] = accumulator[category] ?? [];
      accumulator[category].push(template);
      return accumulator;
    }, {});

    return Object.entries(groups).sort(([leftCategory], [rightCategory]) => {
      const leftIndex = ENDORSEMENT_TEMPLATE_CATEGORY_ORDER.indexOf(leftCategory);
      const rightIndex = ENDORSEMENT_TEMPLATE_CATEGORY_ORDER.indexOf(rightCategory);

      if (leftIndex !== -1 || rightIndex !== -1) {
        if (leftIndex === -1) {
          return 1;
        }
        if (rightIndex === -1) {
          return -1;
        }
        return leftIndex - rightIndex;
      }

      return leftCategory.localeCompare(rightCategory);
    });
  }, [filteredTemplates]);

  async function reloadTemplates() {
    const nextTemplates = await fetchAdminEndorsementTemplates();
    setTemplates(nextTemplates);
  }

  async function reloadSourceSettings() {
    const nextSettings = await fetchEndorsementTemplateSettings();
    setSourceSettings(nextSettings);
    setSourceForm(createSourceFormFromSettings(nextSettings));
  }

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!session?.user?.id) {
        if (!cancelled) {
          setProfileRole("");
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setStatus("");

      try {
        const profile = await fetchCurrentProfile(session.user.id);
        const nextRole = String(profile?.role ?? "user").trim().toLowerCase();

        if (cancelled) {
          return;
        }

        setProfileRole(nextRole);

        if (nextRole !== "admin") {
          setTemplates([]);
          return;
        }

        await Promise.all([reloadTemplates(), reloadSourceSettings()]);
      } catch (error) {
        if (!cancelled) {
          setStatus(getErrorMessage(error, "Unable to load endorsement wording right now."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  function updateForm<K extends keyof TemplateFormState>(key: K, value: TemplateFormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "title" && !current.id && !current.key
        ? { key: slugifyTemplateKey(String(value)) }
        : {}),
    }));
  }

  function updateSourceForm<K extends keyof SourceFormState>(key: K, value: SourceFormState[K]) {
    setSourceForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSave() {
    if (!isAdmin) {
      return;
    }

    setSaving(true);
    setStatus("");

    try {
      const input = getFormInput(form, session?.user?.id);
      if (form.id) {
        await updateEndorsementTemplate(form.id, input);
        setStatus("Saved.");
      } else {
        await createEndorsementTemplate(input);
        setForm(emptyForm);
        setStatus("Created.");
      }

      await reloadTemplates();
      setEditorOpen(false);
      setPreviewTemplate(null);
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to save this endorsement wording."));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSourceDetails() {
    if (!isAdmin) {
      return;
    }

    setSaving(true);
    setStatus("");

    try {
      const nextSettings = await updateEndorsementTemplateSettings({
        ...sourceForm,
        userId: session?.user?.id,
      });
      setSourceSettings(nextSettings);
      setSourceForm(createSourceFormFromSettings(nextSettings));
      setSourceEditorOpen(false);
      setStatus("Source details saved.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to save the source details."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="panel-card p-6">Loading endorsement wording...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="panel-card p-6">
        <p className="text-sm font-semibold text-slate-900">You need admin access to manage endorsements.</p>
      </div>
    );
  }

  return (
    <section className="panel-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Manage</p>
          <h1 className="text-2xl font-semibold text-slate-950">Endorsement Wording</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="secondary-button" onClick={() => setGuideOpen(true)}>
            Help
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              if (sourceSettings) {
                setSourceForm(createSourceFormFromSettings(sourceSettings));
              }
              setSourceEditorOpen(true);
            }}
          >
            Source details
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setForm(emptyForm);
              setEditorOpen(true);
            }}
          >
            Add endorsement
          </button>
        </div>
      </div>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search endorsements"
        className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
      />
      {status ? <p className="mt-3 text-sm text-slate-600">{status}</p> : null}

      <div className="mt-4 grid gap-3">
        {groupedTemplates.map(([category, categoryTemplates]) => {
          const isOpen = openCategory === category;

          return (
            <section key={category} className="rounded-xl border border-slate-200 bg-white">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={() => setOpenCategory((current) => (current === category ? null : category))}
              >
                <div>
                  <h2 className="text-sm font-semibold text-slate-950">{category}</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {categoryTemplates.length} endorsement{categoryTemplates.length === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="text-sm text-slate-500">{isOpen ? "Hide" : "Show"}</span>
              </button>

              {isOpen ? (
                <div className="grid gap-3 border-t border-slate-100 p-3 md:grid-cols-2 xl:grid-cols-3">
                  {categoryTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className="rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300"
                      onClick={() => setPreviewTemplate(template)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            {template.reference_number ? <span className="saas-pill">{template.reference_number}</span> : null}
                            <p className="text-sm font-semibold text-slate-950">{template.title}</p>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">Short name: {template.key}</p>
                        </div>
                        <span className="saas-pill">{getVisibilityLabel(template.status)}</span>
                      </div>
                      <p className="mt-2 line-clamp-3 text-xs text-slate-500">{template.body}</p>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
        {filteredTemplates.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            No endorsements match the current search.
          </p>
        ) : null}
      </div>

      {previewTemplate
        ? renderOverlay(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4">
              <div className="max-h-[86vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="eyebrow">Preview endorsement</p>
                    <h2 className="text-xl font-semibold text-slate-950">{previewTemplate.title}</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {[previewTemplate.reference_number, getDisplayCategory(previewTemplate)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <button type="button" className="secondary-button" onClick={() => setPreviewTemplate(null)}>
                    Close
                  </button>
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
                    {getPreviewState(createFormFromTemplate(previewTemplate)).rendered}
                  </p>
                </div>

                <div className="mt-4 grid gap-2 text-sm text-slate-600">
                  <span>Short name: {previewTemplate.key}</span>
                  {previewTemplate.reference_number ? <span>AC number: {previewTemplate.reference_number}</span> : null}
                  <span>Where it appears: {getVisibilityLabel(previewTemplate.status)}</span>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => {
                      setForm(createFormFromTemplate(previewTemplate));
                      setPreviewTemplate(null);
                      setEditorOpen(true);
                    }}
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>
          )
        : null}

      {editorOpen
        ? renderOverlay(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">{form.id ? "Edit endorsement" : "New endorsement"}</p>
                <h2 className="text-xl font-semibold text-slate-950">
                  {form.title || "Endorsement details"}
                </h2>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setForm(emptyForm);
                  setEditorOpen(false);
                }}
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Name shown in the list
                <input
                  value={form.title}
                  onChange={(event) => updateForm("title", event.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 font-normal"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Unique short name
                <input
                  value={form.key}
                  onChange={(event) => updateForm("key", event.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 font-normal"
                />
                <span className="text-xs font-normal text-slate-500">
                  Used to keep this endorsement separate from the others. Lowercase letters, numbers, and hyphens only.
                </span>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                AC number
                <input
                  value={form.reference_number}
                  onChange={(event) => updateForm("reference_number", event.target.value)}
                  placeholder="A1"
                  className="rounded-xl border border-slate-200 px-3 py-2 font-normal"
                />
                <span className="text-xs font-normal text-slate-500">
                  Use A1 through A96. Leave empty only for archived older copies.
                </span>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Group
                <input
                  value={form.category}
                  onChange={(event) => updateForm("category", event.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 font-normal"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Where it appears
                <select
                  value={form.status}
                  onChange={(event) => updateForm("status", event.target.value as EndorsementTemplateStatus)}
                  className="rounded-xl border border-slate-200 px-3 py-2 font-normal"
                >
                  <option value="active">Show in the generator</option>
                  <option value="inactive">Hide for now</option>
                  <option value="archived">Archive</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                List order
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(event) => updateForm("sort_order", event.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 font-normal"
                />
              </label>
            </div>

            <label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">
              Endorsement wording
              <textarea
                value={form.body}
                onChange={(event) => updateForm("body", event.target.value)}
                rows={8}
                className="rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs font-normal"
              />
            </label>

            <label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">
              Fill-in questions
              <textarea
                value={form.fieldsJson}
                onChange={(event) => updateForm("fieldsJson", event.target.value)}
                rows={8}
                className="rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs font-normal"
              />
              <span className="text-xs font-normal text-slate-500">
                These control the questions a user answers before printing. Keep the existing format unless you are adding a new blank.
              </span>
            </label>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Preview</p>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">
                {previewState.rendered || "Add endorsement wording to see a preview."}
              </p>
              <div className="mt-3 grid gap-1 text-xs text-slate-500">
                <span>Fill-in blanks: {previewState.tokenMatches.length || 0}</span>
                {previewState.fieldsError ? <span className="text-red-600">{previewState.fieldsError}</span> : null}
                {previewState.missingFields.length > 0 ? (
                  <span className="text-amber-700">
                    These blanks need a fill-in question: {previewState.missingFields.join(", ")}
                  </span>
                ) : null}
                {previewState.unusedFields.length > 0 ? (
                  <span>Questions not used in the wording: {previewState.unusedFields.join(", ")}</span>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className="primary-button" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : form.id ? "Save changes" : "Create endorsement"}
              </button>
            </div>
          </div>
        </div>
          )
        : null}

      {sourceEditorOpen
        ? renderOverlay(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4">
              <div className="max-h-[86vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="eyebrow">Source details</p>
                    <h2 className="text-xl font-semibold text-slate-950">Generator source text</h2>
                  </div>
                  <button type="button" className="secondary-button" onClick={() => setSourceEditorOpen(false)}>
                    Close
                  </button>
                </div>

                <div className="mt-4 grid gap-3">
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Template data
                    <input
                      value={sourceForm.source}
                      onChange={(event) => updateSourceForm("source", event.target.value)}
                      className="rounded-xl border border-slate-200 px-3 py-2 font-normal"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Source date
                    <input
                      value={sourceForm.source_date}
                      onChange={(event) => updateSourceForm("source_date", event.target.value)}
                      className="rounded-xl border border-slate-200 px-3 py-2 font-normal"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Updated
                    <input
                      value={sourceForm.updated_date}
                      onChange={(event) => updateSourceForm("updated_date", event.target.value)}
                      className="rounded-xl border border-slate-200 px-3 py-2 font-normal"
                    />
                  </label>
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <p>Template data: {sourceForm.source || "--"}</p>
                  <p>Source date: {sourceForm.source_date || "--"}</p>
                  <p>Updated: {sourceForm.updated_date || "--"}</p>
                </div>

                <div className="mt-5">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={handleSaveSourceDetails}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save source details"}
                  </button>
                </div>
              </div>
            </div>
          )
        : null}

      {guideOpen
        ? renderOverlay(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[86vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Endorsement wording</p>
                <h2 className="text-xl font-semibold text-slate-950">How to Manage Endorsements</h2>
              </div>
              <button type="button" className="secondary-button" onClick={() => setGuideOpen(false)}>
                Close
              </button>
            </div>
            <div className="mt-5 grid gap-4 text-sm leading-6 text-slate-600">
              <section>
                <h3 className="font-semibold text-slate-900">Add</h3>
                <p>
                  Click Add endorsement, then fill in the name, unique short name, group, wording, fill-in questions,
                  visibility, and list order. Choose Show in the generator when it is ready for users.
                </p>
              </section>
              <section>
                <h3 className="font-semibold text-slate-900">Edit</h3>
                <p>
                  Click an endorsement card to preview it, then click Edit. Use placeholders like {"{studentName}"}
                  for blanks. If you add a new blank, also add a matching question under Fill-in questions.
                </p>
              </section>
              <section>
                <h3 className="font-semibold text-slate-900">Hide or archive</h3>
                <p>
                  Change Where it appears to Hide for now when you want to keep working on it. Choose Archive when
                  you no longer want it in the generator.
                </p>
              </section>
            </div>
          </div>
        </div>
          )
        : null}
    </section>
  );
}
