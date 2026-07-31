"use client";

import { useEffect, useMemo, useState } from "react";

import {
  CompactButton,
  DetailDrawer,
  WorksheetCell,
  WorksheetGrid,
  WorksheetHeader,
  worksheetInputClass,
} from "@/components/admin/AdminConsole";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import {
  attachAircraftByTail,
  fetchAircraftOrganizationAssignments,
  fetchAircraftModels,
  fetchMyAircraft,
  fetchOrganizationAircraft,
  fetchSharedAircraft,
  removeMyAircraft,
  saveCurrentAircraftForUser,
  setPlatformAircraftOrganizations,
  submitAircraftUpdateRequest,
  updateMyAircraft,
  updateSavedAircraftDue,
  type AircraftModelRecord,
  type AircraftOrganizationAssignment,
  type AircraftRecord,
  type AttachAircraftConflict,
  type SavedAircraftDueInput,
} from "@/lib/aircraft";
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

function formatDateLabel(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-");
  if (!year || !month) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day || "1"))));
}

function formatDateInput(value: string | null | undefined) {
  return value ? value.slice(0, 7) : "";
}

function getDueSummary(aircraft: AircraftRecord) {
  const items = [
    aircraft.hundred_hour_due_hours != null ? `100hr ${aircraft.hundred_hour_due_hours}` : "",
    aircraft.annual_due_date ? `Annual ${formatDateLabel(aircraft.annual_due_date)}` : "",
    aircraft.static_due_date ? `91.411 ${formatDateLabel(aircraft.static_due_date)}` : "",
    aircraft.transponder_due_date ? `91.413 ${formatDateLabel(aircraft.transponder_due_date)}` : "",
    aircraft.elt_due_date ? `ELT ${formatDateLabel(aircraft.elt_due_date)}` : "",
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
        const [profile, modelList, sharedList, attachedList, organizationList] = await Promise.all([
          fetchCurrentProfile(session.user.id),
          fetchAircraftModels(),
          fetchSharedAircraft(),
          fetchMyAircraft(session.user.id),
          activeOrganization?.id
            ? fetchOrganizationAircraft(activeOrganization.id)
            : Promise.resolve([]),
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

    const [sharedList, attachedList, organizationList] = await Promise.all([
      fetchSharedAircraft(),
      fetchMyAircraft(session.user.id),
      activeOrganization?.id
        ? fetchOrganizationAircraft(activeOrganization.id)
        : Promise.resolve([]),
    ]);

    setSharedAircraft(sharedList);
    setMyAircraft(attachedList);
    setOrganizationAircraft(organizationList);
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
    const toStoredMonthEnd = (value: string) => {
      const [year, month] = value.split("-").map(Number);
      if (!year || !month) {
        return null;
      }

      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    };

    return {
      hundred_hour_due_hours: toNullableNumber(form.hundred_hour_due_hours),
      annual_due_date: toStoredMonthEnd(form.annual_due_date),
      static_due_date: toStoredMonthEnd(form.static_due_date),
      transponder_due_date: toStoredMonthEnd(form.transponder_due_date),
      elt_due_date: toStoredMonthEnd(form.elt_due_date),
    };
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
    setEditingAircraftId(aircraft.id);
    setConflict(null);
    setStatus("");
    setShowForm(true);
    closeOrganizationAssignments();
  }

  function closeForm() {
    setForm(emptyForm);
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

        if (currentAircraft.visibility === "private" && currentAircraft.owner_user_id === session.user.id) {
          await updateMyAircraft(session.user.id, editingAircraftId, {
            model_id: proposed.model_id,
            name: proposed.tail_number,
            empty_weight: proposed.empty_weight,
            empty_arm: proposed.empty_arm,
            empty_lat_arm: proposed.empty_lat_arm,
          });
          await updateSavedAircraftDue(session.user.id, editingAircraftId, dueInput);
          await reloadAircraftLists();
          closeForm();
          setStatus("Aircraft updated.");
          return;
        }

        if (!hasAircraftInfoChanges(currentAircraft, proposed)) {
          await updateSavedAircraftDue(session.user.id, editingAircraftId, dueInput);
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
      <section className="saas-panel people-list-panel">
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
          <CompactButton type="button" tone="primary" onClick={openAddForm}>
            Add aircraft
          </CompactButton>
        </div>

        {status ? <p className="saas-meta-text mt-3">{status}</p> : null}

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
                    Updated {formatDateLabel(aircraft.updated_at) || "--"}
                    {getDueSummary(aircraft) ? ` · ${getDueSummary(aircraft)}` : ""}
                  </p>
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
      </section>

      {activeOrganization ? (
        <section className="saas-panel people-list-panel">
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
        </section>
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
                  <input aria-label="Annual inspection due month" className={worksheetInputClass} type="month" value={form.annual_due_date} onChange={(event) => updateField("annual_due_date", event.target.value)} />
                </WorksheetCell>
                <WorksheetCell>
                  <input aria-label="Static inspection due month" className={worksheetInputClass} type="month" value={form.static_due_date} onChange={(event) => updateField("static_due_date", event.target.value)} />
                </WorksheetCell>
                <WorksheetCell>
                  <input aria-label="Transponder inspection due month" className={worksheetInputClass} type="month" value={form.transponder_due_date} onChange={(event) => updateField("transponder_due_date", event.target.value)} />
                </WorksheetCell>
                <WorksheetCell>
                  <input aria-label="ELT inspection due month" className={worksheetInputClass} type="month" value={form.elt_due_date} onChange={(event) => updateField("elt_due_date", event.target.value)} />
                </WorksheetCell>
              </tr>
            </tbody>
          </WorksheetGrid>

          {editingAircraftId ? (
            <p className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              Last updated {formatDateLabel(myAircraft.find((aircraft) => aircraft.id === editingAircraftId)?.updated_at) || "--"}
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
