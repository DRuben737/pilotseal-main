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
  const [status, setStatus] = useState("");
  const [openPanels, setOpenPanels] = useState<Set<string>>(() => new Set());

  const aircraftById = useMemo(
    () => new Map(aircraft.map((item) => [item.id, item])),
    [aircraft]
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
        if (!cancelled) setStatus(getErrorMessage(error, "Unable to load custom inspections."));
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
    setStatus("");
    try {
      await saveOrganizationInspectionDefinition({
        organization_id: organizationId,
        name: definitionForm.name,
        basis: definitionForm.basis,
        model_id: definitionForm.model_id || null,
        warning_days: optionalNumber(definitionForm.warning_days),
        warning_hours: optionalNumber(definitionForm.warning_hours),
        notes: definitionForm.notes,
      });
      setDefinitionForm(emptyDefinition);
      await reload();
      setStatus("Inspection definition saved.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to save inspection definition."));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAssignment(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    try {
      await saveAircraftInspectionAssignment({
        definition_id: assignmentForm.definition_id,
        aircraft_id: assignmentForm.aircraft_id,
        due_date: assignmentForm.due_date || null,
        due_meter: optionalNumber(assignmentForm.due_meter),
        notes: assignmentForm.notes,
      });
      setAssignmentForm(emptyAssignment);
      await reload();
      setStatus("Inspection assigned to aircraft.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to assign inspection."));
    } finally {
      setSaving(false);
    }
  }

  async function removeDefinition(id: string) {
    if (!window.confirm("Delete this inspection definition and all aircraft assignments?")) return;
    setSaving(true);
    try {
      await deleteOrganizationInspectionDefinition(id);
      await reload();
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to delete inspection definition."));
    } finally {
      setSaving(false);
    }
  }

  async function removeAssignment(id: string) {
    setSaving(true);
    try {
      await deleteAircraftInspectionAssignment(id);
      setAssignments((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to remove inspection assignment."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={embedded ? "" : "saas-panel"}>
      {!embedded ? <h2 className="saas-subsection-title">Custom inspections</h2> : null}
      {!embedded ? <p className="saas-meta-text mt-2">Define organization-specific AD and interval inspections, then assign their due limits to aircraft.</p> : null}
      {status ? <p className="mt-3 text-sm text-slate-600">{status}</p> : null}

      <div className="mt-5 grid gap-3">
        <AdminCollapsibleSection
          id="new-inspection-definition"
          title="Inspection definitions"
          description="Create the reusable calendar or meter rule first."
          summary={`${definitions.length} definitions`}
          open={openPanels.has("definitions")}
          onToggle={() => togglePanel("definitions")}
        >
        <form className="grid gap-3" onSubmit={handleSaveDefinition}>
          <h3 className="text-sm font-semibold text-slate-900">New inspection definition</h3>
          <Field label="Name"><input value={definitionForm.name} onChange={(event) => setDefinitionForm((current) => ({ ...current, name: event.target.value }))} required /></Field>
          <Field label="Basis">
            <select value={definitionForm.basis} onChange={(event) => setDefinitionForm((current) => ({ ...current, basis: event.target.value as InspectionBasis }))}>
              <option value="calendar">Calendar</option>
              <option value="hobbs">Hobbs</option>
              <option value="tach">Tach</option>
              <option value="whichever_first">Date or meter, whichever comes first</option>
            </select>
          </Field>
          <Field label="Aircraft model (optional)">
            <select value={definitionForm.model_id} onChange={(event) => setDefinitionForm((current) => ({ ...current, model_id: event.target.value }))}>
              <option value="">All models</option>
              {models.filter((model) => !model.organization_id || model.organization_id === organizationId).map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Warning days"><input type="number" min="0" value={definitionForm.warning_days} onChange={(event) => setDefinitionForm((current) => ({ ...current, warning_days: event.target.value }))} /></Field>
            <Field label="Warning hours"><input type="number" min="0" step="any" value={definitionForm.warning_hours} onChange={(event) => setDefinitionForm((current) => ({ ...current, warning_hours: event.target.value }))} /></Field>
          </div>
          <Field label="Notes"><textarea rows={2} value={definitionForm.notes} onChange={(event) => setDefinitionForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
          <button className="primary-button" type="submit" disabled={saving}>Save definition</button>
        </form>
        </AdminCollapsibleSection>

        <AdminCollapsibleSection
          id="assign-custom-inspection"
          title="Assign to aircraft"
          description="Apply an existing definition and set this aircraft's due limit."
          summary={`${assignments.length} assignments`}
          open={openPanels.has("assignments")}
          onToggle={() => togglePanel("assignments")}
        >
        <form className="grid gap-3" onSubmit={handleSaveAssignment}>
          <h3 className="text-sm font-semibold text-slate-900">Assign inspection</h3>
          <Field label="Inspection">
            <select value={assignmentForm.definition_id} onChange={(event) => setAssignmentForm((current) => ({ ...current, definition_id: event.target.value }))} required>
              <option value="">Select inspection</option>
              {definitions.filter((definition) => definition.is_active).map((definition) => <option key={definition.id} value={definition.id}>{definition.name}</option>)}
            </select>
          </Field>
          <Field label="Aircraft">
            <select value={assignmentForm.aircraft_id} onChange={(event) => setAssignmentForm((current) => ({ ...current, aircraft_id: event.target.value }))} required>
              <option value="">Select aircraft</option>
              {aircraft.map((item) => <option key={item.id} value={item.id}>{item.tail_number}</option>)}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Due date"><input type="date" value={assignmentForm.due_date} onChange={(event) => setAssignmentForm((current) => ({ ...current, due_date: event.target.value }))} /></Field>
            <Field label="Due meter"><input type="number" min="0" step="any" value={assignmentForm.due_meter} onChange={(event) => setAssignmentForm((current) => ({ ...current, due_meter: event.target.value }))} /></Field>
          </div>
          <Field label="Aircraft notes"><textarea rows={2} value={assignmentForm.notes} onChange={(event) => setAssignmentForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
          <button className="primary-button" type="submit" disabled={saving || definitions.length === 0 || aircraft.length === 0}>Assign inspection</button>
        </form>
        </AdminCollapsibleSection>

        <AdminCollapsibleSection
          id="saved-custom-inspections"
          title="Saved inspections"
          description="Review definitions, due limits, and aircraft assignments."
          summary={`${definitions.length} definitions · ${assignments.length} assignments`}
          open={openPanels.has("saved")}
          onToggle={() => togglePanel("saved")}
        >
      <div className="grid gap-3">
        {definitions.length === 0 ? <p className="saas-empty-state">No custom inspections have been defined.</p> : null}
        {definitions.map((definition) => (
          <div key={definition.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{definition.name}</p>
                <p className="saas-meta-text">{formatBasis(definition.basis)}{definition.model_id ? " · Model-specific" : " · All models"}</p>
              </div>
              <button className="danger-button-compact" type="button" disabled={saving} onClick={() => void removeDefinition(definition.id)}>Delete</button>
            </div>
            <div className="mt-3 grid gap-2">
              {assignments.filter((assignment) => assignment.definition_id === definition.id).map((assignment) => (
                <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <span>{aircraftById.get(assignment.aircraft_id)?.tail_number ?? "Aircraft"} · {formatDue(assignment)}</span>
                  <button className="ghost-button" type="button" disabled={saving} onClick={() => void removeAssignment(assignment.id)}>Remove</button>
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

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Enter a valid number.");
  return parsed;
}

function formatBasis(value: InspectionBasis) {
  if (value === "whichever_first") return "Date or meter, whichever comes first";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDue(assignment: AircraftInspectionAssignment) {
  const values = [
    assignment.due_date ? `due ${assignment.due_date}` : "",
    assignment.due_meter == null ? "" : `due at ${assignment.due_meter}`,
  ].filter(Boolean);
  return values.join(" / ") || "No due limit";
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return fallback;
}
