"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { ManagementDisclosure } from "@/components/admin/AdminConsole";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import EndorsementWordingEditor from "@/components/dashboard/EndorsementWordingEditor";
import { endorsementTemplateDataVersion } from "@/components/tools-native/templates";
import {
  ENDORSEMENT_TEMPLATE_CATEGORY_ORDER,
  getEndorsementTemplateCategory,
} from "@/lib/endorsement-template-categories";
import {
  createEndorsementTemplate,
  fetchAdminEndorsementTemplates,
  fetchEndorsementTemplateSettings,
  fetchEndorsementTemplateChangeRequests,
  reviewEndorsementTemplateChangeRequest,
  updateEndorsementTemplate,
  updateEndorsementTemplateSettings,
  type EndorsementTemplate,
  type EndorsementTemplateField,
  type EndorsementTemplateSettings,
  type EndorsementTemplateChangeRequest,
  type EndorsementTemplateStatus,
} from "@/lib/endorsement-templates";
import {
  ENDORSEMENT_BASE_FILL_INS,
  appendEndorsementSignatureBlock,
  getEndorsementStatementTokens,
  normalizeEndorsementAutomaticFieldKey,
  parseEndorsementWording,
  serializeEndorsementStatement,
  stripEndorsementSignatureBlock,
} from "@/lib/endorsement-wording";
import { fetchCurrentProfile } from "@/lib/profile";

type TemplateFormState = {
  id: string | null;
  key: string;
  reference_number: string;
  title: string;
  body: string;
  fields: EndorsementTemplateField[];
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
  fields: [],
  category: ENDORSEMENT_TEMPLATE_CATEGORY_ORDER[0],
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

function createUniqueTemplateKey(title: string, templates: EndorsementTemplate[]) {
  const base = slugifyTemplateKey(title) || "endorsement";
  const usedKeys = new Set(templates.map((template) => template.key));
  if (!usedKeys.has(base)) return base;

  let suffix = 2;
  while (usedKeys.has(`${base.slice(0, 76)}-${suffix}`)) {
    suffix += 1;
  }
  return `${base.slice(0, 76)}-${suffix}`;
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
    body: stripEndorsementSignatureBlock(template.body),
    fields: template.fields,
    category: template.category ?? "",
    status: template.status,
    sort_order: String(template.sort_order),
  };
}

function getAutomaticSortOrder(form: TemplateFormState, templates: EndorsementTemplate[]) {
  const referenceMatch = form.reference_number.trim().toUpperCase().match(/^A([1-9][0-9]?)$/);
  if (referenceMatch) return Number(referenceMatch[1]);
  if (form.id) return Number.parseInt(form.sort_order, 10) || 0;

  const categoryOrders = templates
    .filter((template) => (template.category ?? "") === form.category)
    .map((template) => template.sort_order);
  return (categoryOrders.length > 0 ? Math.max(...categoryOrders) : 0) + 10;
}

function getFormInput(
  form: TemplateFormState,
  userId: string | null | undefined,
  templates: EndorsementTemplate[]
) {
  if (!form.body.trim()) {
    throw new Error("Enter the endorsement wording before saving.");
  }

  const bodyTokens = new Set(getEndorsementStatementTokens(form.body));
  const baseFieldKeys = new Set(
    (ENDORSEMENT_BASE_FILL_INS as EndorsementTemplateField[]).map((field) => field.key)
  );
  const configuredFieldKeys = new Set(
    form.fields.map((field) => normalizeEndorsementAutomaticFieldKey(field.key))
  );
  const missingField = Array.from(bodyTokens).find(
    (key) => !baseFieldKeys.has(key) && !configuredFieldKeys.has(key)
  );
  if (missingField) {
    throw new Error("One of the fill-ins needs a question before this endorsement can be saved.");
  }

  return {
    key: form.key || createUniqueTemplateKey(form.title, templates),
    reference_number: form.reference_number,
    title: form.title,
    body: appendEndorsementSignatureBlock(
      serializeEndorsementStatement(parseEndorsementWording(form.body))
    ),
    fields: form.fields.filter((field, index, allFields) =>
      bodyTokens.has(normalizeEndorsementAutomaticFieldKey(field.key)) &&
      !baseFieldKeys.has(normalizeEndorsementAutomaticFieldKey(field.key)) &&
      allFields.findIndex((candidate) => candidate.key === field.key) === index
    ),
    category: form.category,
    status: form.status,
    sort_order: getAutomaticSortOrder(form, templates),
    userId,
  };
}

