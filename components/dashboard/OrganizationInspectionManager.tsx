"use client";

import { useEffect, useMemo, useState } from "react";

import {
  AdminDataTable,
  CompactButton,
  DetailDrawer,
  WorksheetCell,
  WorksheetGrid,
  WorksheetHeader,
  worksheetInputClass,
} from "@/components/admin/AdminConsole";
import { UsDateInput } from "@/components/forms/UsDateInput";
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
import { formatUsDate } from "@/lib/date-format";

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
  const [activeDrawer, setActiveDrawer] = useState<"definition" | "assignment" | null>(null);

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
      setActiveDrawer(null);
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
      setActiveDrawer(null);
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

      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <button
          className="cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
          type="button"
          onClick={() => setActiveDrawer("definition")}
        >
          Add maintenance item
        </button>
        <button
          className="cursor-pointer rounded-md border border-blue-600 bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          disabled={activeDefinitions.length === 0}
          onClick={() => setActiveDrawer("assignment")}
        >
          Assign to aircraft
        </button>
      </div>

      <div className="mt-2 grid gap-3">
        <AdminDataTable label="Maintenance items">
          <thead className="bg-slate-100 text-xs font-semibold text-slate-700">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2">Maintenance item</th>
              <th className="border-b border-slate-200 px-3 py-2">Tracked by</th>
              <th className="border-b border-slate-200 px-3 py-2">Aircraft models</th>
              <th className="border-b border-slate-200 px-3 py-2">Warning</th>
              <th className="border-b border-slate-200 px-3 py-2">Aircraft</th>
              <th className="border-b border-slate-200 px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {definitions.length === 0 ? (
              <tr><td className="px-3 py-4 text-sm text-slate-500" colSpan={6}>No additional maintenance items.</td></tr>
            ) : definitions.map((definition) => (
              <tr key={definition.id} className="hover:bg-blue-50/40">
                <td className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-900">{definition.name}</td>
                <td className="border-b border-slate-100 px-3 py-2 text-xs text-slate-700">{formatBasisCompact(definition.basis)}</td>
                <td className="border-b border-slate-100 px-3 py-2 text-xs text-slate-700">{definition.model_id ? modelById.get(definition.model_id)?.name ?? "Selected model" : "All models"}</td>
                <td className="border-b border-slate-100 px-3 py-2 text-xs text-slate-700">{formatWarning(definition)}</td>
                <td className="border-b border-slate-100 px-3 py-2 text-xs tabular-nums text-slate-700">{assignments.filter((item) => item.definition_id === definition.id).length}</td>
                <td className="border-b border-slate-100 px-3 py-1.5 text-right">
                  <button className="cursor-pointer rounded px-2 py-1 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50" type="button" disabled={saving} onClick={() => void removeDefinition(definition)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </AdminDataTable>

        <AdminDataTable label="Aircraft maintenance due limits">
          <thead className="bg-slate-100 text-xs font-semibold text-slate-700">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2">Aircraft</th>
              <th className="border-b border-slate-200 px-3 py-2">Maintenance item</th>
              <th className="border-b border-slate-200 px-3 py-2">Due</th>
              <th className="border-b border-slate-200 px-3 py-2">Note</th>
              <th className="border-b border-slate-200 px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {assignments.length === 0 ? (
              <tr><td className="px-3 py-4 text-sm text-slate-500" colSpan={5}>No aircraft due limits.</td></tr>
            ) : assignments.map((assignment) => {
              const definition = definitions.find((item) => item.id === assignment.definition_id);
              return (
                <tr key={assignment.id} className="hover:bg-blue-50/40">
                  <td className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-900">{aircraftById.get(assignment.aircraft_id)?.tail_number ?? "Aircraft"}</td>
                  <td className="border-b border-slate-100 px-3 py-2 text-xs text-slate-700">{definition?.name ?? "Maintenance item"}</td>
                  <td className="border-b border-slate-100 px-3 py-2 text-xs text-slate-700">{formatDue(assignment, definition?.basis ?? "calendar")}</td>
                  <td className="max-w-64 truncate border-b border-slate-100 px-3 py-2 text-xs text-slate-600" title={assignment.notes ?? ""}>{assignment.notes || "—"}</td>
                  <td className="border-b border-slate-100 px-3 py-1.5 text-right">
                    <button className="cursor-pointer rounded px-2 py-1 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50" type="button" disabled={saving} onClick={() => void removeAssignment(assignment)}>Remove</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </AdminDataTable>
      </div>

      <DetailDrawer
        open={activeDrawer === "definition"}
        title="Add maintenance item"
        description="Create a reusable maintenance requirement."
        onClose={() => setActiveDrawer(null)}
      >
        <form onSubmit={handleSaveDefinition}>
          <WorksheetGrid label="Maintenance item definition" minWidth={860}>
            <thead>
              <tr>
                <WorksheetHeader className="min-w-52">Maintenance item</WorksheetHeader>
                <WorksheetHeader>Tracked by</WorksheetHeader>
                <WorksheetHeader>Aircraft models</WorksheetHeader>
                <WorksheetHeader>Warning days</WorksheetHeader>
                <WorksheetHeader>Warning hours</WorksheetHeader>
                <WorksheetHeader>Instructions / reference</WorksheetHeader>
              </tr>
            </thead>
            <tbody>
              <tr>
                <WorksheetCell><input autoFocus required aria-label="Maintenance item name" className={worksheetInputClass} value={definitionForm.name} onChange={(event) => setDefinitionForm((current) => ({ ...current, name: event.target.value }))} placeholder="Main rotor grip inspection" /></WorksheetCell>
                <WorksheetCell>
                  <select aria-label="Tracking method" className={worksheetInputClass} value={definitionForm.basis} onChange={(event) => setDefinitionForm((current) => ({ ...current, basis: event.target.value as InspectionBasis }))}>
                    <option value="calendar">Calendar date</option>
                    <option value="hobbs">Hobbs</option>
                    <option value="tach">Tach</option>
                    <option value="whichever_first">Date or meter, first due</option>
                  </select>
                </WorksheetCell>
                <WorksheetCell>
                  <select aria-label="Applicable aircraft models" className={worksheetInputClass} value={definitionForm.model_id} onChange={(event) => setDefinitionForm((current) => ({ ...current, model_id: event.target.value }))}>
                    <option value="">Every model</option>
                    {models.filter((model) => !model.organization_id || model.organization_id === organizationId).map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                  </select>
                </WorksheetCell>
                <WorksheetCell>{usesCalendar(definitionForm.basis) ? <input aria-label="Warning days" className={worksheetInputClass} type="number" min="0" value={definitionForm.warning_days} onChange={(event) => setDefinitionForm((current) => ({ ...current, warning_days: event.target.value }))} /> : <span className="block h-8 px-2 py-2 text-slate-400">—</span>}</WorksheetCell>
                <WorksheetCell>{usesMeter(definitionForm.basis) ? <input aria-label="Warning hours" className={worksheetInputClass} type="number" min="0" step="any" value={definitionForm.warning_hours} onChange={(event) => setDefinitionForm((current) => ({ ...current, warning_hours: event.target.value }))} /> : <span className="block h-8 px-2 py-2 text-slate-400">—</span>}</WorksheetCell>
                <WorksheetCell><input aria-label="Instructions or reference" className={worksheetInputClass} value={definitionForm.notes} onChange={(event) => setDefinitionForm((current) => ({ ...current, notes: event.target.value }))} /></WorksheetCell>
              </tr>
            </tbody>
          </WorksheetGrid>
          <div className="flex justify-end gap-2 border-t border-slate-300 bg-slate-50 px-3 py-2">
            <CompactButton type="button" onClick={() => setActiveDrawer(null)}>Cancel</CompactButton>
            <CompactButton type="submit" tone="primary" disabled={saving}>{saving ? "Saving..." : "Save item"}</CompactButton>
          </div>
        </form>
      </DetailDrawer>

      <DetailDrawer
        open={activeDrawer === "assignment"}
        title="Assign maintenance to aircraft"
        description="Set the next due date or meter reading."
        onClose={() => setActiveDrawer(null)}
      >
        <form onSubmit={handleSaveAssignment}>
          <WorksheetGrid label="Aircraft maintenance assignment" minWidth={820}>
            <thead>
              <tr>
                <WorksheetHeader className="min-w-52">Maintenance item</WorksheetHeader>
                <WorksheetHeader>Aircraft</WorksheetHeader>
                <WorksheetHeader>Due date (MM/DD/YYYY)</WorksheetHeader>
                <WorksheetHeader>Due meter</WorksheetHeader>
                <WorksheetHeader>Aircraft note</WorksheetHeader>
              </tr>
            </thead>
            <tbody>
              <tr>
                <WorksheetCell>
                  <select autoFocus required aria-label="Maintenance item" className={worksheetInputClass} value={assignmentForm.definition_id} onChange={(event) => setAssignmentForm((current) => ({ ...current, definition_id: event.target.value, aircraft_id: "", due_date: "", due_meter: "" }))}>
                    <option value="">Choose item</option>
                    {activeDefinitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.name}</option>)}
                  </select>
                </WorksheetCell>
                <WorksheetCell>
                  <select required aria-label="Aircraft" className={worksheetInputClass} disabled={!selectedDefinition} value={assignmentForm.aircraft_id} onChange={(event) => setAssignmentForm((current) => ({ ...current, aircraft_id: event.target.value }))}>
                    <option value="">{selectedDefinition ? "Choose aircraft" : "Choose item first"}</option>
                    {applicableAircraft.map((item) => <option key={item.id} value={item.id}>{item.tail_number}</option>)}
                  </select>
                </WorksheetCell>
                <WorksheetCell>
                  {selectedDefinition && usesCalendar(selectedDefinition.basis)
                    ? <UsDateInput required aria-label="Next due date" className={worksheetInputClass} value={assignmentForm.due_date} onChange={(value) => setAssignmentForm((current) => ({ ...current, due_date: value }))} />
                    : <span className="block h-8 px-2 py-2 text-slate-400">—</span>}
                </WorksheetCell>
                <WorksheetCell>
                  {selectedDefinition && usesMeter(selectedDefinition.basis)
                    ? <input required aria-label="Due meter reading" className={worksheetInputClass} type="number" min="0" step="any" value={assignmentForm.due_meter} onChange={(event) => setAssignmentForm((current) => ({ ...current, due_meter: event.target.value }))} />
                    : <span className="block h-8 px-2 py-2 text-slate-400">—</span>}
                </WorksheetCell>
                <WorksheetCell><input aria-label="Aircraft note" className={worksheetInputClass} value={assignmentForm.notes} onChange={(event) => setAssignmentForm((current) => ({ ...current, notes: event.target.value }))} /></WorksheetCell>
              </tr>
            </tbody>
          </WorksheetGrid>
          <div className="flex justify-end gap-2 border-t border-slate-300 bg-slate-50 px-3 py-2">
            <CompactButton type="button" onClick={() => setActiveDrawer(null)}>Cancel</CompactButton>
            <CompactButton type="submit" tone="primary" disabled={saving || activeDefinitions.length === 0 || applicableAircraft.length === 0}>{saving ? "Saving..." : "Assign"}</CompactButton>
          </div>
        </form>
      </DetailDrawer>
    </section>
  );
}

function optionalNonNegativeNumber(value: string, label: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be zero or greater.`);
  return parsed;
}

function formatBasisCompact(value: InspectionBasis) {
  if (value === "calendar") return "Calendar";
  if (value === "hobbs") return "Hobbs";
  if (value === "tach") return "Tach";
  return "Date or meter";
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
    assignment.due_date ? `due ${formatUsDate(assignment.due_date)}` : "",
    assignment.due_meter == null ? "" : `due at ${meterName(basis)} ${assignment.due_meter}`,
  ].filter(Boolean);
  return values.join(" / ") || "No due limit";
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return fallback;
}
