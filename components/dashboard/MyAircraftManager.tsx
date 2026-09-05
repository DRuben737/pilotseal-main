"use client";

import { useEffect, useMemo, useState } from "react";

import {
  CompactButton,
  DetailDrawer,
  ManagementDisclosure,
  WorksheetCell,
  WorksheetGrid,
  WorksheetHeader,
  worksheetInputClass,
} from "@/components/admin/AdminConsole";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { UsDateInput } from "@/components/forms/UsDateInput";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import {
  attachAircraftByTail,
  fetchAircraftOrganizationAssignments,
  fetchAircraftModels,
  fetchMyAircraft,
  fetchOrganizationAircraft,
  fetchPersonalAircraftInspections,
  fetchSharedAircraft,
  removeMyAircraft,
  saveCurrentAircraftForUser,
  savePersonalAircraftInspections,
  setPlatformAircraftOrganizations,
  submitAircraftUpdateRequest,
  updateMyAircraft,
  updateSavedAircraftDue,
  type AircraftModelRecord,
  type AircraftOrganizationAssignment,
  type AircraftRecord,
  type AttachAircraftConflict,
  type PersonalAircraftInspectionBasis,
  type PersonalAircraftInspectionDatePrecision,
  type PersonalAircraftInspectionInput,
  type PersonalAircraftInspectionRecord,
  type SavedAircraftDueInput,
} from "@/lib/aircraft";
import { formatUsDate, formatUsMonthYear, monthToLastIsoDate } from "@/lib/date-format";
import {
  fetchPlatformOrganizations,
  type PlatformOrganization,
} from "@/lib/platform-admin";
import { fetchCurrentProfile } from "@/lib/profile";

type AircraftFormState = {
  model_id: string;
  tail_number: string;
  empty_weight: string;
  empty_arm: string;
  empty_lat_arm: string;
  hundred_hour_due_hours: string;
  annual_due_date: string;
  static_due_date: string;
  transponder_due_date: string;
  elt_due_date: string;
};

type PersonalInspectionDraft = {
  clientKey: string;
  id: string;
  name: string;
  basis: PersonalAircraftInspectionBasis;
  date_precision: PersonalAircraftInspectionDatePrecision;
  due_date: string;
  due_meter: string;
  notes: string;
};

const emptyForm: AircraftFormState = {
  model_id: "",
  tail_number: "",
  empty_weight: "",
  empty_arm: "",
  empty_lat_arm: "",
  hundred_hour_due_hours: "",
  annual_due_date: "",
  static_due_date: "",
  transponder_due_date: "",
  elt_due_date: "",
};

function toNullableNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRequiredNumber(value: string, label: string) {
  const parsed = toNullableNumber(value);
  if (parsed === null) {
    throw new Error(`${label} is required.`);
  }

  return parsed;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint]
      .filter((value) => typeof value === "string" && value.trim())
      .map((value) => String(value).trim());

    if (parts.length > 0) {
      return parts.join(" ");
    }
  }

  return fallback;
}

function formatDateInput(value: string | null | undefined) {
  return value ? value.slice(0, 7) : "";
}

function getDueSummary(aircraft: AircraftRecord) {
  const items = [
    aircraft.hundred_hour_due_hours != null ? `100hr ${aircraft.hundred_hour_due_hours}` : "",
    aircraft.annual_due_date ? `Annual ${formatUsMonthYear(aircraft.annual_due_date)}` : "",
    aircraft.static_due_date ? `91.411 ${formatUsMonthYear(aircraft.static_due_date)}` : "",
    aircraft.transponder_due_date ? `91.413 ${formatUsMonthYear(aircraft.transponder_due_date)}` : "",
    aircraft.elt_due_date ? `ELT ${formatUsMonthYear(aircraft.elt_due_date)}` : "",
  ].filter(Boolean);

  return items.join(" · ");
}

