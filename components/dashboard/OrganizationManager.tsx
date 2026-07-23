"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import {
  createAircraftModel,
  deleteAircraftModel,
  deleteOrganizationAircraft,
  fetchAircraftModels,
  fetchOrganizationAircraft,
  parseAircraftEnvelopeSet,
  parseAircraftStations,
  saveOrganizationAircraftAtomic,
  updateAircraftModel,
  type AircraftMeterType,
  type AircraftModelRecord,
  type AircraftOperationalStatus,
  type AircraftRecord,
  type OrganizationAircraftMaintenanceInput,
} from "@/lib/aircraft";
import {
  addOrganizationPerson,
  archivePendingOrganizationPerson,
  canManageOrganization,
  canManageOrganizationAdmins,
  fetchOrganizationMembers,
  fetchOrganizationPeople,
  removeOrganizationMember,
  setOrganizationMemberRole,
  setOrganizationMemberTeachingRole,
  transferOrganizationOwnership,
  updateOrganizationPerson,
  type OrganizationMember,
  type OrganizationPerson,
  type OrganizationTeachingRole,
} from "@/lib/organizations";
import OrganizationEndorsementRequests from "@/components/dashboard/OrganizationEndorsementRequests";
import {
  createOrganizationNotification,
  type NotificationPriority,
} from "@/lib/notifications";
import OrganizationInspectionManager from "@/components/dashboard/OrganizationInspectionManager";
import {
  AdminCollapsibleSection,
  AdminPageHeader,
  AdminSectionControls,
  StatusBadge,
} from "@/components/admin/AdminConsole";

export type OrganizationManagerView = "overview" | "people" | "fleet" | "messages" | "endorsements";

type LoadingLocationDraft = {
  clientKey: string;
  id: string;
  name: string;
  arm: string;
  latArm: string;
  weightPerGallon: string;
  fixedWeight: string;
  maxWeight: string;
  inputType: "number" | "checkbox";
  crewRole: "" | "pilot" | "copilot";
};

type WeightBalanceLimitDraft = {
  clientKey: string;
  cg: string;
  weight: string;
};

type HelicopterLimitDraft = {
  clientKey: string;
  x: string;
  y: string;
};

type ModelForm = {
  name: string;
  category: "airplane" | "helicopter";
  avg_fuel_burn_rate: string;
  max_weight: string;
  stations: LoadingLocationDraft[];
  envelope: WeightBalanceLimitDraft[];
  topView: HelicopterLimitDraft[];
  sideView: HelicopterLimitDraft[];
};

const emptyModelForm: ModelForm = {
  name: "",
  category: "airplane",
  avg_fuel_burn_rate: "",
  max_weight: "",
  stations: [
    {
      clientKey: "new-loading-location-1",
      id: "",
      name: "",
      arm: "",
      latArm: "",
      weightPerGallon: "",
      fixedWeight: "",
      maxWeight: "",
      inputType: "number",
      crewRole: "",
    },
  ],
  envelope: [
    { clientKey: "new-limit-1", cg: "", weight: "" },
    { clientKey: "new-limit-2", cg: "", weight: "" },
    { clientKey: "new-limit-3", cg: "", weight: "" },
  ],
  topView: [
    { clientKey: "new-top-limit-1", x: "", y: "" },
    { clientKey: "new-top-limit-2", x: "", y: "" },
    { clientKey: "new-top-limit-3", x: "", y: "" },
  ],
  sideView: [
    { clientKey: "new-side-limit-1", x: "", y: "" },
    { clientKey: "new-side-limit-2", x: "", y: "" },
    { clientKey: "new-side-limit-3", x: "", y: "" },
  ],
};

type AircraftForm = {
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
  adsb_due_date: string;
  registration_due_date: string;
  operational_status: AircraftOperationalStatus;
  operational_status_note: string;
  current_meter_type: AircraftMeterType;
  current_meter_value: string;
  meter_observed_at: string;
  meter_change_reason: string;
};

const emptyAircraftForm: AircraftForm = {
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
  adsb_due_date: "",
  registration_due_date: "",
  operational_status: "available",
  operational_status_note: "",
  current_meter_type: "hobbs",
  current_meter_value: "",
  meter_observed_at: "",
  meter_change_reason: "",
};