function getPreviewState(form: TemplateFormState) {
  const tokenMatches = Array.from(new Set(form.body.match(/\{([^}]+)\}/g) ?? []))
    .map((token) => token.slice(1, -1))
    .map(normalizeEndorsementAutomaticFieldKey)
    .filter(Boolean);
  const baseFields = ENDORSEMENT_BASE_FILL_INS as EndorsementTemplateField[];
  const availableFields = new Map(
    [...baseFields, ...form.fields].map((field) => [normalizeEndorsementAutomaticFieldKey(field.key), field])
  );

  const rendered = tokenMatches.reduce(
    (content, token) =>
      content.replaceAll(
        `{${token}}`,
        sampleValues[token] ?? `[${availableFields.get(token)?.label ?? "Fill-in"}]`
      ),
    serializeEndorsementStatement(parseEndorsementWording(form.body))
  );
  const missingFields = tokenMatches.filter((token) => !availableFields.has(token));

  return { missingFields, rendered, tokenMatches };
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
  const [changeRequests, setChangeRequests] = useState<EndorsementTemplateChangeRequest[]>([]);

  const isAdmin = profileRole === "admin";
  const previewState = useMemo(() => getPreviewState(form), [form]);
  const fillInSuggestions = useMemo(() => {
    const byKey = new Map<string, EndorsementTemplateField>();
    for (const template of templates) {
      for (const field of template.fields) {
        if (!byKey.has(field.key)) byKey.set(field.key, field);
      }
    }
    return Array.from(byKey.values());
  }, [templates]);
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

  async function reloadChangeRequests() {
    setChangeRequests(await fetchEndorsementTemplateChangeRequests());
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

        await Promise.all([reloadTemplates(), reloadSourceSettings(), reloadChangeRequests()]);
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

  useEffect(() => {
    if (!editorOpen && !sourceEditorOpen && !previewTemplate) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector("[data-endorsement-child-dialog]")) return;
      if (editorOpen) {
        setForm(emptyForm);
        setEditorOpen(false);
      } else if (sourceEditorOpen) {
        setSourceEditorOpen(false);
      } else {
        setPreviewTemplate(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editorOpen, previewTemplate, sourceEditorOpen]);

  function updateForm<K extends keyof TemplateFormState>(key: K, value: TemplateFormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
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
      const input = getFormInput(form, session?.user?.id, templates);
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

  async function handleReview(request: EndorsementTemplateChangeRequest, approve: boolean) {
    if (!isAdmin) return;
    const note = window.prompt(approve ? "Optional approval note" : "Reason for rejection") ?? "";
    if (!approve && !note.trim()) {
      setStatus("A rejection reason is required.");
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      await reviewEndorsementTemplateChangeRequest(request.id, approve, note);
      await Promise.all([reloadTemplates(), reloadChangeRequests()]);
      setStatus(approve ? "Proposal approved and published." : "Proposal rejected.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to review this proposal."));
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
    <ManagementDisclosure
      id="endorsement-templates"
      eyebrow="Manage"
      title="Endorsement Wording"
      summary={`${filteredTemplates.length}`}
      actions={<div className="flex flex-wrap gap-2">
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
        </div>}
      openOnAction
      helpContent={<><p>Add or edit the official wording, then insert fill-ins wherever users need to provide information. The generator adds signature details automatically.</p><p>Hide an endorsement while it is being prepared; archive it when it should no longer appear in the generator. Organization proposals require platform approval before they affect live wording.</p></>}
    >

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search endorsements"
        className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
      />
      {status ? <p className="mt-3 text-sm text-slate-600">{status}</p> : null}

      <ManagementDisclosure id="endorsement-template-requests" title="Template change requests" summary={`${changeRequests.filter((request) => request.status === "pending").length} pending`} helpContent={<p>Approval applies the proposed wording atomically to the live templates. Rejection requires a reason.</p>}>
        <div className="mt-3 grid gap-3">
          {changeRequests.filter((request) => request.status === "pending").length === 0 ? <p className="text-sm text-slate-500">No pending organization proposals.</p> : changeRequests.filter((request) => request.status === "pending").map((request) => (
            <div key={request.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-950">{request.proposed_data.reference_number ? `${request.proposed_data.reference_number} · ` : ""}{request.proposed_data.title}</p><p className="mt-1 text-xs text-slate-500">{request.action === "create" ? "Create" : "Update"} · Organization {request.organization_id}</p></div><span className="saas-pill">Pending</span></div>
              <div className="mt-3 flex gap-2"><button type="button" className="primary-button" disabled={saving} onClick={() => void handleReview(request, true)}>Approve & publish</button><button type="button" className="danger-button-compact" disabled={saving} onClick={() => void handleReview(request, false)}>Reject</button></div>
            </div>
          ))}
        </div>
      </ManagementDisclosure>

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
                        </div>
                        <span className="saas-pill">{getVisibilityLabel(template.status)}</span>
                      </div>
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
        <div className="fixed inset-0 z-[9999] flex justify-end bg-slate-950/50">
          <div role="dialog" aria-modal="true" className="h-full w-full max-w-3xl overflow-auto bg-white p-4 shadow-2xl sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">{form.id ? "Edit endorsement" : "New endorsement"}</p>
                <h2 className="text-xl font-semibold text-slate-950">
                  {form.title || "Endorsement details"}
                </h2>
              </div>
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                onClick={() => {
                  setForm(emptyForm);
                  setEditorOpen(false);
                }}
              >
                Close
              </button>
            </div>

            <div className="mt-3 grid gap-x-3 gap-y-2 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Name
                <input
                  value={form.title}
                  onChange={(event) => updateForm("title", event.target.value)}
                  className="rounded-md border border-slate-200 px-3 py-1.5 font-normal"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                AC number <span className="text-xs font-normal text-slate-400">A1-A96</span>
                <input
                  value={form.reference_number}
                  onChange={(event) => updateForm("reference_number", event.target.value)}
                  placeholder="A1"
                  className="rounded-md border border-slate-200 px-3 py-1.5 font-normal"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Type
                <select
                  value={form.category}
                  onChange={(event) => updateForm("category", event.target.value)}
                  className="rounded-md border border-slate-200 px-3 py-1.5 font-normal"
                >
                  {ENDORSEMENT_TEMPLATE_CATEGORY_ORDER.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Where it appears
                <select
                  value={form.status}
                  onChange={(event) => updateForm("status", event.target.value as EndorsementTemplateStatus)}
                  className="rounded-md border border-slate-200 px-3 py-1.5 font-normal"
                >
                  <option value="active">Show in the generator</option>
                  <option value="inactive">Hide for now</option>
                  <option value="archived">Archive</option>
                </select>
              </label>
            </div>

            <EndorsementWordingEditor
              body={form.body}
              fields={form.fields}
              suggestions={fillInSuggestions}
              onChange={(body, fields) => setForm((current) => ({ ...current, body, fields }))}
            />

            <div className="mt-3 border-t border-slate-200 pt-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-semibold uppercase text-slate-600">Preview</p>
                <span className="text-xs text-slate-400">{previewState.tokenMatches.length || 0} fill-ins</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-slate-700">
                {previewState.rendered || "Add endorsement wording to see a preview."}
              </p>
              <div className="mt-2 text-xs leading-5 text-slate-500">
                <p>Date: 07/16/2026</p>
                <p>Alex Instructor · 9876543CFI · Exp. 12/31/2027</p>
              </div>
              {previewState.missingFields.length > 0 ? (
                <p className="mt-1 text-xs text-amber-700">
                  Some fill-ins need a question before this endorsement can be saved.
                </p>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3">
              <button
                type="button"
                className="rounded-md bg-blue-800 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving..." : form.id ? "Save changes" : "Create endorsement"}
              </button>
            </div>
          </div>
        </div>
          )
        : null}

      {sourceEditorOpen
        ? renderOverlay(
            <div className="fixed inset-0 z-[9999] flex justify-end bg-slate-950/50">
              <div role="dialog" aria-modal="true" className="h-full w-full max-w-2xl overflow-auto bg-white p-5 shadow-2xl">
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
                  Click Add endorsement, choose its type, then enter the wording. Insert fill-ins wherever users
                  need to provide information. Choose Show in the generator when it is ready.
                </p>
              </section>
              <section>
                <h3 className="font-semibold text-slate-900">Edit</h3>
                <p>
                  Click an endorsement card to preview it, then click Edit. Each fill-in can be moved, changed or
                  removed without editing any code.
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
    </ManagementDisclosure>
  );
}
