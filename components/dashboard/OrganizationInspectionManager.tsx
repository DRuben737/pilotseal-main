"use client";

import { useEffect, useMemo, useState } from "react";

import { AdminCollapsibleSection } from "@/components/admin/AdminConsole";
import type { AircraftModelRecord, AircraftRecord } from "@/lib/aircraft";
import {
  deleteAircraftInspectionAssignment,
  deleteOrganizationInspectionDefinition,
  fetchAircraftInspectionAssignments,
  fetchOrganizationInspectionDefinitions,
  saveAircraftInspectionAssignment,
  saveOrganizationInspectionDefinition,
  type AircraftInspectionAssignment,
  type InspectionBasis,
  type OrganizationInspectionDefinition,
} from "@/lib/preflight";

type Props = {
  organizationId: string;
  aircraft: AircraftRecord[];
  models: AircraftModelRecord[];
  embedded?: boolean;
};

type Feedback = {
  tone: "success" | "error";
  message: string;
} | null;

const emptyDefinition = {
  name: "",
  basis: "calendar" as InspectionBasis,
  model_id: "",
  warning_days: "30",
  warning_hours: "10",
  notes: "",
};

const emptyAssignment = {
  definition_id: "",
  aircraft_id: "",
  due_date: "",
  due_meter: "",
  notes: "",
};