export default function OrganizationManager({ view = "overview" }: { view?: OrganizationManagerView }) {
  const { session } = useAuthSession();
  const { activeOrganization, loading: organizationsLoading, refreshOrganizations } = useOrganization();
  const role = activeOrganization?.member_role;
  const canManage = canManageOrganization(role);
  const canManageFleet = role === "owner" || role === "organization_admin";
  const canManageAdmins = canManageOrganizationAdmins(role);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberDisplayName, setMemberDisplayName] = useState("");
  const [memberTeachingRole, setMemberTeachingRole] = useState<OrganizationTeachingRole | "">("");
  const [memberInternalId, setMemberInternalId] = useState("");
  const [memberNotes, setMemberNotes] = useState("");
  const [messageTitle, setMessageTitle] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [messagePriority, setMessagePriority] = useState<NotificationPriority>("normal");
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [organizationPeople, setOrganizationPeople] = useState<OrganizationPerson[]>([]);
  const [editingPersonId, setEditingPersonId] = useState("");
  const [personDraft, setPersonDraft] = useState({
    displayName: "",
    teachingRole: "" as OrganizationTeachingRole | "",
    internalId: "",
    notes: "",
  });
  const [models, setModels] = useState<AircraftModelRecord[]>([]);
  const [aircraft, setAircraft] = useState<AircraftRecord[]>([]);
  const [editingAircraftId, setEditingAircraftId] = useState("");
  const [showAircraftForm, setShowAircraftForm] = useState(false);
  const [aircraftForm, setAircraftForm] = useState<AircraftForm>(emptyAircraftForm);
  const [aircraftError, setAircraftError] = useState("");
  const [editingModelId, setEditingModelId] = useState("");
  const [showModelForm, setShowModelForm] = useState(false);
  const [modelForm, setModelForm] = useState<ModelForm>(emptyModelForm);
  const [modelError, setModelError] = useState("");
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set());

  const modelNames = useMemo(
    () => new Map(models.map((model) => [model.id, model.name])),
    [models]
  );
  const peopleByUserId = useMemo(
    () => new Map(
      organizationPeople
        .filter((person) => person.user_id)
        .map((person) => [person.user_id as string, person]),
    ),
    [organizationPeople],
  );
  const pendingPeople = organizationPeople.filter((person) => person.status === "pending");
  const editingAircraft = aircraft.find((item) => item.id === editingAircraftId) ?? null;
  const editingAssignedAircraft = editingAircraft?.organization_access === "assigned";
  const activeSectionKeys = organizationSectionKeys(view);
  const hasOpenSection = activeSectionKeys.some((key) => openSections.has(key));

  function toggleSection(key: string) {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAllSections() {
    setOpenSections((current) => {
      const next = new Set(current);
      if (activeSectionKeys.some((key) => current.has(key))) {
        activeSectionKeys.forEach((key) => next.delete(key));
      } else {
        activeSectionKeys.forEach((key) => next.add(key));
      }
      return next;
    });
  }

  async function loadOrganizationData() {
    if (!activeOrganization?.id) {
      setMembers([]);
      setOrganizationPeople([]);
      setAircraft([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setStatus("");
    try {
      const [aircraftList, modelList, memberList, peopleList] = await Promise.all([
        fetchOrganizationAircraft(activeOrganization.id),
        fetchAircraftModels(activeOrganization.id),
        canManage ? fetchOrganizationMembers(activeOrganization.id) : Promise.resolve([]),
        canManage ? fetchOrganizationPeople(activeOrganization.id) : Promise.resolve([]),
      ]);
      setAircraft(aircraftList);
      setModels(modelList);
      setMembers(memberList);
      setOrganizationPeople(peopleList);
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to load organization data."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrganizationData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrganization?.id, canManage]);

  async function handleAddMember(event: React.FormEvent) {
    event.preventDefault();
    if (!activeOrganization?.id || !memberEmail.trim()) return;
    setSaving(true);
    setStatus("");
    try {
      const person = await addOrganizationPerson({
        organizationId: activeOrganization.id,
        email: memberEmail,
        displayName: memberDisplayName,
        teachingRole: memberTeachingRole || null,
        internalId: memberInternalId,
        notes: memberNotes,
      });
      setMemberEmail("");
      setMemberDisplayName("");
      setMemberTeachingRole("");
      setMemberInternalId("");
      setMemberNotes("");
      const [nextMembers, nextPeople] = await Promise.all([
        fetchOrganizationMembers(activeOrganization.id),
        fetchOrganizationPeople(activeOrganization.id),
      ]);
      setMembers(nextMembers);
      setOrganizationPeople(nextPeople);
      setStatus(person.user_id ? "Registered account linked and added." : "Pending person added. They can link this organization after registering with the same verified email.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to add this member."));
    } finally {
      setSaving(false);
    }
  }

  async function handleArchivePendingPerson(person: OrganizationPerson) {
    if (!window.confirm(`Remove pending person ${person.email}?`)) return;
    setSaving(true);
    setStatus("");
    try {
      await archivePendingOrganizationPerson(person.id);
      setOrganizationPeople((current) => current.filter((item) => item.id !== person.id));
      setStatus("Pending person removed.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to remove this pending person."));
    } finally {
      setSaving(false);
    }
  }

  function startEditOrganizationPerson(person: OrganizationPerson) {
    setEditingPersonId(person.id);
    setPersonDraft({
      displayName: person.organization_display_name ?? "",
      teachingRole: person.teaching_role ?? "",
      internalId: person.internal_id ?? "",
      notes: person.notes ?? "",
    });
  }

  async function handleSaveOrganizationPerson() {
    if (!activeOrganization?.id || !editingPersonId) return;
    setSaving(true);
    setStatus("");
    try {
      await updateOrganizationPerson({
        personId: editingPersonId,
        displayName: personDraft.displayName,
        teachingRole: personDraft.teachingRole || null,
        internalId: personDraft.internalId,
        notes: personDraft.notes,
      });
      const [nextMembers, nextPeople] = await Promise.all([
        fetchOrganizationMembers(activeOrganization.id),
        fetchOrganizationPeople(activeOrganization.id),
      ]);
      setMembers(nextMembers);
      setOrganizationPeople(nextPeople);
      setEditingPersonId("");
      setStatus("Organization person details updated. Personal account information was not changed.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to update this organization person."));
    } finally {
      setSaving(false);
    }
  }

  async function handleSendOrganizationMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!activeOrganization?.id || !messageTitle.trim() || !messageBody.trim()) return;
    setSaving(true);
    setStatus("");
    try {
      const recipientCount = await createOrganizationNotification({
        organizationId: activeOrganization.id,
        title: messageTitle,
        message: messageBody,
        priority: messagePriority,
      });
      setMessageTitle("");
      setMessageBody("");
      setMessagePriority("normal");
      setStatus(`Organization message sent to ${recipientCount} member${recipientCount === 1 ? "" : "s"}.`);
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to send this organization message."));
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(member: OrganizationMember) {
    if (!activeOrganization?.id) return;
    const nextRole = member.member_role === "organization_admin" ? "member" : "organization_admin";
    setSaving(true);
    setStatus("");
    try {
      await setOrganizationMemberRole(activeOrganization.id, member.user_id, nextRole);
      setMembers(await fetchOrganizationMembers(activeOrganization.id));
      setStatus(nextRole === "organization_admin" ? "Administrator assigned." : "Administrator access removed.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to change this member's role."));
    } finally {
      setSaving(false);
    }
  }

  async function handleTeachingRoleChange(member: OrganizationMember, teachingRole: "instructor" | "student" | null) {
    if (!activeOrganization?.id) return;
    setSaving(true);
    setStatus("");
    try {
      await setOrganizationMemberTeachingRole(activeOrganization.id, member.user_id, teachingRole);
      const [nextMembers, nextPeople] = await Promise.all([
        fetchOrganizationMembers(activeOrganization.id),
        fetchOrganizationPeople(activeOrganization.id),
      ]);
      setMembers(nextMembers);
      setOrganizationPeople(nextPeople);
      setStatus(teachingRole ? `Teaching role set to ${teachingRole}.` : "Teaching role removed.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to change this teaching role."));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveMember(member: OrganizationMember) {
    if (!activeOrganization?.id || !window.confirm(`Remove ${member.email} from this organization?`)) return;
    setSaving(true);
    setStatus("");
    try {
      await removeOrganizationMember(activeOrganization.id, member.user_id);
      setMembers((current) => current.filter((item) => item.user_id !== member.user_id));
      setOrganizationPeople((current) => current.filter((item) => item.user_id !== member.user_id));
      setStatus("Member removed. Their PilotSeal account was not changed.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to remove this member."));
    } finally {
      setSaving(false);
    }
  }

  async function handleTransferOwnership(member: OrganizationMember) {
    if (!activeOrganization?.id || !window.confirm(`Transfer ownership to ${member.email}?`)) return;
    setSaving(true);
    setStatus("");
    try {
      await transferOrganizationOwnership(activeOrganization.id, member.user_id);
      await refreshOrganizations();
      setMembers(await fetchOrganizationMembers(activeOrganization.id));
      setStatus("Organization ownership transferred.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to transfer ownership."));
    } finally {
      setSaving(false);
    }
  }

  function updateAircraftField<K extends keyof AircraftForm>(key: K, value: AircraftForm[K]) {
    setAircraftError("");
    setAircraftForm((current) => ({ ...current, [key]: value }));
  }

  function startCreateAircraft() {
    setEditingAircraftId("");
    setAircraftForm(emptyAircraftForm);
    setAircraftError("");
    setShowAircraftForm(true);
  }

  function startEditAircraft(item: AircraftRecord) {
    setEditingAircraftId(item.id);
    setAircraftForm({
      model_id: item.model_id ?? "",
      tail_number: item.tail_number,
      empty_weight: item.empty_weight == null ? "" : String(item.empty_weight),
      empty_arm: item.empty_arm == null ? "" : String(item.empty_arm),
      empty_lat_arm: item.empty_lat_arm == null ? "" : String(item.empty_lat_arm),
      hundred_hour_due_hours:
        item.hundred_hour_due_hours == null ? "" : String(item.hundred_hour_due_hours),
      annual_due_date: item.annual_due_date ?? "",
      static_due_date: item.static_due_date ?? "",
      transponder_due_date: item.transponder_due_date ?? "",
      elt_due_date: item.elt_due_date ?? "",
      adsb_due_date: item.adsb_due_date ?? "",
      registration_due_date: item.registration_due_date ?? "",
      operational_status: item.operational_status ?? "available",
      operational_status_note: item.operational_status_note ?? "",
      current_meter_type: item.current_meter_type ?? "hobbs",
      current_meter_value: item.current_meter_value == null ? "" : String(item.current_meter_value),
      meter_observed_at: toDateTimeLocal(item.meter_observed_at),
      meter_change_reason: "",
    });
    setAircraftError("");
    setShowAircraftForm(true);
  }

  async function handleSaveAircraft(event: React.FormEvent) {
    event.preventDefault();
    if (!activeOrganization?.id) return;
    setSaving(true);
    setStatus("");
    setAircraftError("");
    try {
      const canEditIdentity = !editingAssignedAircraft;
      const normalizedTail = aircraftForm.tail_number.trim().toUpperCase();
      const selectedModel = models.find((model) => model.id === aircraftForm.model_id) ?? null;
      const emptyWeight = canEditIdentity
        ? requiredPositiveNumber(aircraftForm.empty_weight, "Basic empty weight")
        : editingAircraft?.empty_weight ?? 0;
      const emptyArm = canEditIdentity
        ? requiredNumber(aircraftForm.empty_arm, "Basic empty-weight arm")
        : editingAircraft?.empty_arm ?? 0;
      const emptyLatArm = canEditIdentity
        ? optionalNumber(aircraftForm.empty_lat_arm)
        : editingAircraft?.empty_lat_arm ?? null;

      if (canEditIdentity && !aircraftForm.model_id) {
        throw new Error("Choose an aircraft model.");
      }
      if (canEditIdentity && !normalizedTail) {
        throw new Error("Enter the registration or tail number.");
      }
      if (
        canEditIdentity &&
        aircraft.some(
          (item) =>
            item.id !== editingAircraftId &&
            item.tail_number.trim().toUpperCase() === normalizedTail
        )
      ) {
        throw new Error("This tail number is already in the organization fleet.");
      }
      if (
        canEditIdentity &&
        selectedModel?.max_weight != null &&
        emptyWeight > selectedModel.max_weight
      ) {
        throw new Error(
          `Basic empty weight cannot exceed this model's ${selectedModel.max_weight.toLocaleString()} lb maximum weight.`
        );
      }
      if (
        canEditIdentity &&
        selectedModel?.category?.toLowerCase() === "helicopter" &&
        emptyLatArm == null
      ) {
        throw new Error(
          "Enter the helicopter's empty-weight left/right distance. Use 0 if it is on the centerline."
        );
      }

      const hundredHourDue = optionalNonNegativeNumber(
        aircraftForm.hundred_hour_due_hours,
        "Next 100-hour due reading"
      );
      const statusNote = aircraftForm.operational_status_note.trim();
      if (aircraftForm.operational_status === "grounded" && statusNote.length < 3) {
        throw new Error("Enter why this aircraft is grounded.");
      }

      const maintenance: OrganizationAircraftMaintenanceInput = {
        hundred_hour_due_hours: hundredHourDue,
        annual_due_date: aircraftForm.annual_due_date || null,
        static_due_date: aircraftForm.static_due_date || null,
        transponder_due_date: aircraftForm.transponder_due_date || null,
        elt_due_date: aircraftForm.elt_due_date || null,
        adsb_due_date: aircraftForm.adsb_due_date || null,
        registration_due_date: aircraftForm.registration_due_date || null,
        operational_status: aircraftForm.operational_status,
        operational_status_note: statusNote || null,
      };
      const meterValue = optionalNonNegativeNumber(
        aircraftForm.current_meter_value,
        "Current meter reading"
      );
      const previousAircraft = aircraft.find((item) => item.id === editingAircraftId);
      const meterChanged =
        meterValue !== null &&
        (previousAircraft?.current_meter_value !== meterValue ||
          previousAircraft?.current_meter_type !== aircraftForm.current_meter_type);
      let meterCorrection = null;
      if (meterValue !== null && (!editingAircraftId || meterChanged)) {
        if (!aircraftForm.meter_observed_at) throw new Error("Meter observation time is required.");
        if (aircraftForm.meter_change_reason.trim().length < 3) {
          throw new Error("Enter a reason for the initial or corrected meter reading.");
        }
        const observedAt = new Date(aircraftForm.meter_observed_at);
        if (Number.isNaN(observedAt.getTime())) {
          throw new Error("Enter a valid meter observation time.");
        }
        if (observedAt.getTime() > Date.now() + 60_000) {
          throw new Error("Meter observation time cannot be in the future.");
        }
        meterCorrection = {
          meter_type: aircraftForm.current_meter_type,
          meter_value: meterValue,
          observed_at: observedAt.toISOString(),
          reason: aircraftForm.meter_change_reason,
        };
      }

      const wasEditing = Boolean(editingAircraftId);
      await saveOrganizationAircraftAtomic({
        organization_id: activeOrganization.id,
        aircraft_id: editingAircraftId || null,
        model_id: aircraftForm.model_id,
        tail_number: normalizedTail,
        empty_weight: emptyWeight,
        empty_arm: emptyArm,
        empty_lat_arm: emptyLatArm,
        maintenance,
        meter_correction: meterCorrection,
      });

      setAircraft(await fetchOrganizationAircraft(activeOrganization.id));
      setShowAircraftForm(false);
      setEditingAircraftId("");
      setAircraftForm(emptyAircraftForm);
      setStatus(wasEditing ? "Organization aircraft updated." : "Organization aircraft created.");
    } catch (error) {
      setAircraftError(getErrorMessage(error, "Unable to save this aircraft."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAircraft(item: AircraftRecord) {
    if (item.organization_access === "assigned") {
      setStatus("Assigned aircraft can only be unassigned by a Platform Super Admin.");
      return;
    }
    if (!activeOrganization?.id || !window.confirm(`Delete ${item.tail_number} from this organization?`)) return;
    setSaving(true);
    setStatus("");
    try {
      await deleteOrganizationAircraft(activeOrganization.id, item.id);
      setAircraft((current) => current.filter((aircraftItem) => aircraftItem.id !== item.id));
      setStatus("Organization aircraft deleted.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to delete this aircraft."));
    } finally {
      setSaving(false);
    }
  }

  function startCreateModel() {
    setEditingModelId("");
    setModelForm(emptyModelForm);
    setModelError("");
    setShowModelForm(true);
  }

  function startEditModel(model: AircraftModelRecord) {
    const stations = parseAircraftStations(model.stations);
    const envelopeSet = parseAircraftEnvelopeSet(model.envelope);
    setEditingModelId(model.id);
    setModelForm({
      name: model.name,
      category: model.category?.toLowerCase() === "helicopter" ? "helicopter" : "airplane",
      avg_fuel_burn_rate: model.avg_fuel_burn_rate == null ? "" : String(model.avg_fuel_burn_rate),
      max_weight: model.max_weight == null ? "" : String(model.max_weight),
      stations:
        stations.length > 0
          ? stations.map((station, index) => ({
              clientKey: `loading-location-${model.id}-${index}`,
              id: station.id,
              name: station.name,
              arm: String(station.arm),
              latArm: station.latArm == null ? "" : String(station.latArm),
              weightPerGallon:
                station.weightPerGallon == null ? "" : String(station.weightPerGallon),
              fixedWeight: station.fixedWeight == null ? "" : String(station.fixedWeight),
              maxWeight: station.maxWeight == null ? "" : String(station.maxWeight),
              inputType: station.inputType === "checkbox" ? "checkbox" : "number",
              crewRole:
                station.crewRole === "pilot" || station.crewRole === "copilot"
                  ? station.crewRole
                  : "",
            }))
          : emptyModelForm.stations,
      envelope:
        envelopeSet.normal.length > 0
          ? envelopeSet.normal.map((point, index) => ({
              clientKey: `limit-${model.id}-${index}`,
              cg: String(point.cg),
              weight: String(point.weight),
            }))
          : emptyModelForm.envelope,
      topView:
        envelopeSet.topView.length > 0
          ? envelopeSet.topView.map((point, index) => ({
              clientKey: `top-limit-${model.id}-${index}`,
              x: String(point.x),
              y: String(point.y),
            }))
          : emptyModelForm.topView,
      sideView:
        envelopeSet.sideView.length > 0
          ? envelopeSet.sideView.map((point, index) => ({
              clientKey: `side-limit-${model.id}-${index}`,
              x: String(point.x),
              y: String(point.y),
            }))
          : emptyModelForm.sideView,
    });
    setModelError("");
    setShowModelForm(true);
  }

  function updateLoadingLocation(
    clientKey: string,
    field: keyof LoadingLocationDraft,
    value: string
  ) {
    setModelError("");
    setModelForm((current) => ({
      ...current,
      stations: current.stations.map((station) =>
        station.clientKey === clientKey ? { ...station, [field]: value } : station
      ),
    }));
  }

  function updateWeightBalanceLimit(
    clientKey: string,
    field: keyof WeightBalanceLimitDraft,
    value: string
  ) {
    setModelError("");
    setModelForm((current) => ({
      ...current,
      envelope: current.envelope.map((point) =>
        point.clientKey === clientKey ? { ...point, [field]: value } : point
      ),
    }));
  }

  function updateHelicopterLimit(
    section: "topView" | "sideView",
    clientKey: string,
    field: "x" | "y",
    value: string
  ) {
    setModelError("");
    setModelForm((current) => ({
      ...current,
      [section]: current[section].map((point) =>
        point.clientKey === clientKey ? { ...point, [field]: value } : point
      ),
    }));
  }

  async function handleSaveModel(event: React.FormEvent) {
    event.preventDefault();
    if (!activeOrganization?.id) return;
    setSaving(true);
    setStatus("");
    setModelError("");
    try {
      const usedLocationIds = new Set<string>();
      const usedCrewRoles = new Set<string>();
      const stations = modelForm.stations
        .filter((station) => station.name.trim() || station.arm.trim())
        .map((station, index) => {
          if (!station.name.trim() || !station.arm.trim()) {
            throw new Error(`Complete the name and arm for loading location ${index + 1}.`);
          }
          const id = station.id.trim() || createLocationId(station.name, index);
          if (usedLocationIds.has(id.toLowerCase())) {
            throw new Error("Give each loading location a different name.");
          }
          usedLocationIds.add(id.toLowerCase());
          if (station.crewRole && usedCrewRoles.has(station.crewRole)) {
            throw new Error(`Only one location can be assigned as the ${station.crewRole === "pilot" ? "pilot" : "co-pilot"} seat.`);
          }
          if (station.crewRole) {
            usedCrewRoles.add(station.crewRole);
          }
          const latArm = optionalNumber(station.latArm);
          if (modelForm.category === "helicopter" && latArm == null) {
            throw new Error(`Enter the left/right distance for ${station.name.trim()}. Use 0 if it is on the centerline.`);
          }
          const fixedWeight = optionalNonNegativeNumber(
            station.fixedWeight,
            `${station.name.trim()} default or fixed weight`
          );
          if (station.inputType === "checkbox" && fixedWeight == null) {
            throw new Error(`Enter the included weight for ${station.name.trim()}.`);
          }
          return {
            id,
            name: station.name.trim(),
            arm: requiredNumber(station.arm, `${station.name || `Loading location ${index + 1}`} arm`),
            latArm,
            weightPerGallon:
              optionalPositiveNumber(
                station.weightPerGallon,
                `${station.name.trim()} fuel weight`
              ) ??
              (/fuel/i.test(station.name) ? 6 : null),
            fixedWeight,
            maxWeight: optionalNonNegativeNumber(
              station.maxWeight,
              `${station.name.trim()} maximum load`
            ),
            inputType: station.inputType,
            crewRole: station.crewRole || null,
          };
        });
      const airplaneEnvelope = modelForm.envelope
        .filter((point) => point.cg.trim() || point.weight.trim())
        .map((point, index) => ({
          cg: requiredNumber(point.cg, `Limit point ${index + 1} CG position`),
          weight: requiredPositiveNumber(
            point.weight,
            `Limit point ${index + 1} aircraft weight`
          ),
        }));
      if (stations.length < 1) {
        throw new Error("Add at least one seat, fuel tank, baggage area, or fixed item.");
      }
      const topView = modelForm.topView
        .filter((point) => point.x.trim() || point.y.trim())
        .map((point, index) => ({
          x: requiredNumber(point.x, `Top-view point ${index + 1} forward/aft CG`),
          y: requiredNumber(point.y, `Top-view point ${index + 1} left/right CG`),
        }));
      const sideView = modelForm.sideView
        .filter((point) => point.x.trim() || point.y.trim())
        .map((point, index) => ({
          x: requiredNumber(point.x, `Weight-limit point ${index + 1} forward/aft CG`),
          y: requiredPositiveNumber(
            point.y,
            `Weight-limit point ${index + 1} aircraft weight`
          ),
        }));
      if (modelForm.category === "helicopter" && topView.length < 3) {
        throw new Error("Add at least three complete top-view CG limit points.");
      }
      if (modelForm.category === "helicopter" && sideView.length > 0 && sideView.length < 3) {
        throw new Error("Add at least three complete weight limit points, or leave that section empty.");
      }
      if (modelForm.category === "airplane" && airplaneEnvelope.length < 3) {
        throw new Error("Add at least three complete weight-and-balance limit points.");
      }
      const envelope =
        modelForm.category === "helicopter"
          ? sideView.length > 0
            ? { top_view: topView, side_view: sideView }
            : { polygon: topView }
          : airplaneEnvelope;
      const input = {
        name: modelForm.name.trim(),
        category: modelForm.category,
        avg_fuel_burn_rate: optionalPositiveNumber(
          modelForm.avg_fuel_burn_rate,
          "Typical fuel use"
        ),
        max_weight: optionalPositiveNumber(
          modelForm.max_weight,
          "Maximum takeoff weight"
        ),
        stations,
        envelope,
      };
      if (!input.name || !input.category) throw new Error("Model name and category are required.");
      if (editingModelId) {
        await updateAircraftModel(editingModelId, input);
      } else {
        await createAircraftModel({ ...input, organization_id: activeOrganization.id });
      }
      setModels(await fetchAircraftModels(activeOrganization.id));
      setShowModelForm(false);
      setEditingModelId("");
      setStatus(editingModelId ? "Organization model updated." : "Organization model created.");
    } catch (error) {
      setModelError(getErrorMessage(error, "Unable to save this aircraft model."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteModel(model: AircraftModelRecord) {
    if (!activeOrganization?.id || model.organization_id !== activeOrganization.id) return;
    if (!window.confirm(`Delete organization model ${model.name}?`)) return;
    setSaving(true);
    setStatus("");
    try {
      await deleteAircraftModel(model.id);
      setModels((current) => current.filter((item) => item.id !== model.id));
      setStatus("Organization model deleted.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to delete this model. Remove aircraft using it first."));
    } finally {
      setSaving(false);
    }
  }

  function renderOrganizationPersonEditor(person: OrganizationPerson) {
    if (editingPersonId !== person.id) return null;
    return (
      <div className="mt-3 grid gap-3 rounded-xl border border-sky-200 bg-white p-3 md:grid-cols-2">
        <Field label="Organization name">
          <input className="rounded-xl border border-slate-300 px-3 py-2" value={personDraft.displayName} onChange={(event) => setPersonDraft((current) => ({ ...current, displayName: event.target.value }))} />
        </Field>
        <Field label="Teaching role">
          <select className="rounded-xl border border-slate-300 px-3 py-2" value={personDraft.teachingRole} onChange={(event) => setPersonDraft((current) => ({ ...current, teachingRole: event.target.value as OrganizationTeachingRole | "" }))}>
            <option value="">No teaching role</option>
            <option value="instructor">Instructor</option>
            <option value="student">Student</option>
          </select>
        </Field>
        <Field label="Internal ID">
          <input className="rounded-xl border border-slate-300 px-3 py-2" value={personDraft.internalId} onChange={(event) => setPersonDraft((current) => ({ ...current, internalId: event.target.value }))} maxLength={120} />
        </Field>
        <Field label="Organization notes">
          <textarea className="rounded-xl border border-slate-300 px-3 py-2" value={personDraft.notes} onChange={(event) => setPersonDraft((current) => ({ ...current, notes: event.target.value }))} rows={3} maxLength={2000} />
        </Field>
        <div className="flex gap-2 md:col-span-2">
          <button className="primary-button" type="button" disabled={saving} onClick={() => void handleSaveOrganizationPerson()}>{saving ? "Saving..." : "Save organization details"}</button>
          <button className="ghost-button" type="button" disabled={saving} onClick={() => setEditingPersonId("")}>Cancel</button>
        </div>
      </div>
    );
  }

  if (organizationsLoading || loading) return <div className="saas-panel">Loading organization...</div>;
  if (!activeOrganization) {
    return <div className="saas-panel">This account does not belong to an organization.</div>;
  }
  if (!canManage) {
    return <div className="saas-panel">Organization members can view the fleet from My Aircraft.</div>;
  }

  return (
    <div className="grid gap-5">
      <AdminPageHeader
        eyebrow={activeOrganization.name}
        title={organizationViewTitle(view)}
        description={organizationViewDescription(view)}
        action={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            {activeSectionKeys.length ? <AdminSectionControls expanded={hasOpenSection} onToggleAll={toggleAllSections} /> : null}
            <StatusBadge tone="info">{formatRole(role ?? "member")}</StatusBadge>
          </div>
        )}
      />
      {status ? <p role="status" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">{status}</p> : null}

      {view === "overview" ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewLink href="/dashboard/organization/people" label="People" value={members.length + pendingPeople.length} detail={`${pendingPeople.length} pending`} />
          <OverviewLink href="/dashboard/organization/fleet" label="Fleet & MX" value={aircraft.length} detail={`${models.length} available models`} />
          <OverviewLink href="/dashboard/organization/briefs" label="Preflight Records" value="Open" detail="Finalized student briefs" />
          <OverviewLink href="/dashboard/organization/endorsements" label="Endorsements" value="Review" detail="Organization change requests" />
        </section>
      ) : null}

      {view === "messages" ? (<AdminCollapsibleSection
        id="organization-message"
        title="Compose organization message"
        description="Send one notification to every current organization member."
        summary={`${members.length} recipients`}
        open={openSections.has("message")}
        onToggle={() => toggleSection("message")}
      >
        <form className="mt-5 grid gap-4" onSubmit={handleSendOrganizationMessage}>
          <label className="saas-field">
            <span>Title</span>
            <input value={messageTitle} onChange={(event) => setMessageTitle(event.target.value)} required />
          </label>
          <label className="saas-field">
            <span>Message</span>
            <textarea rows={4} value={messageBody} onChange={(event) => setMessageBody(event.target.value)} required />
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="saas-field sm:w-48">
              <span>Priority</span>
              <select value={messagePriority} onChange={(event) => setMessagePriority(event.target.value as NotificationPriority)}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>
            <button className="primary-button" type="submit" disabled={saving || !messageTitle.trim() || !messageBody.trim()}>
              {saving ? "Sending..." : "Send to organization"}
            </button>
          </div>
        </form>
      </AdminCollapsibleSection>) : null}

      {view === "fleet" && canManageFleet ? (<AdminCollapsibleSection
        id="aircraft-models"
        title="Aircraft models"
        description={`Organization-owned models plus the global models available to ${activeOrganization.name}.`}
        summary={`${models.filter((model) => model.organization_id === activeOrganization.id).length} organization · ${models.filter((model) => !model.organization_id).length} global`}
        open={openSections.has("models")}
        onToggle={() => toggleSection("models")}
      >
        <div className="people-toolbar">
          <p className="saas-meta-text">Only organization-owned models can be edited here. Global models remain read-only and available when adding aircraft.</p>
          <button className="secondary-button" type="button" onClick={startCreateModel}>Add model</button>
        </div>

        {showModelForm ? (
          <form className="mt-5 grid gap-6 rounded-2xl border border-slate-200 bg-white/80 p-4" onSubmit={handleSaveModel}>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{editingModelId ? "Edit aircraft model" : "Add an aircraft model"}</h3>
              <p className="saas-meta-text mt-1">Use the approved aircraft flight manual or weight-and-balance records.</p>
            </div>

            {modelError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
                <p className="font-semibold">Check the aircraft model information.</p>
                <p className="mt-1">{modelError}</p>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Aircraft model name">
                <input className="rounded-xl border border-slate-300 px-3 py-2" value={modelForm.name} onChange={(event) => { setModelError(""); setModelForm((current) => ({ ...current, name: event.target.value })); }} placeholder="e.g. Cessna 172S" required />
              </Field>
              <Field label="Aircraft type">
                <select className="rounded-xl border border-slate-300 px-3 py-2" value={modelForm.category} onChange={(event) => { setModelError(""); setModelForm((current) => ({ ...current, category: event.target.value as ModelForm["category"] })); }}>
                  <option value="airplane">Airplane</option>
                  <option value="helicopter">Helicopter</option>
                </select>
              </Field>
              <Field label="Typical fuel use (gallons per hour)">
                <input type="number" min="0" step="any" className="rounded-xl border border-slate-300 px-3 py-2" value={modelForm.avg_fuel_burn_rate} onChange={(event) => { setModelError(""); setModelForm((current) => ({ ...current, avg_fuel_burn_rate: event.target.value })); }} placeholder="e.g. 8.5" />
              </Field>
              <Field label="Maximum takeoff weight (lb, optional)">
                <input type="number" min="0" step="any" className="rounded-xl border border-slate-300 px-3 py-2" value={modelForm.max_weight} onChange={(event) => { setModelError(""); setModelForm((current) => ({ ...current, max_weight: event.target.value })); }} placeholder="e.g. 2400" />
              </Field>
            </div>

            <fieldset className="grid gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <legend className="text-sm font-semibold text-slate-900">Seats, fuel, baggage, and fixed equipment</legend>
                  <p className="saas-meta-text mt-1">Add every place where weight can be carried. “Arm” is the distance from the aircraft datum.</p>
                </div>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() =>
                    setModelForm((current) => ({
                      ...current,
                      stations: [
                        ...current.stations,
                        {
                          clientKey: crypto.randomUUID(),
                          id: "",
                          name: "",
                          arm: "",
                          latArm: "",
                          weightPerGallon: "",
                          fixedWeight: "",
                          maxWeight: "",
                          inputType: "number",
                          crewRole: "",
                        },
                      ],
                    }))
                  }
                >
                  Add another location
                </button>
              </div>
              {modelForm.stations.map((station, index) => (
                <div key={station.clientKey} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 md:grid-cols-2 xl:grid-cols-4">
                  <Field label={`Location ${index + 1} name`}>
                    <input className="rounded-xl border border-slate-300 px-3 py-2" value={station.name} onChange={(event) => updateLoadingLocation(station.clientKey, "name", event.target.value)} placeholder="e.g. Front seats or Main fuel" />
                  </Field>
                  <Field label="Distance from datum (in)">
                    <input type="number" step="any" className="rounded-xl border border-slate-300 px-3 py-2" value={station.arm} onChange={(event) => updateLoadingLocation(station.clientKey, "arm", event.target.value)} placeholder="e.g. 37" />
                  </Field>
                  <Field label="Maximum load (lb, optional)">
                    <input type="number" min="0" step="any" className="rounded-xl border border-slate-300 px-3 py-2" value={station.maxWeight} onChange={(event) => updateLoadingLocation(station.clientKey, "maxWeight", event.target.value)} />
                  </Field>
                  <Field label="Fuel weight (lb/gal, fuel only)">
                    <input type="number" min="0" step="any" className="rounded-xl border border-slate-300 px-3 py-2" value={station.weightPerGallon} onChange={(event) => updateLoadingLocation(station.clientKey, "weightPerGallon", event.target.value)} placeholder={/fuel/i.test(station.name) ? "6" : ""} />
                  </Field>
                  <details className="rounded-xl border border-slate-200 bg-white px-3 py-2 md:col-span-2 xl:col-span-4">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                      More options for this location
                    </summary>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <Field label="Left/right distance from centerline (in)">
                        <input type="number" step="any" className="rounded-xl border border-slate-300 px-3 py-2" value={station.latArm} onChange={(event) => updateLoadingLocation(station.clientKey, "latArm", event.target.value)} placeholder={modelForm.category === "helicopter" ? "Required for lateral CG" : "Optional"} />
                      </Field>
                      <Field label="Default or fixed weight (lb)">
                        <input type="number" min="0" step="any" className="rounded-xl border border-slate-300 px-3 py-2" value={station.fixedWeight} onChange={(event) => updateLoadingLocation(station.clientKey, "fixedWeight", event.target.value)} placeholder="Optional" />
                      </Field>
                      <Field label="How this load is selected">
                        <select className="rounded-xl border border-slate-300 px-3 py-2" value={station.inputType} onChange={(event) => updateLoadingLocation(station.clientKey, "inputType", event.target.value)}>
                          <option value="number">Enter a weight or quantity</option>
                          <option value="checkbox">Included / not included</option>
                        </select>
                      </Field>
                      <Field label="Crew seat assignment">
                        <select className="rounded-xl border border-slate-300 px-3 py-2" value={station.crewRole} onChange={(event) => updateLoadingLocation(station.clientKey, "crewRole", event.target.value)}>
                          <option value="">Not a crew seat</option>
                          <option value="pilot">Pilot seat</option>
                          <option value="copilot">Co-pilot seat</option>
                        </select>
                      </Field>
                    </div>
                  </details>
                  <button
                    className="danger-button-compact justify-self-start xl:col-span-4"
                    type="button"
                    disabled={modelForm.stations.length === 1}
                    onClick={() => setModelForm((current) => ({ ...current, stations: current.stations.filter((item) => item.clientKey !== station.clientKey) }))}
                  >
                    Remove this location
                  </button>
                </div>
              ))}
            </fieldset>

            {modelForm.category === "helicopter" ? (
              <div className="grid gap-6 xl:grid-cols-2">
                <HelicopterLimitsEditor
                  title="CG limits viewed from above"
                  description="Enter forward/aft and left/right CG boundary points from the approved chart."
                  xLabel="Forward/aft CG (in)"
                  yLabel="Left/right CG (in)"
                  points={modelForm.topView}
                  minimumPoints={3}
                  onAdd={() =>
                    setModelForm((current) => ({
                      ...current,
                      topView: [...current.topView, { clientKey: crypto.randomUUID(), x: "", y: "" }],
                    }))
                  }
                  onChange={(clientKey, field, value) =>
                    updateHelicopterLimit("topView", clientKey, field, value)
                  }
                  onRemove={(clientKey) =>
                    setModelForm((current) => ({
                      ...current,
                      topView: current.topView.filter((point) => point.clientKey !== clientKey),
                    }))
                  }
                />
                <HelicopterLimitsEditor
                  title="Weight limits viewed from the side"
                  description="Optional. Add the forward/aft CG and aircraft weight boundary if the flight manual provides it."
                  xLabel="Forward/aft CG (in)"
                  yLabel="Aircraft weight (lb)"
                  points={modelForm.sideView}
                  minimumPoints={0}
                  onAdd={() =>
                    setModelForm((current) => ({
                      ...current,
                      sideView: [...current.sideView, { clientKey: crypto.randomUUID(), x: "", y: "" }],
                    }))
                  }
                  onChange={(clientKey, field, value) =>
                    updateHelicopterLimit("sideView", clientKey, field, value)
                  }
                  onRemove={(clientKey) =>
                    setModelForm((current) => ({
                      ...current,
                      sideView: current.sideView.filter((point) => point.clientKey !== clientKey),
                    }))
                  }
                />
              </div>
            ) : (
              <fieldset className="grid gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <legend className="text-sm font-semibold text-slate-900">Approved weight-and-balance limits</legend>
                    <p className="saas-meta-text mt-1">Enter at least three points from the aircraft’s approved CG envelope.</p>
                  </div>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() =>
                      setModelForm((current) => ({
                        ...current,
                        envelope: [...current.envelope, { clientKey: crypto.randomUUID(), cg: "", weight: "" }],
                      }))
                    }
                  >
                    Add another limit point
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {modelForm.envelope.map((point, index) => (
                    <div key={point.clientKey} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Limit point {index + 1}</p>
                      <Field label="CG position (in)">
                        <input type="number" step="any" className="rounded-xl border border-slate-300 px-3 py-2" value={point.cg} onChange={(event) => updateWeightBalanceLimit(point.clientKey, "cg", event.target.value)} />
                      </Field>
                      <Field label="Aircraft weight (lb)">
                        <input type="number" min="0" step="any" className="rounded-xl border border-slate-300 px-3 py-2" value={point.weight} onChange={(event) => updateWeightBalanceLimit(point.clientKey, "weight", event.target.value)} />
                      </Field>
                      <button
                        className="danger-button-compact justify-self-start"
                        type="button"
                        disabled={modelForm.envelope.length <= 3}
                        onClick={() => setModelForm((current) => ({ ...current, envelope: current.envelope.filter((item) => item.clientKey !== point.clientKey) }))}
                      >
                        Remove point
                      </button>
                    </div>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="flex gap-2"><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving..." : editingModelId ? "Save changes" : "Add aircraft model"}</button><button className="ghost-button" type="button" onClick={() => setShowModelForm(false)}>Cancel</button></div>
          </form>
        ) : null}

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {models.filter((model) => model.organization_id === activeOrganization.id).map((model) => (
            <div key={model.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <p className="text-sm font-semibold text-slate-900">{model.name}</p>
              <p className="saas-meta-text">{model.category || "Uncategorized"}</p>
              <div className="mt-3 flex gap-2"><button className="ghost-button" type="button" onClick={() => startEditModel(model)}>Edit</button><button className="danger-button-compact" type="button" onClick={() => void handleDeleteModel(model)}>Delete</button></div>
            </div>
          ))}
        </div>
      </AdminCollapsibleSection>) : null}

      {view === "people" ? (<>
        <AdminCollapsibleSection
          id="add-organization-person"
          title="Add a person"
          description="Add by email; registered accounts link immediately and all others remain pending."
          summary="Email-based access"
          open={openSections.has("add-person")}
          onToggle={() => toggleSection("add-person")}
        >
        <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 md:grid-cols-2" onSubmit={handleAddMember}>
          <Field label="Email">
            <input
              type="email"
              className="rounded-xl border border-slate-300 px-3 py-2"
              value={memberEmail}
              onChange={(event) => setMemberEmail(event.target.value)}
              placeholder="Enter email"
              required
            />
          </Field>
          <Field label="Organization name">
            <input
              className="rounded-xl border border-slate-300 px-3 py-2"
              value={memberDisplayName}
              onChange={(event) => setMemberDisplayName(event.target.value)}
              placeholder="Optional organization display name"
            />
          </Field>
          <Field label="Teaching role">
            <select
              className="rounded-xl border border-slate-300 px-3 py-2"
              value={memberTeachingRole}
              onChange={(event) => setMemberTeachingRole(event.target.value as OrganizationTeachingRole | "")}
            >
              <option value="">No teaching role</option>
              <option value="instructor">Instructor</option>
              <option value="student">Student</option>
            </select>
          </Field>
          <Field label="Internal ID">
            <input
              className="rounded-xl border border-slate-300 px-3 py-2"
              value={memberInternalId}
              onChange={(event) => setMemberInternalId(event.target.value)}
              placeholder="Optional student or employee ID"
              maxLength={120}
            />
          </Field>
          <Field label="Organization notes">
            <textarea
              className="rounded-xl border border-slate-300 px-3 py-2"
              value={memberNotes}
              onChange={(event) => setMemberNotes(event.target.value)}
              placeholder="Visible only to authorized organization managers"
              rows={3}
              maxLength={2000}
            />
          </Field>
          <div className="flex items-end">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Adding..." : "Add person"}
            </button>
          </div>
        </form>
        </AdminCollapsibleSection>

        <AdminCollapsibleSection
          id="pending-organization-people"
          title="Pending accounts"
          description="People whose email has not yet linked to a verified PilotSeal account."
          summary={`${pendingPeople.length} pending`}
          open={openSections.has("pending-people")}
          onToggle={() => toggleSection("pending-people")}
        >
          {pendingPeople.length > 0 ? (
            <div className="grid gap-3">
              {pendingPeople.map((person) => (
                <div key={person.id} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{person.organization_display_name || person.email}</p>
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.68rem] font-semibold text-amber-800">Pending account</span>
                      </div>
                      <p className="saas-meta-text mt-1">{person.email}{person.teaching_role ? ` · ${formatTeachingRole(person.teaching_role)}` : ""}{person.internal_id ? ` · ID ${person.internal_id}` : ""}</p>
                      {person.notes ? <p className="saas-meta-text mt-2">{person.notes}</p> : null}
                    </div>
                    <div className="flex gap-2">
                      <button className="ghost-button" type="button" disabled={saving} onClick={() => startEditOrganizationPerson(person)}>Edit</button>
                      <button className="danger-button-compact" type="button" disabled={saving} onClick={() => void handleArchivePendingPerson(person)}>Remove</button>
                    </div>
                  </div>
                  {renderOrganizationPersonEditor(person)}
                </div>
              ))}
            </div>
          ) : <p className="saas-empty-state">No pending accounts.</p>}
        </AdminCollapsibleSection>

        <AdminCollapsibleSection
          id="linked-organization-members"
          title="Linked members"
          description="Manage organization roles, teaching roles, and member access."
          summary={`${members.length} linked`}
          open={openSections.has("linked-members")}
          onToggle={() => toggleSection("linked-members")}
        >
        <div className="grid gap-3">
          {members.map((member) => {
            const isOwner = member.member_role === "owner";
            const isSelf = member.user_id === session?.user?.id;
            const organizationPerson = peopleByUserId.get(member.user_id);
            const adminCanRemove = role === "organization_admin" && member.member_role === "member";
            const canRemove = !isOwner && !isSelf && (canManageAdmins || adminCanRemove);
            return (
              <div key={member.user_id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{member.display_name || member.email}</p>
                    <p className="saas-meta-text">{member.email} · {formatRole(member.member_role)}{member.teaching_role ? ` · ${formatTeachingRole(member.teaching_role)}` : ""}{organizationPerson?.internal_id ? ` · ID ${organizationPerson.internal_id}` : ""}</p>
                    {organizationPerson?.notes ? <p className="saas-meta-text mt-1">{organizationPerson.notes}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {organizationPerson ? (
                      <button className="ghost-button" type="button" disabled={saving} onClick={() => startEditOrganizationPerson(organizationPerson)}>Edit details</button>
                    ) : null}
                    <select
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      value={member.teaching_role ?? ""}
                      disabled={saving}
                      aria-label={`Teaching role for ${member.email}`}
                      onChange={(event) => void handleTeachingRoleChange(member, (event.target.value || null) as "instructor" | "student" | null)}
                    >
                      <option value="">No teaching role</option>
                      <option value="instructor">Instructor</option>
                      <option value="student">Student</option>
                    </select>
                    {canManageAdmins && !isOwner && !isSelf ? (
                      <button className="ghost-button" type="button" disabled={saving} onClick={() => void handleRoleChange(member)}>
                        {member.member_role === "organization_admin" ? "Make member" : "Make admin"}
                      </button>
                    ) : null}
                    {canManageAdmins && !isSelf && !isOwner ? (
                      <button className="ghost-button" type="button" disabled={saving} onClick={() => void handleTransferOwnership(member)}>
                        Transfer ownership
                      </button>
                    ) : null}
                    {canRemove ? (
                      <button className="danger-button-compact" type="button" disabled={saving} onClick={() => void handleRemoveMember(member)}>
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
                {organizationPerson ? renderOrganizationPersonEditor(organizationPerson) : null}
              </div>
            );
          })}
        </div>
        </AdminCollapsibleSection>
      </>) : null}

      {view === "fleet" && canManageFleet ? (<AdminCollapsibleSection
        id="organization-aircraft"
        title="Organization aircraft"
        description={`Aircraft available to members of ${activeOrganization.name}.`}
        summary={`${aircraft.length} aircraft · ${aircraft.filter((item) => item.organization_access === "assigned").length} assigned`}
        open={openSections.has("aircraft")}
        onToggle={() => toggleSection("aircraft")}
      >
        <div className="people-toolbar">
          <p className="saas-meta-text">Open an aircraft only when you need to edit its identity, status, meter, or maintenance limits.</p>
          <button className="secondary-button" type="button" onClick={startCreateAircraft}>Add aircraft</button>
        </div>

        {showAircraftForm ? (
          <form className="mt-5 grid gap-4 rounded-2xl border border-slate-200 bg-white/80 p-4 md:grid-cols-2" onSubmit={handleSaveAircraft}>
            <h3 className="text-sm font-semibold text-slate-900 md:col-span-2">
              {editingAssignedAircraft ? "Edit assigned aircraft MX" : editingAircraftId ? "Edit organization aircraft" : "New organization aircraft"}
            </h3>
            {editingAssignedAircraft ? (
              <p className="saas-meta-text md:col-span-2">
                This aircraft is assigned by a Platform Super Admin. Its model, tail number, empty weight, and arms are read-only; organization managers share one MX record.
              </p>
            ) : null}
            {aircraftError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 md:col-span-2" role="alert">
                <p className="font-semibold">The aircraft was not saved.</p>
                <p className="mt-1">{aircraftError}</p>
              </div>
            ) : null}

            <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
              <h4 className="text-sm font-semibold text-slate-900 md:col-span-2">Aircraft identity and empty weight</h4>
              <Field label="Aircraft model (required)">
                <select disabled={editingAssignedAircraft} className="rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100" value={aircraftForm.model_id} onChange={(event) => updateAircraftField("model_id", event.target.value)} required>
                  <option value="">Choose a model</option>
                  {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                </select>
              </Field>
              <Field label="Registration or tail number (required)">
                <input disabled={editingAssignedAircraft} className="rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100" value={aircraftForm.tail_number} onChange={(event) => updateAircraftField("tail_number", event.target.value.toUpperCase())} placeholder="e.g. N5520X" required />
              </Field>
              <Field label="Basic empty weight (lb, required)">
                <input disabled={editingAssignedAircraft} type="number" min="0" step="any" className="rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100" value={aircraftForm.empty_weight} onChange={(event) => updateAircraftField("empty_weight", event.target.value)} required />
              </Field>
              <Field label="Empty-weight distance from datum (in, required)">
                <input disabled={editingAssignedAircraft} type="number" step="any" className="rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100" value={aircraftForm.empty_arm} onChange={(event) => updateAircraftField("empty_arm", event.target.value)} required />
              </Field>
              <Field label="Empty-weight left/right distance (in)">
                <input disabled={editingAssignedAircraft} type="number" step="any" className="rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100" value={aircraftForm.empty_lat_arm} onChange={(event) => updateAircraftField("empty_lat_arm", event.target.value)} placeholder="Use 0 for the centerline" />
              </Field>
            </div>

            <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 md:col-span-2 md:grid-cols-2">
              <div className="md:col-span-2">
                <h4 className="text-sm font-semibold text-slate-900">Flight availability</h4>
                <p className="saas-meta-text mt-1">Grounded aircraft are marked “Do not dispatch” throughout the organization workflow.</p>
              </div>
              <Field label="Current aircraft status">
                <select className="rounded-xl border border-slate-300 px-3 py-2" value={aircraftForm.operational_status} onChange={(event) => updateAircraftField("operational_status", event.target.value as AircraftOperationalStatus)}>
                  <option value="available">Available for flight</option>
                  <option value="away">Away or temporarily unavailable</option>
                  <option value="in_maintenance">In maintenance</option>
                  <option value="grounded">Grounded — do not dispatch</option>
                </select>
              </Field>
              {aircraftForm.operational_status !== "available" ? (
                <Field label={aircraftForm.operational_status === "grounded" ? "Why is it grounded? (required)" : "Status note (optional)"}>
                  <input className="rounded-xl border border-slate-300 px-3 py-2" value={aircraftForm.operational_status_note} onChange={(event) => updateAircraftField("operational_status_note", event.target.value)} placeholder={aircraftForm.operational_status === "grounded" ? "Describe the discrepancy or maintenance restriction" : "Add context for members"} required={aircraftForm.operational_status === "grounded"} />
                </Field>
              ) : null}
            </div>

            <details className="rounded-xl border border-slate-200 bg-white p-4 md:col-span-2">
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">Meter reading used for maintenance tracking</summary>
              <p className="saas-meta-text mt-1">A changed reading requires an observation time and audit reason.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Meter type">
                  <select className="rounded-xl border border-slate-300 px-3 py-2" value={aircraftForm.current_meter_type} onChange={(event) => updateAircraftField("current_meter_type", event.target.value as AircraftMeterType)}>
                    <option value="hobbs">Hobbs meter</option>
                    <option value="tach">Tachometer time</option>
                  </select>
                </Field>
                <Field label="Current meter reading">
                  <input type="number" min="0" step="any" className="rounded-xl border border-slate-300 px-3 py-2" value={aircraftForm.current_meter_value} onChange={(event) => updateAircraftField("current_meter_value", event.target.value)} />
                </Field>
                <Field label="Reading observed at">
                  <input type="datetime-local" max={toDateTimeLocal(new Date().toISOString())} className="rounded-xl border border-slate-300 px-3 py-2" value={aircraftForm.meter_observed_at} onChange={(event) => updateAircraftField("meter_observed_at", event.target.value)} />
                </Field>
                <Field label="Why is this reading being entered?">
                  <input className="rounded-xl border border-slate-300 px-3 py-2" value={aircraftForm.meter_change_reason} onChange={(event) => updateAircraftField("meter_change_reason", event.target.value)} placeholder="Initial reading, instrument replacement, correction…" />
                </Field>
              </div>
            </details>

            <details className="rounded-xl border border-slate-200 bg-white p-4 md:col-span-2">
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">Inspection and registration due limits</summary>
              <p className="saas-meta-text mt-1">Leave a field blank when the organization does not track that limit here.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Next 100-hour inspection at meter reading">
                  <input type="number" min="0" step="any" className="rounded-xl border border-slate-300 px-3 py-2" value={aircraftForm.hundred_hour_due_hours} onChange={(event) => updateAircraftField("hundred_hour_due_hours", event.target.value)} />
                </Field>
                {(["annual_due_date", "static_due_date", "transponder_due_date", "elt_due_date", "adsb_due_date", "registration_due_date"] as const).map((key) => (
                  <Field key={key} label={formatDueLabel(key)}><input type="date" className="rounded-xl border border-slate-300 px-3 py-2" value={aircraftForm[key]} onChange={(event) => updateAircraftField(key, event.target.value)} /></Field>
                ))}
              </div>
            </details>
            <div className="flex gap-2 md:col-span-2">
              <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving..." : "Save aircraft"}</button>
              <button className="ghost-button" type="button" onClick={() => setShowAircraftForm(false)}>Cancel</button>
            </div>
          </form>
        ) : null}

        <div className="mt-5 grid gap-3">
          {aircraft.length === 0 ? <p className="saas-empty-state">No organization aircraft yet.</p> : aircraft.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.tail_number}</p>
                  <p className="saas-meta-text">{modelNames.get(item.model_id ?? "") ?? "Unknown model"} · {item.empty_weight ?? "--"} lbs · Arm {item.empty_arm ?? "--"}</p>
                  <p className="saas-meta-text mt-1">{item.organization_access === "assigned" ? "Assigned by Platform Super Admin" : "Owned by this organization"}</p>
                  <p className="saas-meta-text mt-1">{maintenanceSummary(item)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge tone={aircraftStatusTone(item.operational_status)}>
                      {formatOperationalStatus(item.operational_status)}
                    </StatusBadge>
                    <span className="saas-meta-text">
                      {item.current_meter_type ? `${item.current_meter_type.toUpperCase()} ${item.current_meter_value ?? "--"}` : "No meter saved"}
                    </span>
                  </div>
                  {item.operational_status_note ? (
                    <p className="mt-2 text-sm font-medium text-slate-700">
                      {item.operational_status_note}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button className="ghost-button" type="button" disabled={saving} onClick={() => startEditAircraft(item)}>{item.organization_access === "assigned" ? "Manage MX" : "Edit"}</button>
                  {item.organization_access !== "assigned" ? <button className="danger-button-compact" type="button" disabled={saving} onClick={() => void handleDeleteAircraft(item)}>Delete</button> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </AdminCollapsibleSection>) : null}

      {view === "fleet" && canManageFleet ? (
        <AdminCollapsibleSection
          id="custom-inspections"
          title="Additional maintenance requirements"
          description="Track Airworthiness Directives (ADs), recurring inspections, and their next due limits by aircraft."
          summary="Maintenance items and aircraft due limits"
          open={openSections.has("inspections")}
          onToggle={() => toggleSection("inspections")}
        >
          <OrganizationInspectionManager organizationId={activeOrganization.id} aircraft={aircraft} models={models} embedded />
        </AdminCollapsibleSection>
      ) : null}

      {view === "endorsements" ? (
        <AdminCollapsibleSection
          id="endorsement-change-requests"
          title="Template change requests"
          description="Propose endorsement wording changes for Platform Super Admin review."
          summary="Approval required"
          open={openSections.has("endorsements")}
          onToggle={() => toggleSection("endorsements")}
        >
          <OrganizationEndorsementRequests organizationId={activeOrganization.id} embedded />
        </AdminCollapsibleSection>
      ) : null}
    </div>
  );
}

function OverviewLink({ href, label, value, detail }: { href: string; label: string; value: string | number; detail: string }) {
  return <Link href={href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:border-blue-300 hover:shadow-md"><p className="text-sm font-semibold text-slate-600">{label}</p><p className="mt-4 text-2xl font-semibold text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p><p className="mt-4 text-sm font-semibold text-blue-700">View all →</p></Link>;
}

function organizationViewTitle(view: OrganizationManagerView) {
  return ({ overview: "Overview", people: "People", fleet: "Fleet & MX", messages: "Messages", endorsements: "Endorsements" })[view];
}

function organizationViewDescription(view: OrganizationManagerView) {
  return ({
    overview: "Key organization activity and shortcuts, without the previous all-in-one page.",
    people: "Manage the roster, account links, organization roles, and teaching roles.",
    fleet: "Manage organization aircraft, shared models, meter readings, and maintenance limits.",
    messages: "Send a notification to every current organization member.",
    endorsements: "Review and submit organization endorsement template changes.",
  })[view];
}

function organizationSectionKeys(view: OrganizationManagerView) {
  if (view === "fleet") return ["models", "aircraft", "inspections"];
  if (view === "people") return ["add-person", "pending-people", "linked-members"];
  if (view === "messages") return ["message"];
  if (view === "endorsements") return ["endorsements"];
  return [];
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm"><span>{label}</span>{children}</label>;
}

function HelicopterLimitsEditor({
  title,
  description,
  xLabel,
  yLabel,
  points,
  minimumPoints,
  onAdd,
  onChange,
  onRemove,
}: {
  title: string;
  description: string;
  xLabel: string;
  yLabel: string;
  points: HelicopterLimitDraft[];
  minimumPoints: number;
  onAdd: () => void;
  onChange: (clientKey: string, field: "x" | "y", value: string) => void;
  onRemove: (clientKey: string) => void;
}) {
  return (
    <fieldset className="grid content-start gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <legend className="text-sm font-semibold text-slate-900">{title}</legend>
          <p className="saas-meta-text mt-1">{description}</p>
        </div>
        <button className="ghost-button" type="button" onClick={onAdd}>
          Add limit point
        </button>
      </div>
      {points.map((point, index) => (
        <div key={point.clientKey} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 md:grid-cols-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">Limit point {index + 1}</p>
          <Field label={xLabel}>
            <input type="number" step="any" className="rounded-xl border border-slate-300 px-3 py-2" value={point.x} onChange={(event) => onChange(point.clientKey, "x", event.target.value)} />
          </Field>
          <Field label={yLabel}>
            <input type="number" step="any" className="rounded-xl border border-slate-300 px-3 py-2" value={point.y} onChange={(event) => onChange(point.clientKey, "y", event.target.value)} />
          </Field>
          <button
            className="danger-button-compact justify-self-start md:col-span-2"
            type="button"
            disabled={points.length <= minimumPoints}
            onClick={() => onRemove(point.clientKey)}
          >
            Remove point
          </button>
        </div>
      ))}
    </fieldset>
  );
}

function requiredNumber(value: string, label: string) {
  const result = Number.parseFloat(value);
  if (!Number.isFinite(result)) throw new Error(`${label} is required.`);
  return result;
}

function requiredPositiveNumber(value: string, label: string) {
  const result = requiredNumber(value, label);
  if (result <= 0) {
    throw new Error(`${label} must be greater than 0.`);
  }
  return result;
}

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const result = Number.parseFloat(value);
  if (!Number.isFinite(result)) throw new Error("Enter a valid number.");
  return result;
}

function optionalPositiveNumber(value: string, label: string) {
  const result = optionalNumber(value);
  if (result != null && result <= 0) {
    throw new Error(`${label} must be greater than 0.`);
  }
  return result;
}

function optionalNonNegativeNumber(value: string, label: string) {
  const result = optionalNumber(value);
  if (result != null && result < 0) {
    throw new Error(`${label} cannot be negative.`);
  }
  return result;
}

function createLocationId(name: string, index: number) {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || `location-${index + 1}`;
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatOperationalStatus(value?: AircraftOperationalStatus) {
  return {
    available: "Available for flight",
    away: "Away or unavailable",
    in_maintenance: "In maintenance",
    grounded: "Grounded — do not dispatch",
  }[value ?? "available"];
}

function aircraftStatusTone(
  value?: AircraftOperationalStatus
): "success" | "info" | "warning" | "danger" {
  if (value === "grounded") return "danger";
  if (value === "in_maintenance") return "warning";
  if (value === "away") return "info";
  return "success";
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return fallback;
}

function formatRole(role: string) {
  if (role === "platform_admin") return "Platform administrator";
  if (role === "organization_admin") return "Organization administrator";
  if (role === "owner") return "Owner";
  return "Member";
}

function formatTeachingRole(role: string) {
  return role === "instructor" ? "Instructor" : "Student";
}

function formatDueLabel(key: string) {
  return ({
    annual_due_date: "Annual inspection due",
    static_due_date: "Altimeter/static system inspection due (14 CFR 91.411)",
    transponder_due_date: "Transponder inspection due (14 CFR 91.413)",
    elt_due_date: "ELT inspection or battery due",
    adsb_due_date: "ADS-B check due",
    registration_due_date: "Aircraft registration expires",
  } as Record<string, string>)[key] ?? key;
}

function maintenanceSummary(item: AircraftRecord) {
  const values = [
    item.hundred_hour_due_hours == null ? "" : `100-hour ${item.hundred_hour_due_hours}`,
    item.annual_due_date ? `Annual ${item.annual_due_date}` : "",
    item.static_due_date ? `Static ${item.static_due_date}` : "",
    item.transponder_due_date ? `Transponder ${item.transponder_due_date}` : "",
    item.elt_due_date ? `ELT ${item.elt_due_date}` : "",
    item.adsb_due_date ? `ADS-B ${item.adsb_due_date}` : "",
    item.registration_due_date ? `Registration ${item.registration_due_date}` : "",
  ].filter(Boolean);
  return values.length ? values.join(" · ") : "No maintenance due dates recorded";
}