export default function MyAircraftManager() {
  const { session } = useAuthSession();
  const { activeOrganization } = useOrganization();
  const [profileRole, setProfileRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [models, setModels] = useState<AircraftModelRecord[]>([]);
  const [myAircraft, setMyAircraft] = useState<AircraftRecord[]>([]);
  const [sharedAircraft, setSharedAircraft] = useState<AircraftRecord[]>([]);
  const [organizationAircraft, setOrganizationAircraft] = useState<AircraftRecord[]>([]);
  const [platformOrganizations, setPlatformOrganizations] = useState<PlatformOrganization[]>([]);
  const [organizationAssignments, setOrganizationAssignments] = useState<AircraftOrganizationAssignment[]>([]);
  const [personalInspections, setPersonalInspections] = useState<PersonalAircraftInspectionRecord[]>([]);
  const [inspectionDrafts, setInspectionDrafts] = useState<PersonalInspectionDraft[]>([]);
  const [assigningAircraftId, setAssigningAircraftId] = useState("");
  const [selectedOrganizationIds, setSelectedOrganizationIds] = useState<string[]>([]);
  const [form, setForm] = useState<AircraftFormState>(emptyForm);
  const [editingAircraftId, setEditingAircraftId] = useState("");
  const [conflict, setConflict] = useState<AttachAircraftConflict | null>(null);
  const [showForm, setShowForm] = useState(false);
  const isPlatformAdmin = profileRole === "admin";

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!session?.user?.id) {
        if (!cancelled) {
          setProfileRole("");
          setPlatformOrganizations([]);
          setOrganizationAssignments([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setStatus("");

      try {
        const [profile, modelList, sharedList, attachedList, organizationList, personalInspectionList] = await Promise.all([
          fetchCurrentProfile(session.user.id),
          fetchAircraftModels(),
          fetchSharedAircraft(),
          fetchMyAircraft(session.user.id),
          activeOrganization?.id
            ? fetchOrganizationAircraft(activeOrganization.id)
            : Promise.resolve([]),
          fetchPersonalAircraftInspections(session.user.id),
        ]);
        const nextProfileRole = String(profile?.role ?? "user").trim().toLowerCase();
        const adminOwnedAircraftIds = attachedList
          .filter((aircraft) =>
            aircraft.visibility === "private" && aircraft.owner_user_id === session.user.id
          )
          .map((aircraft) => aircraft.id);
        const [availableOrganizations, currentAssignments] = nextProfileRole === "admin"
          ? await Promise.all([
              fetchPlatformOrganizations(),
              fetchAircraftOrganizationAssignments(adminOwnedAircraftIds),
            ])
          : [[], []] as [PlatformOrganization[], AircraftOrganizationAssignment[]];

        if (!cancelled) {
          setProfileRole(nextProfileRole);
          setModels(modelList);
          setSharedAircraft(sharedList);
          setMyAircraft(attachedList);
          setOrganizationAircraft(organizationList);
          setPlatformOrganizations(availableOrganizations);
          setOrganizationAssignments(currentAssignments);
          setPersonalInspections(personalInspectionList);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(getErrorMessage(error, "Unable to load your aircraft right now."));
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
  }, [activeOrganization?.id, session?.user?.id]);

  const modelNameById = useMemo(
    () => new Map(models.map((model) => [model.id, model.name])),
    [models]
  );
  const organizationNameById = useMemo(
    () => new Map(platformOrganizations.map((organization) => [organization.id, organization.name])),
    [platformOrganizations]
  );

  function getAircraftOrganizationIds(aircraftId: string) {
    return organizationAssignments
      .filter((assignment) => assignment.aircraft_id === aircraftId)
      .map((assignment) => assignment.organization_id);
  }

  function getPersonalInspectionSummary(aircraftId: string) {
    return personalInspections
      .filter((item) => item.aircraft_id === aircraftId)
      .map((item) => {
        const dueDate = item.date_precision === "month"
          ? formatUsMonthYear(item.due_date)
          : formatUsDate(item.due_date);
        if (item.basis === "calendar") return `${item.name} ${dueDate}`;
        if (item.basis === "whichever_first") {
          return `${item.name} ${dueDate} / ${item.due_meter ?? "—"}`;
        }
        return `${item.name} ${item.due_meter ?? "—"} ${item.basis === "tach" ? "Tach" : "Hobbs"}`;
      })
      .join(" · ");
  }

  function canAssignAircraft(aircraft: AircraftRecord) {
    return Boolean(
      isPlatformAdmin &&
      session?.user?.id &&
      aircraft.visibility === "private" &&
      aircraft.owner_user_id === session.user.id
    );
  }

  function openOrganizationAssignments(aircraft: AircraftRecord) {
    if (!canAssignAircraft(aircraft)) return;
    setSelectedOrganizationIds(getAircraftOrganizationIds(aircraft.id));
    setAssigningAircraftId(aircraft.id);
    setShowForm(false);
    setStatus("");
  }

  function closeOrganizationAssignments() {
    setAssigningAircraftId("");
    setSelectedOrganizationIds([]);
  }

  function toggleOrganizationAssignment(organizationId: string) {
    setSelectedOrganizationIds((current) =>
      current.includes(organizationId)
        ? current.filter((id) => id !== organizationId)
        : [...current, organizationId]
    );
  }

  async function handleSaveOrganizationAssignments() {
    if (!assigningAircraftId || !isPlatformAdmin) return;
    setSaving(true);
    setStatus("");
    try {
      await setPlatformAircraftOrganizations(assigningAircraftId, selectedOrganizationIds);
      const nextAssignments = await fetchAircraftOrganizationAssignments(
        myAircraft
          .filter((aircraft) => canAssignAircraft(aircraft))
          .map((aircraft) => aircraft.id)
      );
      setOrganizationAssignments(nextAssignments);
      closeOrganizationAssignments();
      setStatus(
        selectedOrganizationIds.length === 0
          ? "Organization access removed."
          : `Aircraft authorized for ${selectedOrganizationIds.length} organization${selectedOrganizationIds.length === 1 ? "" : "s"}.`
      );
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to update organization access."));
    } finally {
      setSaving(false);
    }
  }

  async function reloadAircraftLists() {
    if (!session?.user?.id) {
      return;
    }

    const [sharedList, attachedList, organizationList, personalInspectionList] = await Promise.all([
      fetchSharedAircraft(),
      fetchMyAircraft(session.user.id),
      activeOrganization?.id
        ? fetchOrganizationAircraft(activeOrganization.id)
        : Promise.resolve([]),
      fetchPersonalAircraftInspections(session.user.id),
    ]);

    setSharedAircraft(sharedList);
    setMyAircraft(attachedList);
    setOrganizationAircraft(organizationList);
    setPersonalInspections(personalInspectionList);
    if (profileRole === "admin") {
      const adminOwnedAircraftIds = attachedList
        .filter((aircraft) =>
          aircraft.visibility === "private" && aircraft.owner_user_id === session.user.id
        )
        .map((aircraft) => aircraft.id);
      setOrganizationAssignments(
        await fetchAircraftOrganizationAssignments(adminOwnedAircraftIds)
      );
    }
  }

  function updateField<K extends keyof AircraftFormState>(key: K, value: AircraftFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function getDueInputFromForm(): SavedAircraftDueInput {
    return {
      hundred_hour_due_hours: toNullableNumber(form.hundred_hour_due_hours),
      annual_due_date: monthToLastIsoDate(form.annual_due_date),
      static_due_date: monthToLastIsoDate(form.static_due_date),
      transponder_due_date: monthToLastIsoDate(form.transponder_due_date),
      elt_due_date: monthToLastIsoDate(form.elt_due_date),
    };
  }

  function getPersonalInspectionInputs(): PersonalAircraftInspectionInput[] {
    const names = new Set<string>();
    return inspectionDrafts.map((item) => {
      const name = item.name.trim();
      if (name.length < 2) throw new Error("Each inspection needs a name.");
      const normalizedName = name.toLocaleLowerCase();
      if (names.has(normalizedName)) throw new Error(`Inspection names must be unique: ${name}.`);
      names.add(normalizedName);
      const needsDate = item.basis === "calendar" || item.basis === "whichever_first";
      const needsMeter = item.basis !== "calendar";
      const dueMeter = toNullableNumber(item.due_meter);
      const dateFormat = item.date_precision === "month" ? "MM/YYYY" : "MM/DD/YYYY";
      if (needsDate && !item.due_date) throw new Error(`${name} needs a due date in ${dateFormat} format.`);
      if (needsMeter && dueMeter === null) throw new Error(`${name} needs a due meter value.`);
      return {
        name,
        basis: item.basis,
        date_precision: item.date_precision,
        due_date: needsDate
          ? item.date_precision === "month" ? monthToLastIsoDate(item.due_date) : item.due_date
          : null,
        due_meter: needsMeter ? dueMeter : null,
        notes: item.notes.trim() || null,
      };
    });
  }

  function updateInspectionDraft<K extends keyof PersonalInspectionDraft>(
    clientKey: string,
    key: K,
    value: PersonalInspectionDraft[K]
  ) {
    setInspectionDrafts((current) => current.map((item) =>
      item.clientKey === clientKey ? { ...item, [key]: value } : item
    ));
  }

  function addInspectionDraft(name = "", datePrecision: PersonalAircraftInspectionDatePrecision = "day") {
    setInspectionDrafts((current) => [...current, {
      clientKey: crypto.randomUUID(),
      id: "",
      name,
      basis: "calendar",
      date_precision: datePrecision,
      due_date: "",
      due_meter: "",
      notes: "",
    }]);
  }

  function hasAircraftInfoChanges(aircraft: AircraftRecord, proposed: {
    model_id: string;
    tail_number: string;
    empty_weight: number;
    empty_arm: number;
    empty_lat_arm: number | null;
  }) {
    return (
      String(aircraft.model_id ?? "") !== proposed.model_id ||
      String(aircraft.tail_number ?? "").toUpperCase() !== proposed.tail_number ||
      aircraft.empty_weight !== proposed.empty_weight ||
      aircraft.empty_arm !== proposed.empty_arm ||
      (aircraft.empty_lat_arm ?? null) !== proposed.empty_lat_arm
    );
  }

  function openAddForm() {
    setForm(emptyForm);
    setInspectionDrafts([]);
    setEditingAircraftId("");
    setConflict(null);
    setStatus("");
    setShowForm(true);
    closeOrganizationAssignments();
  }

  function openEditForm(aircraft: AircraftRecord) {
    setForm({
      model_id: aircraft.model_id ?? "",
      tail_number: aircraft.tail_number ?? aircraft.name ?? "",
      empty_weight: aircraft.empty_weight != null ? String(aircraft.empty_weight) : "",
      empty_arm: aircraft.empty_arm != null ? String(aircraft.empty_arm) : "",
      empty_lat_arm: aircraft.empty_lat_arm != null ? String(aircraft.empty_lat_arm) : "",
      hundred_hour_due_hours:
        aircraft.hundred_hour_due_hours != null ? String(aircraft.hundred_hour_due_hours) : "",
      annual_due_date: formatDateInput(aircraft.annual_due_date),
      static_due_date: formatDateInput(aircraft.static_due_date),
      transponder_due_date: formatDateInput(aircraft.transponder_due_date),
      elt_due_date: formatDateInput(aircraft.elt_due_date),
    });
    setInspectionDrafts(personalInspections
      .filter((item) => item.aircraft_id === aircraft.id)
      .map((item) => ({
        clientKey: item.id,
        id: item.id,
        name: item.name,
        basis: item.basis,
        date_precision: item.date_precision,
        due_date: item.date_precision === "month" ? formatDateInput(item.due_date) : item.due_date ?? "",
        due_meter: item.due_meter != null ? String(item.due_meter) : "",
        notes: item.notes ?? "",
      }))
    );
    setEditingAircraftId(aircraft.id);
    setConflict(null);
    setStatus("");
    setShowForm(true);
    closeOrganizationAssignments();
  }

  function closeForm() {
    setForm(emptyForm);
    setInspectionDrafts([]);
    setEditingAircraftId("");
    setConflict(null);
    setShowForm(false);
  }

  async function handleAttach() {
    if (!session?.user?.id) {
      return;
    }

    if (!form.model_id) {
      setStatus("Select a model.");
      return;
    }

    if (!form.tail_number.trim()) {
      setStatus("Tail number is required.");
      return;
    }

    setSaving(true);
    setStatus("");
    setConflict(null);

    try {
      if (editingAircraftId) {
        const currentAircraft = myAircraft.find((aircraft) => aircraft.id === editingAircraftId);

        if (!currentAircraft) {
          throw new Error("Unable to find this aircraft.");
        }

        const proposed = {
          model_id: form.model_id,
          tail_number: form.tail_number.trim().toUpperCase(),
          empty_weight: toRequiredNumber(form.empty_weight, "Empty weight"),
          empty_arm: toRequiredNumber(form.empty_arm, "Empty arm"),
          empty_lat_arm: toNullableNumber(form.empty_lat_arm),
        };
        const dueInput = getDueInputFromForm();
        const inspectionInputs = getPersonalInspectionInputs();

        if (currentAircraft.visibility === "private" && currentAircraft.owner_user_id === session.user.id) {
          await updateMyAircraft(session.user.id, editingAircraftId, {
            model_id: proposed.model_id,
            name: proposed.tail_number,
            empty_weight: proposed.empty_weight,
            empty_arm: proposed.empty_arm,
            empty_lat_arm: proposed.empty_lat_arm,
          });
          await updateSavedAircraftDue(session.user.id, editingAircraftId, dueInput);
          await savePersonalAircraftInspections(editingAircraftId, inspectionInputs);
          await reloadAircraftLists();
          closeForm();
          setStatus("Aircraft updated.");
          return;
        }

        if (!hasAircraftInfoChanges(currentAircraft, proposed)) {
          await updateSavedAircraftDue(session.user.id, editingAircraftId, dueInput);
          await savePersonalAircraftInspections(editingAircraftId, inspectionInputs);
          await reloadAircraftLists();
          closeForm();
          setStatus("Aircraft due info saved.");
          return;
        }

        setConflict({
          kind: "conflict",
          aircraft: currentAircraft,
          proposed,
        });
        setStatus("Changes to a shared aircraft must be submitted for review.");
        return;
      }

      const dueInput = getDueInputFromForm();
      const result = await attachAircraftByTail({
        userId: session.user.id,
        model_id: form.model_id,
        tail_number: form.tail_number,
        empty_weight: toRequiredNumber(form.empty_weight, "Empty weight"),
        empty_arm: toRequiredNumber(form.empty_arm, "Empty arm"),
        empty_lat_arm: toNullableNumber(form.empty_lat_arm),
      });

      if (result.kind === "conflict") {
        setConflict(result);
        setStatus("This tail number already exists with different weight-and-balance values.");
        return;
      }

      await updateSavedAircraftDue(session.user.id, result.aircraft.id, dueInput);
      await savePersonalAircraftInspections(result.aircraft.id, getPersonalInspectionInputs());
      await reloadAircraftLists();
      closeForm();
      setStatus(
        result.kind === "created"
          ? "Aircraft created and added to My Aircraft."
          : "Aircraft added to My Aircraft."
      );
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to add aircraft right now."));
    } finally {
      setSaving(false);
    }
  }

  async function handleUseCurrentAircraft() {
    if (!session?.user?.id || !conflict) {
      return;
    }

    setSaving(true);
    setStatus("");

    try {
      await saveCurrentAircraftForUser(session.user.id, conflict.aircraft.id);
      await updateSavedAircraftDue(session.user.id, conflict.aircraft.id, getDueInputFromForm());
      await savePersonalAircraftInspections(conflict.aircraft.id, getPersonalInspectionInputs());
      await reloadAircraftLists();
      closeForm();
      setStatus("Current shared aircraft added to My Aircraft.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to attach current aircraft."));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitUpdateRequest() {
    if (!session?.user?.id || !conflict) {
      return;
    }

    setSaving(true);
    setStatus("");

    try {
      if (editingAircraftId) {
        await updateSavedAircraftDue(session.user.id, editingAircraftId, getDueInputFromForm());
        await savePersonalAircraftInspections(editingAircraftId, getPersonalInspectionInputs());
      }

      await submitAircraftUpdateRequest({
        aircraft_id: conflict.aircraft.id,
        submitted_by: session.user.id,
        proposed_empty_weight: conflict.proposed.empty_weight,
        proposed_empty_arm: conflict.proposed.empty_arm,
        proposed_empty_lat_arm: conflict.proposed.empty_lat_arm,
        note: `Submitted from My Aircraft for ${conflict.proposed.tail_number}.`,
      });
      closeForm();
      setStatus("Update request submitted for admin review.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to submit an aircraft update request."));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(aircraftId: string) {
    if (!session?.user?.id) {
      return;
    }

    const confirmed = window.confirm("Remove this aircraft from My Aircraft?");
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setStatus("");

    try {
      await removeMyAircraft(session.user.id, aircraftId);
      setMyAircraft((current) => current.filter((aircraft) => aircraft.id !== aircraftId));
      setOrganizationAssignments((current) =>
        current.filter((assignment) => assignment.aircraft_id !== aircraftId)
      );
      if (assigningAircraftId === aircraftId) {
        closeOrganizationAssignments();
      }
      setStatus("Aircraft removed from My Aircraft.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to remove this aircraft right now."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="saas-panel">Loading aircraft...</div>;
  }

  return (
    <>
      {status ? <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600" role="status">{status}</p> : null}
      <ManagementDisclosure id="my-aircraft" title="My Aircraft" summary={`${myAircraft.length}`} actions={<CompactButton type="button" tone="primary" onClick={openAddForm}>Add aircraft</CompactButton>} helpContent={<><p>Manage aircraft attached to your account, including weight and balance data and personal maintenance reminders.</p><p>Eligible private aircraft can be shared with selected organizations without changing ownership.</p></>}>
        <div className="people-toolbar">
          <div>
            <h3 className="saas-subsection-title">My Aircraft</h3>
            <p className="saas-meta-text">{myAircraft.length} attached</p>
          </div>
          <div className="rounded-[14px] border border-slate-200/80 bg-white px-3 py-2 text-right shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Shared registry
            </p>
            <p className="mt-1 text-sm font-medium text-slate-700">{sharedAircraft.length} aircraft</p>
          </div>
        </div>

        <div className="my-aircraft-table mt-4">
          <div className="my-aircraft-table-head">
            <span>Tail number</span>
            <span>Model</span>
            <span>Weight & balance</span>
            <span>Action</span>
          </div>

          {myAircraft.length === 0 ? (
            <p className="saas-empty-state">No aircraft attached yet.</p>
          ) : (
            myAircraft.map((aircraft) => (
              <div key={aircraft.id} className="my-aircraft-row">
                <div className="my-aircraft-cell my-aircraft-tail">
                  <p className="my-aircraft-primary">{aircraft.tail_number}</p>
                </div>
                <div className="my-aircraft-cell my-aircraft-model">
                  <p className="my-aircraft-secondary">
                    {modelNameById.get(aircraft.model_id ?? "") ?? aircraft.model?.name ?? "Unknown model"}
                  </p>
                </div>
                <div className="my-aircraft-cell my-aircraft-wb">
                  <p className="my-aircraft-secondary">
                    {aircraft.empty_weight ?? "--"} lbs · Arm {aircraft.empty_arm ?? "--"}
                    {aircraft.empty_lat_arm != null ? ` · Lat ${aircraft.empty_lat_arm}` : ""}
                  </p>
                  <p className="my-aircraft-secondary my-aircraft-muted-line">
                    Updated {formatUsDate(aircraft.updated_at, "--")}
                    {getDueSummary(aircraft) ? ` · ${getDueSummary(aircraft)}` : ""}
                  </p>
                  {getPersonalInspectionSummary(aircraft.id) ? (
                    <p className="my-aircraft-secondary my-aircraft-muted-line">
                      {getPersonalInspectionSummary(aircraft.id)}
                    </p>
                  ) : null}
                  {canAssignAircraft(aircraft) ? (
                    <p className="my-aircraft-secondary my-aircraft-muted-line">
                      Organizations: {getAircraftOrganizationIds(aircraft.id).length > 0
                        ? getAircraftOrganizationIds(aircraft.id)
                            .map((organizationId) => organizationNameById.get(organizationId) ?? "Unknown organization")
                            .join(", ")
                        : "None"}
                    </p>
                  ) : null}
                </div>
                <div className="my-aircraft-cell my-aircraft-actions">
                  {canAssignAircraft(aircraft) ? (
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={saving}
                      onClick={() => openOrganizationAssignments(aircraft)}
                    >
                      Organizations ({getAircraftOrganizationIds(aircraft.id).length})
                    </button>
                  ) : (
                    <span
                      className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600"
                      title={aircraft.visibility === "shared"
                        ? "Global shared aircraft cannot be assigned directly to an organization."
                        : "Organization assignment is available only to the Platform Super Admin who owns the aircraft."}
                    >
                      {aircraft.visibility === "shared" ? "Global shared" : "Personal aircraft"}
                    </span>
                  )}
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={saving}
                    onClick={() => openEditForm(aircraft)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="danger-button-compact"
                    disabled={saving}
                    onClick={() => void handleRemove(aircraft.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </ManagementDisclosure>

      {activeOrganization ? (
        <ManagementDisclosure id="organization-fleet-personal" eyebrow="Organization fleet" title={activeOrganization.name} summary={`${organizationAircraft.length}`} helpContent={<p>These aircraft are shared with the selected organization. Access and editing depend on your organization role.</p>}>
          <div className="people-toolbar">
            <div>
              <p className="saas-kicker">Organization fleet</p>
              <h3 className="saas-subsection-title">{activeOrganization.name}</h3>
              <p className="saas-meta-text">{organizationAircraft.length} shared with this organization</p>
            </div>
          </div>

          <div className="my-aircraft-table mt-4">
            <div className="my-aircraft-table-head">
              <span>Tail number</span>
              <span>Model</span>
              <span>Weight &amp; balance / maintenance</span>
              <span>Access</span>
            </div>
            {organizationAircraft.length === 0 ? (
              <p className="saas-empty-state">No organization aircraft yet.</p>
            ) : (
              organizationAircraft.map((aircraft) => (
                <div key={aircraft.id} className="my-aircraft-row">
                  <div className="my-aircraft-cell my-aircraft-tail">
                    <p className="my-aircraft-primary">{aircraft.tail_number}</p>
                  </div>
                  <div className="my-aircraft-cell my-aircraft-model">
                    <p className="my-aircraft-secondary">
                      {modelNameById.get(aircraft.model_id ?? "") ?? aircraft.model?.name ?? "Unknown model"}
                    </p>
                  </div>
                  <div className="my-aircraft-cell my-aircraft-wb">
                    <p className="my-aircraft-secondary">
                      {aircraft.empty_weight ?? "--"} lbs · Arm {aircraft.empty_arm ?? "--"}
                    </p>
                    <p className="my-aircraft-secondary my-aircraft-muted-line">
                      {getDueSummary(aircraft) || "No maintenance due dates recorded"}
                    </p>
                  </div>
                  <div className="my-aircraft-cell my-aircraft-actions">
                    <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                      Organization
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </ManagementDisclosure>
      ) : null}

      <DetailDrawer
        open={showForm}
        width="wide"
        title={editingAircraftId ? "Edit aircraft" : "Add aircraft"}
        description={editingAircraftId
          ? "Edit aircraft details and personal maintenance due values in compact worksheets."
          : "Add a tail number or attach an existing shared aircraft."
        }
        onClose={closeForm}
      >
        <form
          className="overflow-hidden border border-slate-300 bg-white shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void handleAttach();
          }}
        >
          {status ? (
            <div className="border-b border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert">
              {status}
            </div>
          ) : null}

          <div className="border-b border-slate-300 bg-slate-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-800">
            Aircraft details
          </div>
          <WorksheetGrid label="Personal aircraft details" minWidth={760}>
            <thead>
              <tr>
                <WorksheetHeader className="min-w-48">Model</WorksheetHeader>
                <WorksheetHeader className="min-w-36">Tail number</WorksheetHeader>
                <WorksheetHeader>Empty weight (lb)</WorksheetHeader>
                <WorksheetHeader>Longitudinal arm (in)</WorksheetHeader>
                <WorksheetHeader>Lateral arm (in)</WorksheetHeader>
              </tr>
            </thead>
            <tbody>
              <tr>
                <WorksheetCell>
                  <select
                    required
                    aria-label="Aircraft model"
                    className={worksheetInputClass}
                    value={form.model_id}
                    onChange={(event) => updateField("model_id", event.target.value)}
                  >
                    <option value="">Select model</option>
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>{model.name}</option>
                    ))}
                  </select>
                </WorksheetCell>
                <WorksheetCell>
                  <input
                    required
                    aria-label="Tail number"
                    className={worksheetInputClass}
                    value={form.tail_number}
                    onChange={(event) => updateField("tail_number", event.target.value.toUpperCase())}
                    placeholder="N12345"
                  />
                </WorksheetCell>
                <WorksheetCell>
                  <input required aria-label="Empty weight in pounds" className={worksheetInputClass} type="number" step="any" min="0" value={form.empty_weight} onChange={(event) => updateField("empty_weight", event.target.value)} />
                </WorksheetCell>
                <WorksheetCell>
                  <input required aria-label="Longitudinal arm in inches" className={worksheetInputClass} type="number" step="any" value={form.empty_arm} onChange={(event) => updateField("empty_arm", event.target.value)} />
                </WorksheetCell>
                <WorksheetCell>
                  <input aria-label="Lateral arm in inches" className={worksheetInputClass} type="number" step="any" value={form.empty_lat_arm} onChange={(event) => updateField("empty_lat_arm", event.target.value)} />
                </WorksheetCell>
              </tr>
            </tbody>
          </WorksheetGrid>

          <div className="border-b border-t border-slate-300 bg-slate-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-800">
            Personal maintenance due
          </div>
          <WorksheetGrid label="Personal aircraft maintenance due values" minWidth={700}>
            <thead>
              <tr>
                <WorksheetHeader>100-hour (Hobbs)</WorksheetHeader>
                <WorksheetHeader>Annual</WorksheetHeader>
                <WorksheetHeader>91.411 static</WorksheetHeader>
                <WorksheetHeader>91.413 transponder</WorksheetHeader>
                <WorksheetHeader>ELT</WorksheetHeader>
              </tr>
            </thead>
            <tbody>
              <tr>
                <WorksheetCell>
                  <input aria-label="100-hour inspection due Hobbs" className={worksheetInputClass} type="number" step="0.1" min="0" value={form.hundred_hour_due_hours} onChange={(event) => updateField("hundred_hour_due_hours", event.target.value)} />
                </WorksheetCell>
                <WorksheetCell>
                  <UsDateInput precision="month" aria-label="Annual inspection due month" className={worksheetInputClass} value={form.annual_due_date} onChange={(value) => updateField("annual_due_date", value)} />
                </WorksheetCell>
                <WorksheetCell>
                  <UsDateInput precision="month" aria-label="Static inspection due month" className={worksheetInputClass} value={form.static_due_date} onChange={(value) => updateField("static_due_date", value)} />
                </WorksheetCell>
                <WorksheetCell>
                  <UsDateInput precision="month" aria-label="Transponder inspection due month" className={worksheetInputClass} value={form.transponder_due_date} onChange={(value) => updateField("transponder_due_date", value)} />
                </WorksheetCell>
                <WorksheetCell>
                  <UsDateInput precision="month" aria-label="ELT inspection due month" className={worksheetInputClass} value={form.elt_due_date} onChange={(value) => updateField("elt_due_date", value)} />
                </WorksheetCell>
              </tr>
            </tbody>
          </WorksheetGrid>

          <div className="flex items-center justify-between gap-2 border-b border-t border-slate-300 bg-slate-800 px-2 py-1 text-white">
            <span className="text-[11px] font-bold uppercase tracking-wide">Additional inspections</span>
            <div className="flex gap-1">
              <CompactButton type="button" className="border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={() => addInspectionDraft("Registration", "month")}>Add registration</CompactButton>
              <CompactButton type="button" className="border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={() => addInspectionDraft()}>Add inspection</CompactButton>
            </div>
          </div>
          <WorksheetGrid label="Additional personal aircraft inspections" minWidth={820}>
            <thead>
              <tr>
                <WorksheetHeader>Inspection</WorksheetHeader>
                <WorksheetHeader>Tracked by</WorksheetHeader>
                <WorksheetHeader>Due date / month</WorksheetHeader>
                <WorksheetHeader>Due meter</WorksheetHeader>
                <WorksheetHeader>Notes</WorksheetHeader>
                <WorksheetHeader className="w-20 text-right">Action</WorksheetHeader>
              </tr>
            </thead>
            <tbody>
              {inspectionDrafts.length === 0 ? (
                <tr><td colSpan={6} className="h-8 border-b border-slate-200 px-2 text-xs text-slate-400">No additional inspections.</td></tr>
              ) : null}
              {inspectionDrafts.map((item) => {
                const needsDate = item.basis === "calendar" || item.basis === "whichever_first";
                const needsMeter = item.basis !== "calendar";
                return (
                  <tr key={item.clientKey}>
                    <WorksheetCell><input required aria-label="Inspection name" className={worksheetInputClass} value={item.name} onChange={(event) => updateInspectionDraft(item.clientKey, "name", event.target.value)} placeholder="Registration" /></WorksheetCell>
                    <WorksheetCell>
                      <select
                        aria-label={`${item.name || "Inspection"} tracking method`}
                        className={worksheetInputClass}
                        value={item.basis === "calendar" || item.basis === "whichever_first" ? `${item.basis}:${item.date_precision}` : item.basis}
                        onChange={(event) => {
                          const [basis, precision] = event.target.value.split(":") as [PersonalAircraftInspectionBasis, PersonalAircraftInspectionDatePrecision?];
                          updateInspectionDraft(item.clientKey, "basis", basis);
                          if (precision) updateInspectionDraft(item.clientKey, "date_precision", precision);
                        }}
                      >
                        <option value="calendar:month">Calendar month</option>
                        <option value="calendar:day">Calendar date</option>
                        <option value="hobbs">Hobbs</option>
                        <option value="tach">Tach</option>
                        <option value="whichever_first:month">Month or meter, first due</option>
                        <option value="whichever_first:day">Date or meter, first due</option>
                      </select>
                    </WorksheetCell>
                    <WorksheetCell>
                      {needsDate ? <UsDateInput required precision={item.date_precision} aria-label={`${item.name || "Inspection"} due ${item.date_precision === "month" ? "month" : "date"}`} className={worksheetInputClass} value={item.due_date} onChange={(value) => updateInspectionDraft(item.clientKey, "due_date", value)} /> : <span className="block h-8 px-2 py-2 text-slate-400">—</span>}
                    </WorksheetCell>
                    <WorksheetCell>
                      {needsMeter ? <input required aria-label={`${item.name || "Inspection"} due meter`} className={worksheetInputClass} type="number" min="0" step="0.1" value={item.due_meter} onChange={(event) => updateInspectionDraft(item.clientKey, "due_meter", event.target.value)} /> : <span className="block h-8 px-2 py-2 text-slate-400">—</span>}
                    </WorksheetCell>
                    <WorksheetCell><input aria-label={`${item.name || "Inspection"} notes`} className={worksheetInputClass} value={item.notes} onChange={(event) => updateInspectionDraft(item.clientKey, "notes", event.target.value)} /></WorksheetCell>
                    <WorksheetCell className="text-right"><CompactButton type="button" tone="danger" className="m-0.5" onClick={() => setInspectionDrafts((current) => current.filter((draft) => draft.clientKey !== item.clientKey))}>Remove</CompactButton></WorksheetCell>
                  </tr>
                );
              })}
            </tbody>
          </WorksheetGrid>

          {editingAircraftId ? (
            <p className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              Last updated {formatUsDate(myAircraft.find((aircraft) => aircraft.id === editingAircraftId)?.updated_at, "--")}
            </p>
          ) : null}

          {conflict ? (
            <div className="border-t border-amber-300 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-950">Existing shared aircraft found</p>
              <p className="mt-1 text-xs text-amber-800">
                The tail number exists with different weight-and-balance values. Use the current record or submit your values for review.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <CompactButton type="button" disabled={saving} onClick={() => void handleUseCurrentAircraft()}>
                  Use current record
                </CompactButton>
                <CompactButton type="button" tone="primary" disabled={saving} onClick={() => void handleSubmitUpdateRequest()}>
                  Submit update for review
                </CompactButton>
                <CompactButton type="button" disabled={saving} onClick={() => setConflict(null)}>
                  Cancel
                </CompactButton>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-slate-300 bg-slate-50 px-3 py-2">
            <CompactButton type="button" disabled={saving} onClick={closeForm}>Cancel</CompactButton>
            <CompactButton type="submit" tone="primary" disabled={saving}>
              {saving ? "Saving..." : editingAircraftId ? "Save aircraft" : "Add aircraft"}
            </CompactButton>
          </div>
        </form>
      </DetailDrawer>

      <DetailDrawer
        open={Boolean(assigningAircraftId)}
        title="Organization access"
        description={`Choose which organizations may use ${myAircraft.find((aircraft) => aircraft.id === assigningAircraftId)?.tail_number ?? "this aircraft"}.`}
        onClose={closeOrganizationAssignments}
      >
        <div className="overflow-hidden border border-slate-300 bg-white">
          <div className="grid divide-y divide-slate-200">
            {platformOrganizations.map((organization) => (
              <label key={organization.id} className="flex min-h-9 cursor-pointer items-center gap-3 px-3 py-2 text-xs hover:bg-blue-50">
                <input type="checkbox" checked={selectedOrganizationIds.includes(organization.id)} disabled={saving} onChange={() => toggleOrganizationAssignment(organization.id)} />
                <span className="min-w-0 flex-1 font-medium text-slate-900">{organization.name}</span>
                <span className="truncate text-slate-500">{organization.owner_display_name || organization.owner_email || "Owner unavailable"}</span>
              </label>
            ))}
            {platformOrganizations.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-slate-500">No organizations are available.</p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-300 bg-slate-50 px-3 py-2">
            <CompactButton type="button" disabled={saving} onClick={closeOrganizationAssignments}>Cancel</CompactButton>
            <CompactButton type="button" tone="primary" disabled={saving} onClick={() => void handleSaveOrganizationAssignments()}>
              {saving ? "Saving..." : "Apply access"}
            </CompactButton>
          </div>
        </div>
      </DetailDrawer>

    </>
  );
}