export default function OrganizationInspectionManager({ organizationId, aircraft, models, embedded = false }: Props) {
  const [definitions, setDefinitions] = useState<OrganizationInspectionDefinition[]>([]);
  const [assignments, setAssignments] = useState<AircraftInspectionAssignment[]>([]);
  const [definitionForm, setDefinitionForm] = useState(emptyDefinition);
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignment);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [openPanels, setOpenPanels] = useState<Set<string>>(() => new Set());

  const aircraftById = useMemo(
    () => new Map(aircraft.map((item) => [item.id, item])),
    [aircraft]
  );
  const modelById = useMemo(
    () => new Map(models.map((item) => [item.id, item])),
    [models]
  );
  const activeDefinitions = useMemo(
    () => definitions.filter((definition) => definition.is_active),
    [definitions]
  );
  const selectedDefinition = useMemo(
    () => definitions.find((definition) => definition.id === assignmentForm.definition_id) ?? null,
    [assignmentForm.definition_id, definitions]
  );
  const applicableAircraft = useMemo(
    () => {
      if (!selectedDefinition) return [];
      return selectedDefinition.model_id
        ? aircraft.filter((item) => item.model_id === selectedDefinition.model_id)
        : aircraft;
    },
    [aircraft, selectedDefinition]
  );

  function togglePanel(key: string) {
    setOpenPanels((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function reload() {
    const [nextDefinitions, assignmentGroups] = await Promise.all([
      fetchOrganizationInspectionDefinitions(organizationId),
      Promise.all(aircraft.map((item) => fetchAircraftInspectionAssignments(item.id))),
    ]);
    setDefinitions(nextDefinitions);
    setAssignments(assignmentGroups.flat());
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [nextDefinitions, assignmentGroups] = await Promise.all([
          fetchOrganizationInspectionDefinitions(organizationId),
          Promise.all(aircraft.map((item) => fetchAircraftInspectionAssignments(item.id))),
        ]);
        if (!cancelled) {
          setDefinitions(nextDefinitions);
          setAssignments(assignmentGroups.flat());
        }
      } catch (error) {
        if (!cancelled) {
          setFeedback({
            tone: "error",
            message: getErrorMessage(error, "We could not load the additional maintenance items. Try refreshing the page."),
          });
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [aircraft, organizationId]);

  async function handleSaveDefinition(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await saveOrganizationInspectionDefinition({
        organization_id: organizationId,
        name: definitionForm.name.trim(),
        basis: definitionForm.basis,
        model_id: definitionForm.model_id || null,
        warning_days: usesCalendar(definitionForm.basis)
          ? optionalNonNegativeNumber(definitionForm.warning_days, "Advance warning in days")
          : null,
        warning_hours: usesMeter(definitionForm.basis)
          ? optionalNonNegativeNumber(definitionForm.warning_hours, "Advance warning in hours")
          : null,
        notes: definitionForm.notes.trim(),
      });
      setDefinitionForm(emptyDefinition);
      await reload();
      setFeedback({ tone: "success", message: "Maintenance item saved. You can now add it to an aircraft." });
      setOpenPanels((current) => new Set(current).add("assignments"));
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getErrorMessage(error, "We could not save this maintenance item. Check the fields and try again."),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAssignment(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      if (!selectedDefinition) {
        throw new Error("Choose a maintenance item.");
      }
      if (!applicableAircraft.some((item) => item.id === assignmentForm.aircraft_id)) {
        throw new Error("Choose an aircraft that this maintenance item applies to.");
      }
      const dueDate = usesCalendar(selectedDefinition.basis)
        ? requiredValue(assignmentForm.due_date, "Enter the due date.")
        : null;
      const dueMeter = usesMeter(selectedDefinition.basis)
        ? requiredNonNegativeNumber(
            assignmentForm.due_meter,
            `Enter the ${meterName(selectedDefinition.basis)} reading when this item is due.`
          )
        : null;
      await saveAircraftInspectionAssignment({
        definition_id: assignmentForm.definition_id,
        aircraft_id: assignmentForm.aircraft_id,
        due_date: dueDate,
        due_meter: dueMeter,
        notes: assignmentForm.notes.trim(),
      });
      setAssignmentForm(emptyAssignment);
      await reload();
      setFeedback({ tone: "success", message: "Maintenance due limit added to the aircraft." });
      setOpenPanels((current) => new Set(current).add("saved"));
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getErrorMessage(error, "We could not add this maintenance item to the aircraft. Check the due limit and try again."),
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeDefinition(definition: OrganizationInspectionDefinition) {
    const linkedCount = assignments.filter((item) => item.definition_id === definition.id).length;
    const linkedCopy = linkedCount === 1 ? "1 aircraft due limit" : `${linkedCount} aircraft due limits`;
    if (!window.confirm(`Delete “${definition.name}”? This will also remove ${linkedCopy}. This cannot be undone.`)) return;
    setSaving(true);
    setFeedback(null);
    try {
      await deleteOrganizationInspectionDefinition(definition.id);
      await reload();
      setFeedback({ tone: "success", message: `“${definition.name}” was deleted.` });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getErrorMessage(error, "We could not delete this maintenance item. Try again."),
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeAssignment(assignment: AircraftInspectionAssignment) {
    const definition = definitions.find((item) => item.id === assignment.definition_id);
    const tailNumber = aircraftById.get(assignment.aircraft_id)?.tail_number ?? "this aircraft";
    if (!window.confirm(`Remove “${definition?.name ?? "this maintenance item"}” from ${tailNumber}? The reusable maintenance item will remain available.`)) return;
    setSaving(true);
    setFeedback(null);
    try {
      await deleteAircraftInspectionAssignment(assignment.id);
      setAssignments((current) => current.filter((item) => item.id !== assignment.id));
      setFeedback({ tone: "success", message: `Maintenance due limit removed from ${tailNumber}.` });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getErrorMessage(error, "We could not remove this maintenance due limit. Try again."),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={embedded ? "" : "saas-panel"}>
      {!embedded ? <h2 className="saas-subsection-title">Additional maintenance requirements</h2> : null}
      {!embedded ? <p className="saas-meta-text mt-2">Track Airworthiness Directives (ADs), recurring inspections, and other limits that are not covered by the standard aircraft fields.</p> : null}
      {feedback ? (
        <div
          className={`mt-3 rounded-xl border px-4 py-3 text-sm ${
            feedback.tone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
          role={feedback.tone === "error" ? "alert" : "status"}
          aria-live={feedback.tone === "error" ? "assertive" : "polite"}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3">
        <AdminCollapsibleSection
          id="new-inspection-definition"
          title="1. Create a maintenance item"
          description="Enter what must be completed and how its due limit is measured."
          summary={`${definitions.length} saved`}
          open={openPanels.has("definitions")}
          onToggle={() => togglePanel("definitions")}
        >
        <form className="grid gap-3" onSubmit={handleSaveDefinition}>
          <h3 className="text-sm font-semibold text-slate-900">New maintenance item</h3>
          <Field label="What is required?">
            <input value={definitionForm.name} onChange={(event) => setDefinitionForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Main rotor grip inspection" required />
          </Field>
          <Field label="How is it tracked?">
            <select value={definitionForm.basis} onChange={(event) => setDefinitionForm((current) => ({ ...current, basis: event.target.value as InspectionBasis }))}>
              <option value="calendar">By calendar date</option>
              <option value="hobbs">By Hobbs reading</option>
              <option value="tach">By tachometer reading</option>
              <option value="whichever_first">By date and meter — whichever comes first</option>
            </select>
          </Field>
          <Field label="Which aircraft models does this apply to?">
            <select value={definitionForm.model_id} onChange={(event) => setDefinitionForm((current) => ({ ...current, model_id: event.target.value }))}>
              <option value="">Every aircraft model</option>
              {models.filter((model) => !model.organization_id || model.organization_id === organizationId).map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
            </select>
          </Field>
          <div className={`grid gap-3 ${definitionForm.basis === "whichever_first" ? "sm:grid-cols-2" : ""}`}>
            {usesCalendar(definitionForm.basis) ? (
              <Field label="Warn this many days before it is due">
                <input type="number" min="0" value={definitionForm.warning_days} onChange={(event) => setDefinitionForm((current) => ({ ...current, warning_days: event.target.value }))} />
              </Field>
            ) : null}
            {usesMeter(definitionForm.basis) ? (
              <Field label="Warn this many hours before it is due">
                <input type="number" min="0" step="any" value={definitionForm.warning_hours} onChange={(event) => setDefinitionForm((current) => ({ ...current, warning_hours: event.target.value }))} />
              </Field>
            ) : null}
          </div>
          <Field label="Instructions or reference (optional)">
            <textarea rows={2} value={definitionForm.notes} onChange={(event) => setDefinitionForm((current) => ({ ...current, notes: event.target.value }))} placeholder="e.g. AD number, service bulletin, or inspection instructions" />
          </Field>
          <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving..." : "Save maintenance item"}</button>
        </form>
        </AdminCollapsibleSection>

        <AdminCollapsibleSection
          id="assign-custom-inspection"
          title="2. Add it to an aircraft"
          description="Choose the aircraft and enter its next due limit."
          summary={`${assignments.length} aircraft limits`}
          open={openPanels.has("assignments")}
          onToggle={() => togglePanel("assignments")}
        >
        <form className="grid gap-3" onSubmit={handleSaveAssignment}>
          <h3 className="text-sm font-semibold text-slate-900">Set the next due limit</h3>
          <Field label="Maintenance item">
            <select
              value={assignmentForm.definition_id}
              onChange={(event) => setAssignmentForm((current) => ({
                ...current,
                definition_id: event.target.value,
                aircraft_id: "",
                due_date: "",
                due_meter: "",
              }))}
              required
            >
              <option value="">Choose a maintenance item</option>
              {activeDefinitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.name}</option>)}
            </select>
          </Field>
          {activeDefinitions.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">Create a maintenance item in step 1 before adding it to an aircraft.</p>
          ) : null}
          <Field label={selectedDefinition?.model_id ? `Aircraft (${modelById.get(selectedDefinition.model_id)?.name ?? "matching model"} only)` : "Aircraft"}>
            <select disabled={!selectedDefinition} value={assignmentForm.aircraft_id} onChange={(event) => setAssignmentForm((current) => ({ ...current, aircraft_id: event.target.value }))} required>
              <option value="">{selectedDefinition ? "Choose an aircraft" : "Choose a maintenance item first"}</option>
              {applicableAircraft.map((item) => <option key={item.id} value={item.id}>{item.tail_number}</option>)}
            </select>
          </Field>
          {selectedDefinition && applicableAircraft.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">No aircraft in this fleet match the model selected for this maintenance item.</p>
          ) : null}
          <div className={`grid gap-3 ${selectedDefinition?.basis === "whichever_first" ? "sm:grid-cols-2" : ""}`}>
            {selectedDefinition && usesCalendar(selectedDefinition.basis) ? (
              <Field label="Next due date">
                <input type="date" value={assignmentForm.due_date} onChange={(event) => setAssignmentForm((current) => ({ ...current, due_date: event.target.value }))} required />
              </Field>
            ) : null}
            {selectedDefinition && usesMeter(selectedDefinition.basis) ? (
              <Field label={`Due at ${meterName(selectedDefinition.basis)} reading`}>
                <input type="number" min="0" step="any" value={assignmentForm.due_meter} onChange={(event) => setAssignmentForm((current) => ({ ...current, due_meter: event.target.value }))} placeholder="e.g. 2150.0" required />
              </Field>
            ) : null}
          </div>
          <Field label="Note for this aircraft (optional)">
            <textarea rows={2} value={assignmentForm.notes} onChange={(event) => setAssignmentForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Add aircraft-specific context" />
          </Field>
          <button className="primary-button" type="submit" disabled={saving || activeDefinitions.length === 0 || applicableAircraft.length === 0}>
            {saving ? "Saving..." : "Add due limit to aircraft"}
          </button>
        </form>
        </AdminCollapsibleSection>

        <AdminCollapsibleSection
          id="saved-custom-inspections"
          title="3. Review saved requirements"
          description="See what applies to each aircraft and remove limits that are no longer used."
          summary={`${definitions.length} items · ${assignments.length} aircraft limits`}
          open={openPanels.has("saved")}
          onToggle={() => togglePanel("saved")}
        >
      <div className="grid gap-3">
        {definitions.length === 0 ? <p className="saas-empty-state">No additional maintenance requirements have been created.</p> : null}
        {definitions.map((definition) => (
          <div key={definition.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{definition.name}</p>
                <p className="saas-meta-text">{formatBasis(definition.basis)} · {definition.model_id ? modelById.get(definition.model_id)?.name ?? "Selected model" : "Every aircraft model"}</p>
                <p className="saas-meta-text mt-1">{formatWarning(definition)}</p>
                {definition.notes ? <p className="mt-2 text-sm text-slate-700">{definition.notes}</p> : null}
              </div>
              <button className="danger-button-compact" type="button" disabled={saving} onClick={() => void removeDefinition(definition)}>Delete item</button>
            </div>
            <div className="mt-3 grid gap-2">
              {assignments.filter((assignment) => assignment.definition_id === definition.id).length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">Not added to any aircraft yet.</p>
              ) : null}
              {assignments.filter((assignment) => assignment.definition_id === definition.id).map((assignment) => (
                <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <span>
                    <strong>{aircraftById.get(assignment.aircraft_id)?.tail_number ?? "Aircraft"}</strong>
                    {" · "}
                    {formatDue(assignment, definition.basis)}
                  </span>
                  <button className="ghost-button" type="button" disabled={saving} onClick={() => void removeAssignment(assignment)}>Remove from aircraft</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
        </AdminCollapsibleSection>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="saas-field"><span>{label}</span>{children}</label>;
}

function optionalNonNegativeNumber(value: string, label: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be zero or greater.`);
  return parsed;
}

function formatBasis(value: InspectionBasis) {
  if (value === "calendar") return "Tracked by calendar date";
  if (value === "hobbs") return "Tracked by Hobbs reading";
  if (value === "tach") return "Tracked by tachometer reading";
  return "Date and meter — whichever comes first";
}

function usesCalendar(value: InspectionBasis) {
  return value === "calendar" || value === "whichever_first";
}

function usesMeter(value: InspectionBasis) {
  return value === "hobbs" || value === "tach" || value === "whichever_first";
}

function meterName(value: InspectionBasis) {
  return value === "tach" ? "tachometer" : "Hobbs";
}

function requiredValue(value: string, message: string) {
  if (!value.trim()) throw new Error(message);
  return value.trim();
}

function requiredNonNegativeNumber(value: string, message: string) {
  if (!value.trim()) throw new Error(message);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(message);
  return parsed;
}

function formatWarning(definition: OrganizationInspectionDefinition) {
  const values = [
    usesCalendar(definition.basis) && definition.warning_days != null
      ? `${definition.warning_days} days advance warning`
      : "",
    usesMeter(definition.basis) && definition.warning_hours != null
      ? `${definition.warning_hours} hours advance warning`
      : "",
  ].filter(Boolean);
  return values.join(" · ") || "No advance warning";
}

function formatDue(assignment: AircraftInspectionAssignment, basis: InspectionBasis) {
  const values = [
    assignment.due_date ? `due ${formatDate(assignment.due_date)}` : "",
    assignment.due_meter == null ? "" : `due at ${meterName(basis)} ${assignment.due_meter}`,
  ].filter(Boolean);
  return values.join(" / ") || "No due limit";
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return fallback;
}
