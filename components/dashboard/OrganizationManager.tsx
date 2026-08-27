"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { UsDateInput, UsDateTimeInput } from "@/components/forms/UsDateInput";
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
  updateOrganizationAircraftStatus,
  updateAircraftModel,
  type AircraftChartType,
  type AircraftMeterType,
  type AircraftModelRecord,
  type AircraftOperationalStatus,
  type AircraftRecord,
  type AircraftStationKind,
  type OrganizationAircraftMaintenanceInput,
} from "@/lib/aircraft";
import {
  archivePendingOrganizationPerson,
  canManageOrganization,
  canManageOrganizationAdmins,
  createOrganizationMemberInvitation,
  fetchOrganizationMemberInvitations,
  fetchOrganizationMembers,
  fetchOrganizationPeople,
  leaveOrganization,
  removeOrganizationMember,
  revokeOrganizationMemberInvitation,
  setOrganizationMemberRole,
  setOrganizationMemberTeachingRole,
  transferOrganizationOwnership,
  updateOrganizationPerson,
  type OrganizationMember,
  type OrganizationMemberInvitation,
  type OrganizationPerson,
  type OrganizationTeachingRole,
} from "@/lib/organizations";
import OrganizationEndorsementRequests from "@/components/dashboard/OrganizationEndorsementRequests";
import {
  createOrganizationNotification,
  type NotificationPriority,
} from "@/lib/notifications";
import OrganizationInspectionManager from "@/components/dashboard/OrganizationInspectionManager";
import FleetReportsPanel from "@/components/dashboard/FleetReportsPanel";
import {
  AdminDataTable,
  CompactButton,
  CompactToolbar,
  ConfirmDialog,
  DetailDrawer,
  EmptyState,
  QuickEditPopover,
  StatusBadge,
  WorksheetCell,
  WorksheetGrid,
  WorksheetHeader,
  worksheetInputClass,
} from "@/components/admin/AdminConsole";
import { formatUsMonthYear } from "@/lib/date-format";

export type OrganizationManagerView = "overview" | "people" | "fleet" | "messages" | "endorsements";
type FleetWorkspace = "aircraft" | "records" | "models" | "inspections";
type MemberConfirmation =
  | { action: "role" | "remove" | "transfer"; member: OrganizationMember }
  | { action: "pending"; person: OrganizationPerson };

type LoadingLocationDraft = {
  clientKey: string;
  id: string;
  name: string;
  kind: AircraftStationKind;
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
  chart_type: AircraftChartType;
  singleEnvelopeView: "topView" | "sideView";
  avg_fuel_burn_rate: string;
  max_weight: string;
  stations: LoadingLocationDraft[];
  envelope: WeightBalanceLimitDraft[];
  utilityEnvelope: WeightBalanceLimitDraft[];
  topView: HelicopterLimitDraft[];
  sideView: HelicopterLimitDraft[];
};

function emptyLoadingLocation(
  clientKey = "new-loading-location-1",
  kind: AircraftStationKind = "seat"
): LoadingLocationDraft {
  return {
    clientKey,
    id: "",
    name: "",
    kind,
    arm: "",
    latArm: "",
    weightPerGallon: kind === "fuel" ? "6" : "",
    fixedWeight: "",
    maxWeight: "",
    inputType: "number",
    crewRole: "",
  };
}

function emptyWeightBalanceLimit(clientKey = "new-limit-1"): WeightBalanceLimitDraft {
  return { clientKey, cg: "", weight: "" };
}

function emptyHelicopterLimit(clientKey: string): HelicopterLimitDraft {
  return { clientKey, x: "", y: "" };
}

const emptyModelForm: ModelForm = {
  name: "",
  category: "airplane",
  chart_type: "1d1p",
  singleEnvelopeView: "topView",
  avg_fuel_burn_rate: "",
  max_weight: "",
  stations: [emptyLoadingLocation()],
  envelope: [emptyWeightBalanceLimit()],
  utilityEnvelope: [emptyWeightBalanceLimit("new-utility-limit-1")],
  topView: [emptyHelicopterLimit("new-top-limit-1")],
  sideView: [emptyHelicopterLimit("new-side-limit-1")],
};

function resolveModelChartType(
  chartType: AircraftModelRecord["chart_type"],
  envelopeSet: ReturnType<typeof parseAircraftEnvelopeSet>
): AircraftChartType {
  if (chartType === "1d1p" || chartType === "2d1p" || chartType === "2d2p") {
    return chartType;
  }
  if (envelopeSet.normal.length > 0) {
    return "1d1p";
  }
  if (envelopeSet.topView.length > 0 && envelopeSet.sideView.length > 0) {
    return "2d2p";
  }
  if (envelopeSet.topView.length > 0 || envelopeSet.sideView.length > 0) {
    return "2d1p";
  }
  return "1d1p";
}

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
  const [inviteLink, setInviteLink] = useState("");
  const [messageTitle, setMessageTitle] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [messagePriority, setMessagePriority] = useState<NotificationPriority>("normal");
  const [showMessageDrawer, setShowMessageDrawer] = useState(false);
  const [showAddPersonDrawer, setShowAddPersonDrawer] = useState(false);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [organizationPeople, setOrganizationPeople] = useState<OrganizationPerson[]>([]);
  const [memberInvitations, setMemberInvitations] = useState<OrganizationMemberInvitation[]>([]);
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
  const [fleetWorkspace, setFleetWorkspace] = useState<FleetWorkspace>("aircraft");
  const [statusEditorAircraftId, setStatusEditorAircraftId] = useState("");
  const [statusEditorValue, setStatusEditorValue] = useState<AircraftOperationalStatus>("available");
  const [statusEditorNote, setStatusEditorNote] = useState("");
  const [statusEditorError, setStatusEditorError] = useState("");
  const [memberConfirmation, setMemberConfirmation] = useState<MemberConfirmation | null>(null);

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
  const activeFleetWorkspace: FleetWorkspace = canManageFleet
    ? fleetWorkspace
    : "records";
  const editingAircraft = aircraft.find((item) => item.id === editingAircraftId) ?? null;
  const editingAssignedAircraft = editingAircraft?.organization_access === "assigned";

  async function loadOrganizationData() {
    if (!activeOrganization?.id) {
      setMembers([]);
      setOrganizationPeople([]);
      setMemberInvitations([]);
      setAircraft([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setStatus("");
    try {
      const [aircraftList, modelList, memberList, peopleList, invitationList] = await Promise.all([
        fetchOrganizationAircraft(activeOrganization.id),
        fetchAircraftModels(activeOrganization.id),
        canManage ? fetchOrganizationMembers(activeOrganization.id) : Promise.resolve([]),
        canManage ? fetchOrganizationPeople(activeOrganization.id) : Promise.resolve([]),
        canManage ? fetchOrganizationMemberInvitations(activeOrganization.id) : Promise.resolve([]),
      ]);
      setAircraft(aircraftList);
      setModels(modelList);
      setMembers(memberList);
      setOrganizationPeople(peopleList);
      setMemberInvitations(invitationList);
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
      const invitation = await createOrganizationMemberInvitation({
        organizationId: activeOrganization.id,
        email: memberEmail,
      });
      if (!invitation) throw new Error("Invitation could not be created.");
      const nextInviteLink = `${window.location.origin}/register?invite=${encodeURIComponent(invitation.invite_token)}&next=${encodeURIComponent("/dashboard/organization/overview")}`;
      setInviteLink(nextInviteLink);
      setMemberEmail("");
      const [nextMembers, nextPeople, nextInvitations] = await Promise.all([
        fetchOrganizationMembers(activeOrganization.id),
        fetchOrganizationPeople(activeOrganization.id),
        fetchOrganizationMemberInvitations(activeOrganization.id),
      ]);
      setMembers(nextMembers);
      setOrganizationPeople(nextPeople);
      setMemberInvitations(nextInvitations);
      setStatus("Invitation created. Copy the one-time link and send it to the invited email address.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to add this member."));
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerateInvitation(person: OrganizationPerson) {
    if (!activeOrganization?.id) return;
    setSaving(true);
    setStatus("");
    try {
      const invitation = await createOrganizationMemberInvitation({
        organizationId: activeOrganization.id,
        email: person.email,
      });
      if (!invitation) throw new Error("Invitation could not be created.");
      const link = `${window.location.origin}/register?invite=${encodeURIComponent(invitation.invite_token)}&next=${encodeURIComponent("/dashboard/organization/overview")}`;
      await navigator.clipboard.writeText(link);
      setMemberInvitations(await fetchOrganizationMemberInvitations(activeOrganization.id));
      setStatus(`A new invitation link for ${person.email} was copied. The previous link is now invalid.`);
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to create a new invitation link."));
    } finally {
      setSaving(false);
    }
  }

  async function handleRevokeInvitation(person: OrganizationPerson) {
    const invitation = memberInvitations.find((item) => item.organization_person_id === person.id && item.status === "pending");
    if (!invitation) return;
    setSaving(true);
    setStatus("");
    try {
      await revokeOrganizationMemberInvitation(invitation.id);
      await archivePendingOrganizationPerson(person.id);
      setOrganizationPeople((current) => current.filter((item) => item.id !== person.id));
      setMemberInvitations((current) => current.map((item) => item.id === invitation.id ? { ...item, status: "revoked" } : item));
      setStatus("Invitation revoked and pending roster entry removed.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to revoke this invitation."));
    } finally {
      setSaving(false);
    }
  }

  async function handleArchivePendingPerson(person: OrganizationPerson) {
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
      setShowMessageDrawer(false);
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
    if (!activeOrganization?.id) return;
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

  async function handleLeaveOrganization() {
    if (!activeOrganization?.id || role === "owner") return;
    const confirmed = window.confirm(
      `Leave ${activeOrganization.name}? Historical organization training records remain with the organization. New endorsements and flight briefs created after you leave will not be shared with it.`
    );
    if (!confirmed) return;
    setSaving(true);
    setStatus("");
    try {
      await leaveOrganization(activeOrganization.id, "Member self-service exit");
      await refreshOrganizations();
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to leave this organization."));
    } finally {
      setSaving(false);
    }
  }

  async function handleTransferOwnership(member: OrganizationMember) {
    if (!activeOrganization?.id) return;
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

  async function runMemberConfirmation() {
    const confirmation = memberConfirmation;
    if (!confirmation) return;
    if (confirmation.action === "pending") {
      await handleArchivePendingPerson(confirmation.person);
    } else if (confirmation.action === "role") {
      await handleRoleChange(confirmation.member);
    } else if (confirmation.action === "transfer") {
      await handleTransferOwnership(confirmation.member);
    } else {
      await handleRemoveMember(confirmation.member);
    }
    setMemberConfirmation(null);
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
      annual_due_date: toMonthInput(item.annual_due_date),
      static_due_date: toMonthInput(item.static_due_date),
      transponder_due_date: toMonthInput(item.transponder_due_date),
      elt_due_date: toMonthInput(item.elt_due_date),
      adsb_due_date: toMonthInput(item.adsb_due_date),
      registration_due_date: toMonthInput(item.registration_due_date),
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
        annual_due_date: monthEndDate(aircraftForm.annual_due_date),
        static_due_date: monthEndDate(aircraftForm.static_due_date),
        transponder_due_date: monthEndDate(aircraftForm.transponder_due_date),
        elt_due_date: monthEndDate(aircraftForm.elt_due_date),
        adsb_due_date: monthEndDate(aircraftForm.adsb_due_date),
        registration_due_date: monthEndDate(aircraftForm.registration_due_date),
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

  function setStatusEditorOpen(item: AircraftRecord, open: boolean) {
    if (!open) {
      setStatusEditorAircraftId("");
      setStatusEditorError("");
      return;
    }
    setStatusEditorAircraftId(item.id);
    setStatusEditorValue(item.operational_status ?? "available");
    setStatusEditorNote(item.operational_status_note ?? "");
    setStatusEditorError("");
  }

  async function handleQuickStatusSave(item: AircraftRecord) {
    if (!activeOrganization?.id) return;
    const note = statusEditorNote.trim();
    if (statusEditorValue === "grounded" && note.length < 3) {
      setStatusEditorError("Enter at least 3 characters explaining why this aircraft is grounded.");
      return;
    }
    setSaving(true);
    setStatusEditorError("");
    try {
      const result = await updateOrganizationAircraftStatus({
        organizationId: activeOrganization.id,
        aircraftId: item.id,
        operationalStatus: statusEditorValue,
        operationalStatusNote: note || null,
      });
      setAircraft((current) =>
        current.map((aircraftItem) =>
          aircraftItem.id === item.id
            ? {
                ...aircraftItem,
                operational_status: result.operational_status,
                operational_status_note: result.operational_status_note,
              }
            : aircraftItem
        )
      );
      setStatusEditorAircraftId("");
      setStatus(`Status updated for ${item.tail_number}.`);
    } catch (error) {
      setStatusEditorError(getErrorMessage(error, "Unable to update aircraft status."));
    } finally {
      setSaving(false);
    }
  }

  function startCreateModel() {
    setEditingModelId("");
    setModelForm({
      ...emptyModelForm,
      stations: [emptyLoadingLocation(crypto.randomUUID())],
      envelope: [emptyWeightBalanceLimit(crypto.randomUUID())],
      utilityEnvelope: [emptyWeightBalanceLimit(crypto.randomUUID())],
      topView: [emptyHelicopterLimit(crypto.randomUUID())],
      sideView: [emptyHelicopterLimit(crypto.randomUUID())],
    });
    setModelError("");
    setShowModelForm(true);
  }

  function startEditModel(model: AircraftModelRecord) {
    const stations = parseAircraftStations(model.stations);
    const envelopeSet = parseAircraftEnvelopeSet(model.envelope);
    const chartType = resolveModelChartType(model.chart_type, envelopeSet);
    setEditingModelId(model.id);
    setModelForm({
      name: model.name,
      category: model.category?.toLowerCase() === "helicopter" ? "helicopter" : "airplane",
      chart_type: chartType,
      singleEnvelopeView:
        envelopeSet.topView.length > 0 || envelopeSet.sideView.length === 0
          ? "topView"
          : "sideView",
      avg_fuel_burn_rate: model.avg_fuel_burn_rate == null ? "" : String(model.avg_fuel_burn_rate),
      max_weight: model.max_weight == null ? "" : String(model.max_weight),
      stations:
        stations.length > 0
          ? [
              ...stations.map<LoadingLocationDraft>((station, index) => ({
                clientKey: `loading-location-${model.id}-${index}`,
                id: station.id,
                name: station.name,
                kind: station.kind,
                arm: String(station.arm),
                latArm: station.latArm == null ? "" : String(station.latArm),
                weightPerGallon:
                  station.weightPerGallon == null ? "" : String(station.weightPerGallon),
                fixedWeight: station.fixedWeight == null ? "" : String(station.fixedWeight),
                maxWeight:
                  station.maxWeight == null
                    ? ""
                    : station.kind === "fuel" &&
                        typeof station.weightPerGallon === "number" &&
                        station.weightPerGallon > 0
                      ? String(station.maxWeight / station.weightPerGallon)
                      : String(station.maxWeight),
                inputType: station.inputType === "checkbox" ? "checkbox" : "number",
                crewRole:
                  station.crewRole === "pilot" || station.crewRole === "copilot"
                    ? station.crewRole
                    : "",
              })),
              ...Array.from(new Set(stations.map((station) => station.kind))).map(
                (kind) => emptyLoadingLocation(crypto.randomUUID(), kind)
              ),
            ]
          : [emptyLoadingLocation(crypto.randomUUID())],
      envelope:
        envelopeSet.normal.length > 0
          ? [
              ...envelopeSet.normal.map((point, index) => ({
                clientKey: `limit-${model.id}-${index}`,
                cg: String(point.cg),
                weight: String(point.weight),
              })),
              emptyWeightBalanceLimit(crypto.randomUUID()),
            ]
          : [emptyWeightBalanceLimit(crypto.randomUUID())],
      utilityEnvelope:
        envelopeSet.utility.length > 0
          ? [
              ...envelopeSet.utility.map((point, index) => ({
                clientKey: `utility-limit-${model.id}-${index}`,
                cg: String(point.cg),
                weight: String(point.weight),
              })),
              emptyWeightBalanceLimit(crypto.randomUUID()),
            ]
          : [emptyWeightBalanceLimit(crypto.randomUUID())],
      topView:
        envelopeSet.topView.length > 0
          ? [
              ...envelopeSet.topView.map((point, index) => ({
                clientKey: `top-limit-${model.id}-${index}`,
                x: String(point.x),
                y: String(point.y),
              })),
              emptyHelicopterLimit(crypto.randomUUID()),
            ]
          : [emptyHelicopterLimit(crypto.randomUUID())],
      sideView:
        envelopeSet.sideView.length > 0
          ? [
              ...envelopeSet.sideView.map((point, index) => ({
                clientKey: `side-limit-${model.id}-${index}`,
                x: String(point.x),
                y: String(point.y),
              })),
              emptyHelicopterLimit(crypto.randomUUID()),
            ]
          : [emptyHelicopterLimit(crypto.randomUUID())],
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
    setModelForm((current) => {
      const stations = current.stations.map((station) =>
        station.clientKey === clientKey ? { ...station, [field]: value } : station
      );
      const changedIndex = stations.findIndex((station) => station.clientKey === clientKey);
      const changedStation = stations[changedIndex];
      if (
        changedStation &&
        hasLoadingLocationValue(changedStation) &&
        !stations.some(
          (station, index) =>
            index !== changedIndex &&
            station.kind === changedStation.kind &&
            !hasLoadingLocationValue(station)
        )
      ) {
        stations.push(
          emptyLoadingLocation(crypto.randomUUID(), changedStation.kind)
        );
      }
      return { ...current, stations };
    });
  }

  function updateWeightBalanceLimit(
    section: "envelope" | "utilityEnvelope",
    clientKey: string,
    field: keyof WeightBalanceLimitDraft,
    value: string
  ) {
    setModelError("");
    setModelForm((current) => {
      const envelope = current[section].map((point) =>
        point.clientKey === clientKey ? { ...point, [field]: value } : point
      );
      const changedIndex = envelope.findIndex((point) => point.clientKey === clientKey);
      if (
        changedIndex === envelope.length - 1 &&
        hasWeightBalanceLimitValue(envelope[changedIndex])
      ) {
        envelope.push(emptyWeightBalanceLimit(crypto.randomUUID()));
      }
      return { ...current, [section]: envelope };
    });
  }

  function updateHelicopterLimit(
    section: "topView" | "sideView",
    clientKey: string,
    field: "x" | "y",
    value: string
  ) {
    setModelError("");
    setModelForm((current) => {
      const points = current[section].map((point) =>
        point.clientKey === clientKey ? { ...point, [field]: value } : point
      );
      const changedIndex = points.findIndex((point) => point.clientKey === clientKey);
      if (
        changedIndex === points.length - 1 &&
        hasHelicopterLimitValue(points[changedIndex])
      ) {
        points.push(emptyHelicopterLimit(crypto.randomUUID()));
      }
      return { ...current, [section]: points };
    });
  }

  function trimTrailingModelRows(
    section: "stations" | "envelope" | "utilityEnvelope" | "topView" | "sideView"
  ) {
    window.requestAnimationFrame(() => {
      setModelForm((current) => {
        if (section === "stations") {
          return {
            ...current,
            stations: keepOneBlankLoadingLocationPerKind(current.stations),
          };
        }
        if (section === "envelope" || section === "utilityEnvelope") {
          return {
            ...current,
            [section]: keepOneTrailingBlank(
              current[section],
              hasWeightBalanceLimitValue
            ),
          };
        }
        return {
          ...current,
          [section]: keepOneTrailingBlank(
            current[section],
            hasHelicopterLimitValue
          ),
        };
      });
    });
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
        .filter(hasLoadingLocationValue)
        .map((station, index) => {
          if (!station.name.trim() || !station.arm.trim()) {
            throw new Error(`Complete the name and arm for loading location ${index + 1}.`);
          }
          const id = station.id.trim() || createLocationId(station.name, index);
          if (usedLocationIds.has(id.toLowerCase())) {
            throw new Error("Give each loading location a different name.");
          }
          usedLocationIds.add(id.toLowerCase());
          if (
            station.kind === "seat" &&
            station.crewRole &&
            usedCrewRoles.has(station.crewRole)
          ) {
            throw new Error(`Only one location can be assigned as the ${station.crewRole === "pilot" ? "pilot" : "co-pilot"} seat.`);
          }
          if (station.kind === "seat" && station.crewRole) {
            usedCrewRoles.add(station.crewRole);
          }
          const latArm = optionalNumber(station.latArm);
          if (modelForm.category === "helicopter" && latArm == null) {
            throw new Error(`Enter the left/right distance for ${station.name.trim()}. Use 0 if it is on the centerline.`);
          }
          const fuelDensity =
            station.kind === "fuel"
              ? requiredPositiveNumber(
                  station.weightPerGallon,
                  `${station.name.trim()} fuel density`
                )
              : null;
          const fixedWeight =
            station.kind === "equipment"
              ? requiredPositiveNumber(
                  station.fixedWeight,
                  `${station.name.trim()} equipment weight`
                )
              : null;
          const enteredLimit = optionalNonNegativeNumber(
            station.maxWeight,
            station.kind === "fuel"
              ? `${station.name.trim()} capacity`
              : `${station.name.trim()} maximum load`
          );
          return {
            id,
            name: station.name.trim(),
            kind: station.kind,
            arm: requiredNumber(station.arm, `${station.name || `Loading location ${index + 1}`} arm`),
            latArm,
            weightPerGallon: fuelDensity,
            fixedWeight,
            maxWeight:
              station.kind === "equipment"
                ? null
                : station.kind === "fuel" &&
                    enteredLimit != null &&
                    fuelDensity != null
                  ? enteredLimit * fuelDensity
                  : enteredLimit,
            inputType:
              station.kind === "equipment"
                ? station.inputType
                : "number",
            crewRole:
              station.kind === "seat" ? station.crewRole || null : null,
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
      const utilityEnvelope = modelForm.utilityEnvelope
        .filter((point) => point.cg.trim() || point.weight.trim())
        .map((point, index) => ({
          cg: requiredNumber(point.cg, `Utility point ${index + 1} CG position`),
          weight: requiredPositiveNumber(
            point.weight,
            `Utility point ${index + 1} aircraft weight`
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
      if (modelForm.chart_type === "1d1p" && airplaneEnvelope.length < 3) {
        throw new Error("Add at least three complete Normal envelope points.");
      }
      if (
        modelForm.chart_type === "1d1p" &&
        modelForm.category === "airplane" &&
        utilityEnvelope.length > 0 &&
        utilityEnvelope.length < 3
      ) {
        throw new Error("Add at least three complete Utility points, or leave Utility empty.");
      }
      if (modelForm.chart_type === "2d1p") {
        const singleEnvelope =
          modelForm.singleEnvelopeView === "topView" ? topView : sideView;
        if (singleEnvelope.length < 3) {
          throw new Error("Add at least three complete points to the selected envelope.");
        }
      }
      if (modelForm.chart_type === "2d2p" && topView.length < 3) {
        throw new Error("Add at least three complete top-view CG points.");
      }
      if (modelForm.chart_type === "2d2p" && sideView.length < 3) {
        throw new Error("Add at least three complete side-view weight points.");
      }
      const envelope = {
        normal: modelForm.chart_type === "1d1p" ? airplaneEnvelope : [],
        utility:
          modelForm.chart_type === "1d1p" && modelForm.category === "airplane"
            ? utilityEnvelope
            : [],
        top_view:
          modelForm.chart_type === "2d2p" ||
          (modelForm.chart_type === "2d1p" && modelForm.singleEnvelopeView === "topView")
            ? topView
            : [],
        side_view:
          modelForm.chart_type === "2d2p" ||
          (modelForm.chart_type === "2d1p" && modelForm.singleEnvelopeView === "sideView")
            ? sideView
            : [],
      };
      const input = {
        name: modelForm.name.trim(),
        category: modelForm.category,
        chart_type: modelForm.chart_type,
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
  if (!canManage && view !== "fleet" && view !== "overview") {
    return (
      <div className="saas-panel">
        This organization page is available to organization managers.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {status ? <p role="status" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">{status}</p> : null}

      {view === "fleet" ? (
        <nav
          aria-label="Fleet workspace"
          className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-[0_6px_20px_rgba(15,23,42,0.04)]"
        >
          {(canManageFleet
            ? [
                ["aircraft", "Aircraft"],
                ["records", "Aircraft Records"],
                ["models", "Models"],
                ["inspections", "Maintenance items"],
              ]
            : [["records", "Aircraft Records"]]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`min-h-8 shrink-0 cursor-pointer rounded-lg px-3 text-xs font-semibold transition-colors ${
                activeFleetWorkspace === key
                  ? "bg-blue-700 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }`}
              aria-current={activeFleetWorkspace === key ? "page" : undefined}
              onClick={() => setFleetWorkspace(key as FleetWorkspace)}
            >
              {label}
            </button>
          ))}
        </nav>
      ) : null}

      {view === "overview" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {canManage ? <OverviewLink href="/dashboard/organization/people" label="People" value={members.length + pendingPeople.length} detail={`${pendingPeople.length} pending`} /> : null}
            <OverviewLink href="/dashboard/organization/fleet" label="Aircraft & Maintenance" value={aircraft.length} detail={`${models.length} aircraft models`} />
            <OverviewLink href="/dashboard/organization/reports" label="Safety Reports" value="Submit" detail="Aircraft discrepancy or ASR" />
            <OverviewLink href="/dashboard/organization/briefs" label="Preflight Records" value="Open" detail="Finalized student briefs" />
            {canManage ? <OverviewLink href="/dashboard/organization/endorsements" label="Endorsements" value="Review" detail="Organization change requests" /> : null}
          </section>
          {role !== "owner" ? (
            <section className="rounded-xl border border-rose-200 bg-white p-3">
              <h3 className="text-sm font-semibold text-slate-950">Organization membership</h3>
              <p className="mt-1 text-xs text-slate-600">Leaving freezes historical organization training records. Records created afterward stay outside this organization.</p>
              <button type="button" className="danger-button mt-3" disabled={saving} onClick={() => void handleLeaveOrganization()}>
                Leave organization
              </button>
            </section>
          ) : null}
        </>
      ) : null}

      {view === "messages" ? (
        <>
          <AdminDataTable label="Organization messages">
            <thead>
              <tr>
                <th colSpan={3} className="p-0 font-normal">
                  <CompactToolbar
                    resultLabel={`${members.length} recipients`}
                    actions={<CompactButton type="button" tone="primary" onClick={() => setShowMessageDrawer(true)}>New message</CompactButton>}
                  />
                </th>
              </tr>
              <tr className="border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700">
                <th className="px-3 py-2">Audience</th>
                <th className="px-3 py-2">Delivery</th>
                <th className="px-3 py-2">Purpose</th>
              </tr>
            </thead>
            <tbody><tr><td className="px-3 py-2 font-semibold text-slate-950">All current members</td><td className="px-3 py-2 text-xs text-slate-600">PilotSeal notifications</td><td className="px-3 py-2 text-xs text-slate-600">Operational announcements and urgent notices</td></tr></tbody>
          </AdminDataTable>
          <DetailDrawer open={showMessageDrawer} onClose={() => setShowMessageDrawer(false)} title="New organization message" description={`Send one notification to ${members.length} current member${members.length === 1 ? "" : "s"}.`}>
            <form onSubmit={handleSendOrganizationMessage}>
              <WorksheetGrid label="Organization message details">
                <thead><tr><WorksheetHeader>Title</WorksheetHeader><WorksheetHeader>Priority</WorksheetHeader></tr></thead>
                <tbody><tr>
                  <WorksheetCell><input autoFocus required aria-label="Message title" value={messageTitle} onChange={(event) => setMessageTitle(event.target.value)} className={worksheetInputClass} /></WorksheetCell>
                  <WorksheetCell><select aria-label="Message priority" value={messagePriority} onChange={(event) => setMessagePriority(event.target.value as NotificationPriority)} className={worksheetInputClass}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></WorksheetCell>
                </tr></tbody>
              </WorksheetGrid>
              <label className="mt-3 grid gap-1 text-xs font-semibold text-slate-700">Message<textarea required rows={5} value={messageBody} onChange={(event) => setMessageBody(event.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm font-normal" /></label>
              <div className="mt-4 flex justify-end gap-2"><CompactButton type="button" onClick={() => setShowMessageDrawer(false)}>Cancel</CompactButton><CompactButton type="submit" tone="primary" disabled={saving || !messageTitle.trim() || !messageBody.trim()}>{saving ? "Sending…" : "Send message"}</CompactButton></div>
            </form>
          </DetailDrawer>
        </>
      ) : null}

      {view === "fleet" && activeFleetWorkspace === "records" ? (
        <FleetWorkspacePanel
          title="Aircraft records"
          description="Preview or print maintenance planning and weight-and-balance records."
          summary="2 printable record layouts"
        >
          <FleetReportsPanel
            aircraft={aircraft}
            models={models}
            organizationId={activeOrganization.id}
            organizationName={activeOrganization.name}
          />
        </FleetWorkspacePanel>
      ) : null}

      {view === "fleet" && canManageFleet && activeFleetWorkspace === "models" ? (<FleetWorkspacePanel
        title="Aircraft models"
        description={`Organization-owned models plus the global models available to ${activeOrganization.name}.`}
        summary={`${models.filter((model) => model.organization_id === activeOrganization.id).length} organization · ${models.filter((model) => !model.organization_id).length} global`}
      >
        <div className="mb-2 flex justify-end">
          <button className="cursor-pointer rounded-md border border-blue-600 bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" type="button" onClick={startCreateModel}>Add model</button>
        </div>

        <DetailDrawer
          open={showModelForm}
          width="wide"
          title={editingModelId ? `Edit ${modelForm.name}` : "Add aircraft model"}
          description="Model details, loading locations, and approved CG limits."
          onClose={() => setShowModelForm(false)}
        >
          <form
            className="overflow-hidden border border-slate-300 bg-white shadow-sm"
            onSubmit={handleSaveModel}
          >
            {modelError ? (
              <div className="border-b border-rose-300 bg-rose-50 px-3 py-1.5 text-xs text-rose-800" role="alert">
                <span className="font-semibold">Check this row: </span>
                {modelError}
              </div>
            ) : null}

            <div className="max-w-full overflow-x-auto" data-edit-grid>
              <table className="w-full min-w-[820px] border-collapse text-left text-xs">
                <thead className="bg-blue-100 font-semibold text-slate-800">
                  <tr>
                    <GridHeader className="min-w-52">Model</GridHeader>
                    <GridHeader className="w-32">Type</GridHeader>
                    <GridHeader className="w-56" title="How the approved CG limits are plotted">
                      Envelope layout
                    </GridHeader>
                    <GridHeader className="w-36" title="Typical fuel use in gallons per hour">
                      Fuel burn (gph)
                    </GridHeader>
                    <GridHeader className="w-40" last title="Maximum takeoff weight">
                      Max takeoff (lb)
                    </GridHeader>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <GridCell>
                      <GridTextInput
                        ariaLabel="Aircraft model name"
                        placeholder="Cessna 172S"
                        value={modelForm.name}
                        onChange={(value) => {
                          setModelError("");
                          setModelForm((current) => ({ ...current, name: value }));
                        }}
                      />
                    </GridCell>
                    <GridCell>
                      <GridSelect
                        ariaLabel="Aircraft type"
                        value={modelForm.category}
                        onChange={(value) => {
                          setModelError("");
                          setModelForm((current) => ({
                            ...current,
                            category: value as ModelForm["category"],
                          }));
                        }}
                      >
                        <option value="airplane">Airplane</option>
                        <option value="helicopter">Helicopter</option>
                      </GridSelect>
                    </GridCell>
                    <GridCell>
                      <GridSelect
                        ariaLabel="Envelope layout"
                        value={modelForm.chart_type}
                        onChange={(value) => {
                          setModelError("");
                          setModelForm((current) => ({
                            ...current,
                            chart_type: value as AircraftChartType,
                          }));
                        }}
                      >
                        <option value="1d1p">CG and weight</option>
                        <option value="2d1p">One 2-axis envelope</option>
                        <option value="2d2p">Top and side envelopes</option>
                      </GridSelect>
                    </GridCell>
                    <GridCell>
                      <GridNumberInput
                        ariaLabel="Typical fuel use in gallons per hour"
                        min={0}
                        placeholder="8.5"
                        value={modelForm.avg_fuel_burn_rate}
                        onChange={(value) => {
                          setModelError("");
                          setModelForm((current) => ({
                            ...current,
                            avg_fuel_burn_rate: value,
                          }));
                        }}
                      />
                    </GridCell>
                    <td className="border-t border-slate-300 p-0">
                      <GridNumberInput
                        ariaLabel="Maximum takeoff weight in pounds"
                        min={0}
                        placeholder="2400"
                        value={modelForm.max_weight}
                        onChange={(value) => {
                          setModelError("");
                          setModelForm((current) => ({
                            ...current,
                            max_weight: value,
                          }));
                        }}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <LoadingLocationsGrid
              category={modelForm.category}
              rows={modelForm.stations}
              onChange={updateLoadingLocation}
              onBlur={() => trimTrailingModelRows("stations")}
              onAdd={(kind) =>
                setModelForm((current) => ({
                  ...current,
                  stations: [
                    ...current.stations,
                    emptyLoadingLocation(crypto.randomUUID(), kind),
                  ],
                }))
              }
              onRemove={(clientKey) =>
                setModelForm((current) => ({
                  ...current,
                  stations: current.stations.filter(
                    (item) => item.clientKey !== clientKey
                  ),
                }))
              }
            />

            {modelForm.chart_type === "1d1p" ? (
              <div className={`grid border-t border-slate-300 ${
                modelForm.category === "airplane"
                  ? "xl:grid-cols-2 xl:divide-x xl:divide-slate-300"
                  : ""
              }`}>
                <WeightBalanceLimitsGrid
                  title="Normal boundary"
                  description="Solid line · minimum 3 points"
                  rows={modelForm.envelope}
                  onChange={(clientKey, field, value) =>
                    updateWeightBalanceLimit("envelope", clientKey, field, value)
                  }
                  onBlur={() => trimTrailingModelRows("envelope")}
                  onRemove={(clientKey) =>
                    setModelForm((current) => ({
                      ...current,
                      envelope: ensureWeightBalanceLimitRow(
                        current.envelope.filter((item) => item.clientKey !== clientKey)
                      ),
                    }))
                  }
                />
                {modelForm.category === "airplane" ? (
                  <WeightBalanceLimitsGrid
                    title="Utility boundary"
                    description="Dashed overlay · optional"
                    rows={modelForm.utilityEnvelope}
                    onChange={(clientKey, field, value) =>
                      updateWeightBalanceLimit("utilityEnvelope", clientKey, field, value)
                    }
                    onBlur={() => trimTrailingModelRows("utilityEnvelope")}
                    onRemove={(clientKey) =>
                      setModelForm((current) => ({
                        ...current,
                        utilityEnvelope: ensureWeightBalanceLimitRow(
                          current.utilityEnvelope.filter(
                            (item) => item.clientKey !== clientKey
                          )
                        ),
                      }))
                    }
                  />
                ) : null}
              </div>
            ) : modelForm.chart_type === "2d2p" ? (
              <div className="grid border-t border-slate-300 xl:grid-cols-2 xl:divide-x xl:divide-slate-300">
                <HelicopterLimitsEditor
                  title="CG envelope — top view"
                  description="Minimum 3 points"
                  xLabel="Fwd/aft CG (in)"
                  yLabel="Left/right CG (in)"
                  points={modelForm.topView}
                  onChange={(clientKey, field, value) =>
                    updateHelicopterLimit("topView", clientKey, field, value)
                  }
                  onBlur={() => trimTrailingModelRows("topView")}
                  onRemove={(clientKey) =>
                    setModelForm((current) => ({
                      ...current,
                      topView: ensureHelicopterLimitRow(
                        current.topView.filter((point) => point.clientKey !== clientKey)
                      ),
                    }))
                  }
                />
                <HelicopterLimitsEditor
                  title="CG envelope — side view"
                  description="Minimum 3 points"
                  xLabel="Fwd/aft CG (in)"
                  yLabel="Weight (lb)"
                  points={modelForm.sideView}
                  onChange={(clientKey, field, value) =>
                    updateHelicopterLimit("sideView", clientKey, field, value)
                  }
                  onBlur={() => trimTrailingModelRows("sideView")}
                  onRemove={(clientKey) =>
                    setModelForm((current) => ({
                      ...current,
                      sideView: ensureHelicopterLimitRow(
                        current.sideView.filter((point) => point.clientKey !== clientKey)
                      ),
                    }))
                  }
                />
              </div>
            ) : (
              <div className="border-t border-slate-300 bg-slate-50">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 px-2 py-1">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-800">
                    Single 2-axis envelope
                  </p>
                  <label className="flex items-center gap-2 text-[10px] font-medium text-slate-600">
                    Plot
                    <select
                      className="h-7 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800"
                      value={modelForm.singleEnvelopeView}
                      onChange={(event) =>
                        setModelForm((current) => ({
                          ...current,
                          singleEnvelopeView: event.target.value as ModelForm["singleEnvelopeView"],
                        }))
                      }
                    >
                      <option value="topView">Forward/aft + left/right CG</option>
                      <option value="sideView">Forward/aft CG + weight</option>
                    </select>
                  </label>
                </div>
                <HelicopterLimitsEditor
                  title={
                    modelForm.singleEnvelopeView === "topView"
                      ? "CG envelope — top view"
                      : "CG envelope — side view"
                  }
                  description="Minimum 3 points"
                  xLabel="Fwd/aft CG (in)"
                  yLabel={
                    modelForm.singleEnvelopeView === "topView"
                      ? "Left/right CG (in)"
                      : "Weight (lb)"
                  }
                  points={modelForm[modelForm.singleEnvelopeView]}
                  onChange={(clientKey, field, value) =>
                    updateHelicopterLimit(
                      modelForm.singleEnvelopeView,
                      clientKey,
                      field,
                      value
                    )
                  }
                  onBlur={() => trimTrailingModelRows(modelForm.singleEnvelopeView)}
                  onRemove={(clientKey) =>
                    setModelForm((current) => ({
                      ...current,
                      [current.singleEnvelopeView]: ensureHelicopterLimitRow(
                        current[current.singleEnvelopeView].filter(
                          (point) => point.clientKey !== clientKey
                        )
                      ),
                    }))
                  }
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-slate-300 bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">
                A blank row is added automatically as you type.
              </p>
              <div className="flex gap-2">
                <button
                  className="cursor-pointer rounded border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  type="button"
                  onClick={() => setShowModelForm(false)}
                >
                  Cancel
                </button>
                <button
                  className="cursor-pointer rounded bg-blue-700 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save model"}
                </button>
              </div>
            </div>
          </form>
        </DetailDrawer>

        <div>
          <AdminDataTable label="Aircraft models">
            <thead className="bg-slate-100 text-xs font-semibold text-slate-700">
              <tr>
                <th className="border-b border-slate-200 px-3 py-2">Model</th>
                <th className="border-b border-slate-200 px-3 py-2">Type</th>
                <th className="border-b border-slate-200 px-3 py-2">Envelope</th>
                <th className="border-b border-slate-200 px-3 py-2">Fuel burn</th>
                <th className="border-b border-slate-200 px-3 py-2">Max weight</th>
                <th className="border-b border-slate-200 px-3 py-2">Source</th>
                <th className="border-b border-slate-200 px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => {
                const organizationOwned = model.organization_id === activeOrganization.id;
                return (
                  <tr key={model.id} className="hover:bg-blue-50/40">
                    <td className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-900">{model.name}</td>
                    <td className="border-b border-slate-100 px-3 py-2 text-xs capitalize text-slate-700">{model.category || "—"}</td>
                    <td className="border-b border-slate-100 px-3 py-2 text-xs text-slate-700">{formatChartType(model.chart_type)}</td>
                    <td className="border-b border-slate-100 px-3 py-2 text-xs tabular-nums text-slate-700">{model.avg_fuel_burn_rate == null ? "—" : `${model.avg_fuel_burn_rate} gph`}</td>
                    <td className="border-b border-slate-100 px-3 py-2 text-xs tabular-nums text-slate-700">{model.max_weight == null ? "—" : `${model.max_weight.toLocaleString()} lb`}</td>
                    <td className="border-b border-slate-100 px-3 py-2 text-xs text-slate-600">{organizationOwned ? "Organization" : "Global"}</td>
                    <td className="border-b border-slate-100 px-3 py-1.5">
                      {organizationOwned ? (
                        <div className="flex justify-end gap-1">
                          <button className="cursor-pointer rounded px-2 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50" type="button" onClick={() => startEditModel(model)}>Edit</button>
                          <button className="cursor-pointer rounded px-2 py-1 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50" type="button" onClick={() => void handleDeleteModel(model)}>Delete</button>
                        </div>
                      ) : <span className="block text-right text-xs text-slate-400">Read only</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </AdminDataTable>
        </div>
      </FleetWorkspacePanel>) : null}

      {view === "people" ? (
        <>
          <AdminDataTable label="Linked organization members">
            <thead>
              <tr><th colSpan={7} className="p-0 font-normal"><CompactToolbar resultLabel={`${members.length} linked · ${pendingPeople.length} pending`} actions={<CompactButton type="button" tone="primary" onClick={() => { setInviteLink(""); setShowAddPersonDrawer(true); }}>Invite by email</CompactButton>} /></th></tr>
              <tr className="border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700">
                <th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Access</th><th className="px-3 py-2">Teaching role</th><th className="px-3 py-2">Internal ID</th><th className="px-3 py-2">Notes</th><th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((member) => {
                const isOwner = member.member_role === "owner";
                const isSelf = member.user_id === session?.user?.id;
                const organizationPerson = peopleByUserId.get(member.user_id);
                const adminCanRemove = role === "organization_admin" && member.member_role === "member";
                const canRemove = !isOwner && !isSelf && (canManageAdmins || adminCanRemove);
                return (
                  <tr key={member.user_id} className="hover:bg-blue-50/40">
                    <td className="px-3 py-2 font-semibold text-slate-950">{member.display_name || member.email}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{member.email}</td>
                    <td className="px-3 py-2"><StatusBadge tone={isOwner ? "info" : member.member_role === "organization_admin" ? "warning" : "neutral"}>{formatRole(member.member_role)}</StatusBadge></td>
                    <td className="px-3 py-2"><select className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs" value={member.teaching_role ?? ""} disabled={saving} aria-label={`Teaching role for ${member.email}`} onChange={(event) => void handleTeachingRoleChange(member, (event.target.value || null) as "instructor" | "student" | null)}><option value="">None</option><option value="instructor">Instructor</option><option value="student">Student</option></select></td>
                    <td className="px-3 py-2 text-xs text-slate-600">{organizationPerson?.internal_id || "—"}</td>
                    <td className="max-w-52 truncate px-3 py-2 text-xs text-slate-600" title={organizationPerson?.notes ?? ""}>{organizationPerson?.notes || "—"}</td>
                    <td className="px-3 py-2"><div className="flex justify-end gap-1">
                      {organizationPerson ? <CompactButton type="button" disabled={saving} onClick={() => startEditOrganizationPerson(organizationPerson)}>Edit</CompactButton> : null}
                      {canManageAdmins && !isOwner && !isSelf ? <CompactButton type="button" disabled={saving} onClick={() => setMemberConfirmation({ action: "role", member })}>{member.member_role === "organization_admin" ? "Make member" : "Make admin"}</CompactButton> : null}
                      {canManageAdmins && !isSelf && !isOwner ? <CompactButton type="button" disabled={saving} onClick={() => setMemberConfirmation({ action: "transfer", member })}>Transfer owner</CompactButton> : null}
                      {canRemove ? <CompactButton type="button" tone="danger" disabled={saving} onClick={() => setMemberConfirmation({ action: "remove", member })}>Remove</CompactButton> : null}
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </AdminDataTable>

          <AdminDataTable label="Pending organization invitations">
            <thead className="bg-slate-100 text-xs font-semibold text-slate-700"><tr><th className="px-3 py-2">Email</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {!pendingPeople.length ? <tr><td colSpan={3}><EmptyState title="No pending invitations" description="Unregistered email invitations will appear here." /></td></tr> : null}
              {pendingPeople.map((person) => (
                <tr key={person.id} className="hover:bg-amber-50/50">
                  <td className="px-3 py-2 font-semibold text-slate-950">{person.email}</td>
                  <td className="px-3 py-2"><StatusBadge tone="warning">Awaiting registration</StatusBadge></td>
                  <td className="px-3 py-2"><div className="flex justify-end gap-1"><CompactButton type="button" disabled={saving} onClick={() => void handleRegenerateInvitation(person)}>New link</CompactButton><CompactButton type="button" tone="danger" disabled={saving} onClick={() => void handleRevokeInvitation(person)}>Revoke</CompactButton></div></td>
                </tr>
              ))}
            </tbody>
          </AdminDataTable>

          <DetailDrawer open={showAddPersonDrawer} onClose={() => setShowAddPersonDrawer(false)} title="Invite organization member" description="The recipient must use the one-time link and verify the invited email before membership is created.">
            {inviteLink ? (
              <div className="grid gap-3">
                <label className="grid gap-1 text-xs font-semibold text-slate-700">One-time registration link<textarea readOnly rows={4} value={inviteLink} className="rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 font-mono text-xs font-normal" /></label>
                <p className="text-xs text-slate-600">This link expires in 14 days. Creating a new link for the same email invalidates this one.</p>
                <div className="flex justify-end gap-2"><CompactButton type="button" onClick={() => setShowAddPersonDrawer(false)}>Done</CompactButton><CompactButton type="button" tone="primary" onClick={() => void navigator.clipboard.writeText(inviteLink)}>Copy link</CompactButton></div>
              </div>
            ) : <form className="grid gap-4" onSubmit={handleAddMember}>
              <label className="grid gap-1 text-xs font-semibold text-slate-700">Email<input autoFocus required type="email" aria-label="Email" value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-950" placeholder="person@example.com" /></label>
              <p className="text-xs text-slate-600">The member can be assigned a name, teaching role, internal ID, and organization notes after joining.</p>
              <div className="mt-4 flex justify-end gap-2"><CompactButton type="button" onClick={() => setShowAddPersonDrawer(false)}>Cancel</CompactButton><CompactButton type="submit" tone="primary" disabled={saving}>{saving ? "Creating…" : "Create invitation"}</CompactButton></div>
            </form>}
          </DetailDrawer>
          <DetailDrawer open={Boolean(editingPersonId)} onClose={() => setEditingPersonId("")} title="Edit organization person" description="These details are organization-only and do not change the personal account.">
            {editingPersonId ? renderOrganizationPersonEditor(organizationPeople.find((person) => person.id === editingPersonId) ?? ({ id: editingPersonId } as OrganizationPerson)) : null}
          </DetailDrawer>
          <ConfirmDialog
            open={Boolean(memberConfirmation)}
            title={memberConfirmationTitle(memberConfirmation)}
            description={memberConfirmationDescription(memberConfirmation)}
            confirmLabel={memberConfirmationLabel(memberConfirmation)}
            destructive={memberConfirmation?.action === "remove" || memberConfirmation?.action === "pending"}
            busy={saving}
            onCancel={() => setMemberConfirmation(null)}
            onConfirm={() => void runMemberConfirmation()}
          />
        </>
      ) : null}

      {view === "fleet" && canManageFleet && activeFleetWorkspace === "aircraft" ? (<FleetWorkspacePanel
        title="Organization aircraft"
        description={`Aircraft available to members of ${activeOrganization.name}.`}
        summary={`${aircraft.length} aircraft · ${aircraft.filter((item) => item.organization_access === "assigned").length} assigned`}
      >
        <div className="mb-2 flex justify-end">
          <button className="cursor-pointer rounded-md border border-blue-600 bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" type="button" onClick={startCreateAircraft}>Add aircraft</button>
        </div>

        <DetailDrawer
          open={showAircraftForm}
          width="wide"
          title={editingAssignedAircraft ? "Aircraft maintenance" : editingAircraftId ? `Edit ${aircraftForm.tail_number}` : "Add aircraft"}
          description="Edit the aircraft record as a compact worksheet. Blank due dates are not tracked."
          onClose={() => setShowAircraftForm(false)}
        >
          <form className="grid gap-4" onSubmit={handleSaveAircraft}>
            {editingAssignedAircraft ? (
              <p className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                Identity and empty-weight values are controlled by the platform assignment. Maintenance fields remain editable.
              </p>
            ) : null}
            {aircraftError ? (
              <div className="border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert">
                <span className="font-semibold">Aircraft not saved: </span>{aircraftError}
              </div>
            ) : null}

            <AircraftWorksheet title="Aircraft identity">
              <table className="w-full min-w-[780px] border-collapse text-left text-xs">
                <thead className="bg-blue-100 font-semibold text-slate-800">
                  <tr>
                    <GridHeader className="min-w-52">Model</GridHeader>
                    <GridHeader className="w-36">Tail number</GridHeader>
                    <GridHeader className="w-36">Empty weight (lb)</GridHeader>
                    <GridHeader className="w-36">Long. arm (in)</GridHeader>
                    <GridHeader className="w-36" last>Lat. arm (in)</GridHeader>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <GridCell>
                      <select disabled={editingAssignedAircraft} aria-label="Aircraft model" className={`${gridControlClass} cursor-pointer disabled:bg-slate-100`} value={aircraftForm.model_id} onChange={(event) => updateAircraftField("model_id", event.target.value)} required>
                        <option value="">Choose a model</option>
                        {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                      </select>
                    </GridCell>
                    <GridCell><AircraftWorksheetInput ariaLabel="Tail number" disabled={editingAssignedAircraft} value={aircraftForm.tail_number} onChange={(value) => updateAircraftField("tail_number", value.toUpperCase())} placeholder="N5520X" required /></GridCell>
                    <GridCell><AircraftWorksheetInput ariaLabel="Basic empty weight in pounds" disabled={editingAssignedAircraft} type="number" min={0} value={aircraftForm.empty_weight} onChange={(value) => updateAircraftField("empty_weight", value)} required /></GridCell>
                    <GridCell><AircraftWorksheetInput ariaLabel="Empty weight longitudinal arm" disabled={editingAssignedAircraft} type="number" value={aircraftForm.empty_arm} onChange={(value) => updateAircraftField("empty_arm", value)} required /></GridCell>
                    <td className="border-t border-slate-200 p-0"><AircraftWorksheetInput ariaLabel="Empty weight lateral arm" disabled={editingAssignedAircraft} type="number" value={aircraftForm.empty_lat_arm} onChange={(value) => updateAircraftField("empty_lat_arm", value)} placeholder="0 = centerline" /></td>
                  </tr>
                </tbody>
              </table>
            </AircraftWorksheet>

            <AircraftWorksheet title="Status and meter">
              <table className="w-full min-w-[860px] border-collapse text-left text-xs">
                <thead className="bg-slate-100 font-semibold text-slate-700">
                  <tr>
                    <GridHeader className="w-36">Flight status</GridHeader>
                    <GridHeader className="min-w-52">Status note</GridHeader>
                    <GridHeader className="w-24">Meter</GridHeader>
                    <GridHeader className="w-24">Reading</GridHeader>
                    <GridHeader className="w-40">Observed at</GridHeader>
                    <GridHeader className="min-w-44" last>Change reason</GridHeader>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <GridCell>
                      <select aria-label="Current aircraft status" className={`${gridControlClass} cursor-pointer`} value={aircraftForm.operational_status} onChange={(event) => updateAircraftField("operational_status", event.target.value as AircraftOperationalStatus)}>
                        <option value="available">Available</option>
                        <option value="away">Away</option>
                        <option value="in_maintenance">In maintenance</option>
                        <option value="grounded">Grounded — no dispatch</option>
                      </select>
                    </GridCell>
                    <GridCell><AircraftWorksheetInput ariaLabel="Aircraft status note" value={aircraftForm.operational_status_note} onChange={(value) => updateAircraftField("operational_status_note", value)} placeholder={aircraftForm.operational_status === "grounded" ? "Grounding reason required" : "Optional"} required={aircraftForm.operational_status === "grounded"} /></GridCell>
                    <GridCell>
                      <select aria-label="Meter type" className={`${gridControlClass} cursor-pointer`} value={aircraftForm.current_meter_type} onChange={(event) => updateAircraftField("current_meter_type", event.target.value as AircraftMeterType)}>
                        <option value="hobbs">Hobbs</option>
                        <option value="tach">Tach</option>
                      </select>
                    </GridCell>
                    <GridCell><AircraftWorksheetInput ariaLabel="Current meter reading" type="number" min={0} value={aircraftForm.current_meter_value} onChange={(value) => updateAircraftField("current_meter_value", value)} /></GridCell>
                    <GridCell><UsDateTimeInput aria-label="Meter reading observed at" className={gridControlClass} max={toDateTimeLocal(new Date().toISOString())} value={aircraftForm.meter_observed_at} onChange={(value) => updateAircraftField("meter_observed_at", value)} /></GridCell>
                    <td className="border-t border-slate-200 p-0"><AircraftWorksheetInput ariaLabel="Meter change reason" value={aircraftForm.meter_change_reason} onChange={(value) => updateAircraftField("meter_change_reason", value)} placeholder="Required when reading changes" /></td>
                  </tr>
                </tbody>
              </table>
            </AircraftWorksheet>

            <AircraftWorksheet title="Inspection and registration due">
              <table className="w-full min-w-[840px] border-collapse text-left text-xs">
                <thead className="bg-amber-100 font-semibold text-slate-800">
                  <tr>
                    <GridHeader className="w-28">100-hour</GridHeader>
                    <GridHeader className="w-28">Annual</GridHeader>
                    <GridHeader className="w-28">Pitot/static</GridHeader>
                    <GridHeader className="w-28">Transponder</GridHeader>
                    <GridHeader className="w-28">ELT</GridHeader>
                    <GridHeader className="w-28">ADS-B</GridHeader>
                    <GridHeader className="w-28" last>Registration</GridHeader>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <GridCell><AircraftWorksheetInput ariaLabel="Next 100-hour inspection meter reading" type="number" min={0} value={aircraftForm.hundred_hour_due_hours} onChange={(value) => updateAircraftField("hundred_hour_due_hours", value)} /></GridCell>
                    {(["annual_due_date", "static_due_date", "transponder_due_date", "elt_due_date", "adsb_due_date"] as const).map((key) => (
                      <GridCell key={key}><UsDateInput precision="month" aria-label={`${formatDueLabel(key)} MM/YYYY`} className={gridControlClass} value={aircraftForm[key]} onChange={(value) => updateAircraftField(key, value)} /></GridCell>
                    ))}
                    <td className="border-t border-slate-200 p-0"><UsDateInput precision="month" aria-label={`${formatDueLabel("registration_due_date")} MM/YYYY`} className={gridControlClass} value={aircraftForm.registration_due_date} onChange={(value) => updateAircraftField("registration_due_date", value)} /></td>
                  </tr>
                </tbody>
              </table>
            </AircraftWorksheet>

            <div className="sticky -bottom-5 flex justify-end gap-2 border-t border-slate-200 bg-white/95 px-1 py-3 backdrop-blur">
              <button className="ghost-button" type="button" onClick={() => setShowAircraftForm(false)}>Cancel</button>
              <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving..." : "Save aircraft"}</button>
            </div>
          </form>
        </DetailDrawer>

        {aircraft.length === 0 ? (
          <p className="saas-empty-state mt-5">No organization aircraft yet.</p>
        ) : (
          <div className="mt-5">
            <AdminDataTable label="Organization aircraft">
              <thead className="bg-slate-100 text-xs font-semibold text-slate-700">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2">Tail</th>
                  <th className="border-b border-slate-200 px-3 py-2">Model</th>
                  <th className="border-b border-slate-200 px-3 py-2">Status</th>
                  <th className="border-b border-slate-200 px-3 py-2">Meter</th>
                  <th className="border-b border-slate-200 px-3 py-2">100-hour</th>
                  <th className="border-b border-slate-200 px-3 py-2">Annual</th>
                  <th className="border-b border-slate-200 px-3 py-2">Registration</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {aircraft.map((item) => (
                  <tr key={item.id} className="bg-white transition-colors hover:bg-blue-50/40">
                    <td className="px-3 py-2 font-semibold text-slate-950">{item.tail_number}</td>
                    <td className="px-3 py-2 text-slate-700">{modelNames.get(item.model_id ?? "") ?? "Unknown"}</td>
                    <td className="px-3 py-2">
                      <QuickEditPopover
                        open={statusEditorAircraftId === item.id}
                        onOpenChange={(open) => setStatusEditorOpen(item, open)}
                        label={`Change ${item.tail_number} status`}
                        trigger={(
                          <button
                            type="button"
                            className="cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                            aria-haspopup="dialog"
                            aria-expanded={statusEditorAircraftId === item.id}
                            title="Change aircraft status"
                          >
                            <StatusBadge tone={aircraftStatusTone(item.operational_status)}>
                              {formatOperationalStatus(item.operational_status)}
                              <span aria-hidden="true">⌄</span>
                            </StatusBadge>
                          </button>
                        )}
                      >
                        <label className="grid gap-1 text-xs font-semibold text-slate-700">
                          Status
                          <select
                            value={statusEditorValue}
                            onChange={(event) => {
                              setStatusEditorValue(event.target.value as AircraftOperationalStatus);
                              setStatusEditorError("");
                            }}
                            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-normal text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                          >
                            <option value="available">Available</option>
                            <option value="away">Away</option>
                            <option value="in_maintenance">In maintenance</option>
                            <option value="grounded">Grounded</option>
                          </select>
                        </label>
                        <label className="mt-2 grid gap-1 text-xs font-semibold text-slate-700">
                          Note {statusEditorValue === "grounded" ? "(required)" : "(optional)"}
                          <textarea
                            rows={3}
                            value={statusEditorNote}
                            onChange={(event) => {
                              setStatusEditorNote(event.target.value);
                              setStatusEditorError("");
                            }}
                            placeholder={statusEditorValue === "grounded" ? "Why is this aircraft grounded?" : "Keep or update the current note"}
                            className="resize-y rounded-md border border-slate-300 px-2 py-1.5 text-sm font-normal text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                          />
                        </label>
                        {statusEditorError ? <p role="alert" className="mt-2 text-xs text-rose-700">{statusEditorError}</p> : null}
                        <div className="mt-3 flex justify-end gap-2">
                          <CompactButton type="button" onClick={() => setStatusEditorOpen(item, false)}>Cancel</CompactButton>
                          <CompactButton
                            type="button"
                            tone="primary"
                            disabled={saving || (statusEditorValue === "grounded" && statusEditorNote.trim().length < 3)}
                            onClick={() => void handleQuickStatusSave(item)}
                          >
                            {saving ? "Saving…" : "Apply"}
                          </CompactButton>
                        </div>
                      </QuickEditPopover>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-slate-700">{item.current_meter_type ? `${item.current_meter_type.toUpperCase()} ${item.current_meter_value ?? "—"}` : "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-slate-700">{item.hundred_hour_due_hours ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-slate-700">{formatFleetDate(item.annual_due_date)}</td>
                    <td className="px-3 py-2 text-xs text-slate-700">{formatFleetDate(item.registration_due_date)}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <button className="ghost-button" type="button" disabled={saving} onClick={() => startEditAircraft(item)}>{item.organization_access === "assigned" ? "Maintenance" : "Edit"}</button>
                        {item.organization_access !== "assigned" ? <button className="danger-button-compact" type="button" disabled={saving} onClick={() => void handleDeleteAircraft(item)}>Delete</button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </AdminDataTable>
          </div>
        )}
      </FleetWorkspacePanel>) : null}

      {view === "fleet" && canManageFleet && activeFleetWorkspace === "inspections" ? (
        <FleetWorkspacePanel
          title="Additional maintenance requirements"
          description="Track Airworthiness Directives (ADs), recurring inspections, and their next due limits by aircraft."
          summary="Maintenance items and aircraft due limits"
        >
          <OrganizationInspectionManager organizationId={activeOrganization.id} aircraft={aircraft} models={models} embedded />
        </FleetWorkspacePanel>
      ) : null}

      {view === "endorsements" ? (
        <OrganizationEndorsementRequests organizationId={activeOrganization.id} embedded />
      ) : null}
    </div>
  );
}

function OverviewLink({ href, label, value, detail }: { href: string; label: string; value: string | number; detail: string }) {
  return <Link href={href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:border-blue-300 hover:shadow-md"><p className="text-sm font-semibold text-slate-600">{label}</p><p className="mt-4 text-2xl font-semibold text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p><p className="mt-4 text-sm font-semibold text-blue-700">View all →</p></Link>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm"><span>{label}</span>{children}</label>;
}

function FleetWorkspacePanel({
  title,
  description,
  summary,
  children,
}: {
  title: string;
  description: string;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5 sm:px-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
          <p className="mt-0.5 text-xs leading-4 text-slate-500">{description}</p>
        </div>
        <p className="text-xs font-semibold text-slate-500">{summary}</p>
      </header>
      <div className="bg-slate-50/35 p-2.5 sm:p-3">{children}</div>
    </section>
  );
}

function HelicopterLimitsEditor({
  title,
  description,
  xLabel,
  yLabel,
  points,
  onChange,
  onBlur,
  onRemove,
}: {
  title: string;
  description: string;
  xLabel: string;
  yLabel: string;
  points: HelicopterLimitDraft[];
  onChange: (clientKey: string, field: "x" | "y", value: string) => void;
  onBlur: () => void;
  onRemove: (clientKey: string) => void;
}) {
  return (
    <fieldset className="min-w-0 bg-white" onBlur={onBlur}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-300 bg-slate-200 px-2 py-1">
        <legend className="text-[11px] font-bold uppercase tracking-wide text-slate-800">
          {title}
        </legend>
        <span className="text-[10px] text-slate-600">{description}</span>
      </div>
      <div className="max-w-full overflow-x-auto" data-edit-grid>
        <table className="w-full min-w-[420px] border-collapse text-left text-xs">
          <thead className="bg-slate-100 text-[11px] font-semibold text-slate-700">
            <tr>
              <GridHeader className="w-9 text-center">#</GridHeader>
              <GridHeader>{xLabel}</GridHeader>
              <GridHeader>{yLabel}</GridHeader>
              <GridHeader className="w-9 text-center" last>
                <span className="sr-only">Remove</span>
              </GridHeader>
            </tr>
          </thead>
          <tbody>
            {points.map((point, index) => {
              const isBlank = !hasHelicopterLimitValue(point);
              return (
                <tr key={point.clientKey} className="group even:bg-slate-50/60">
                  <GridIndexCell>{isBlank ? "•" : index + 1}</GridIndexCell>
                  <GridCell>
                    <GridNumberInput
                      ariaLabel={`${title} ${index + 1}, ${xLabel}`}
                      value={point.x}
                      onChange={(value) => onChange(point.clientKey, "x", value)}
                    />
                  </GridCell>
                  <GridCell>
                    <GridNumberInput
                      ariaLabel={`${title} ${index + 1}, ${yLabel}`}
                      min={yLabel.includes("weight") ? 0 : undefined}
                      value={point.y}
                      onChange={(value) => onChange(point.clientKey, "y", value)}
                    />
                  </GridCell>
                  <td className="border-t border-slate-200 p-0 text-center">
                    {!isBlank || points.length > 1 ? (
                      <RemoveGridRowButton
                        onClick={() => onRemove(point.clientKey)}
                        ariaLabel={`Remove ${title} row ${index + 1}`}
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </fieldset>
  );
}

function LoadingLocationsGrid({
  category,
  rows,
  onChange,
  onBlur,
  onAdd,
  onRemove,
}: {
  category: ModelForm["category"];
  rows: LoadingLocationDraft[];
  onChange: (
    clientKey: string,
    field: keyof LoadingLocationDraft,
    value: string
  ) => void;
  onBlur: () => void;
  onAdd: (kind: AircraftStationKind) => void;
  onRemove: (clientKey: string) => void;
}) {
  const stationGroups: Array<{
    kind: AircraftStationKind;
    label: string;
    emptyLabel: string;
  }> = [
    { kind: "seat", label: "Seats", emptyLabel: "Add seat" },
    { kind: "fuel", label: "Fuel tanks", emptyLabel: "Add fuel tank" },
    { kind: "baggage", label: "Baggage / cargo", emptyLabel: "Add baggage area" },
    { kind: "equipment", label: "Installed equipment", emptyLabel: "Add equipment" },
    { kind: "other", label: "Other loads", emptyLabel: "Add other load" },
  ];

  return (
    <fieldset className="min-w-0 border-t border-slate-300 bg-white" onBlur={onBlur}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 bg-slate-200 px-2 py-1">
        <legend className="text-[11px] font-bold uppercase tracking-wide text-slate-800">
          Loading stations
        </legend>
        <div className="flex flex-wrap gap-1">
          {stationGroups.map((group) => {
            const hasBlankRow = rows.some(
              (row) => row.kind === group.kind && !hasLoadingLocationValue(row)
            );
            return (
              <button
                key={group.kind}
                className="cursor-pointer rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 disabled:cursor-default disabled:bg-slate-100 disabled:text-slate-400"
                type="button"
                disabled={hasBlankRow}
                onClick={() => onAdd(group.kind)}
              >
                + {group.emptyLabel}
              </button>
            );
          })}
        </div>
      </div>
      {stationGroups.map((group) => {
        const groupRows = rows.filter((row) => row.kind === group.kind);
        return groupRows.length > 0 ? (
          <LoadingStationTable
            key={group.kind}
            category={category}
            kind={group.kind}
            label={group.label}
            rows={groupRows}
            onChange={onChange}
            onRemove={onRemove}
          />
        ) : null;
      })}
    </fieldset>
  );
}

function LoadingStationTable({
  category,
  kind,
  label,
  rows,
  onChange,
  onRemove,
}: {
  category: ModelForm["category"];
  kind: AircraftStationKind;
  label: string;
  rows: LoadingLocationDraft[];
  onChange: (
    clientKey: string,
    field: keyof LoadingLocationDraft,
    value: string
  ) => void;
  onRemove: (clientKey: string) => void;
}) {
  const stationLabel =
    kind === "seat"
      ? "Seat"
      : kind === "fuel"
        ? "Tank"
        : kind === "baggage"
          ? "Area"
          : kind === "equipment"
            ? "Item"
            : "Load";
  const placeholder =
    kind === "seat"
      ? "Pilot seat"
      : kind === "fuel"
        ? "Main tank"
        : kind === "baggage"
          ? "Baggage area"
          : kind === "equipment"
            ? "Installed item"
            : "External load";

  return (
    <div className="border-b border-slate-300 last:border-b-0">
      <div className="border-b border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
        {label}
      </div>
      <div className="max-w-full overflow-x-auto" data-edit-grid>
        <table className="w-full min-w-[620px] border-collapse text-left text-xs">
          <thead className="bg-white text-[11px] font-semibold text-slate-700">
            <tr>
              <GridHeader className="w-9 text-center">#</GridHeader>
              <GridHeader className="min-w-40">{stationLabel}</GridHeader>
              <GridHeader className="w-24">Arm (in)</GridHeader>
              <GridHeader className="w-24" title="Left/right arm">
                Lat arm{category === "helicopter" ? " *" : ""}
              </GridHeader>
              {kind === "fuel" ? (
                <>
                  <GridHeader className="w-28">Capacity (gal)</GridHeader>
                  <GridHeader className="w-24">lb/gal</GridHeader>
                </>
              ) : null}
              {kind === "seat" || kind === "baggage" || kind === "other" ? (
                <GridHeader className="w-24">Max lb</GridHeader>
              ) : null}
              {kind === "seat" ? (
                <GridHeader className="w-28">Crew role</GridHeader>
              ) : null}
              {kind === "equipment" ? (
                <>
                  <GridHeader className="w-24">Weight (lb)</GridHeader>
                  <GridHeader className="w-32">Use</GridHeader>
                </>
              ) : null}
              <GridHeader className="w-9 text-center" last>
                <span className="sr-only">Remove</span>
              </GridHeader>
            </tr>
          </thead>
          <tbody>
            {rows.map((station, index) => {
              const isBlank = !hasLoadingLocationValue(station);
              return (
                <tr key={station.clientKey} className="even:bg-slate-50/60">
                  <GridIndexCell>{isBlank ? "•" : index + 1}</GridIndexCell>
                  <GridCell>
                    <GridTextInput
                      ariaLabel={`${label} ${index + 1} name`}
                      placeholder={placeholder}
                      value={station.name}
                      onChange={(value) =>
                        onChange(station.clientKey, "name", value)
                      }
                    />
                  </GridCell>
                  <GridCell>
                    <GridNumberInput
                      ariaLabel={`${label} ${index + 1} arm from datum`}
                      value={station.arm}
                      onChange={(value) =>
                        onChange(station.clientKey, "arm", value)
                      }
                    />
                  </GridCell>
                  <GridCell>
                    <GridNumberInput
                      ariaLabel={`${label} ${index + 1} left or right arm`}
                      placeholder={category === "helicopter" ? "0" : ""}
                      value={station.latArm}
                      onChange={(value) =>
                        onChange(station.clientKey, "latArm", value)
                      }
                    />
                  </GridCell>
                  {kind === "fuel" ? (
                    <>
                      <GridCell>
                        <GridNumberInput
                          ariaLabel={`${label} ${index + 1} capacity in gallons`}
                          min={0}
                          value={station.maxWeight}
                          onChange={(value) =>
                            onChange(station.clientKey, "maxWeight", value)
                          }
                        />
                      </GridCell>
                      <GridCell>
                        <GridNumberInput
                          ariaLabel={`${label} ${index + 1} fuel density in pounds per gallon`}
                          min={0}
                          value={station.weightPerGallon}
                          onChange={(value) =>
                            onChange(station.clientKey, "weightPerGallon", value)
                          }
                        />
                      </GridCell>
                    </>
                  ) : null}
                  {kind === "seat" || kind === "baggage" || kind === "other" ? (
                    <GridCell>
                      <GridNumberInput
                        ariaLabel={`${label} ${index + 1} maximum load`}
                        min={0}
                        value={station.maxWeight}
                        onChange={(value) =>
                          onChange(station.clientKey, "maxWeight", value)
                        }
                      />
                    </GridCell>
                  ) : null}
                  {kind === "seat" ? (
                    <GridCell>
                      <GridSelect
                        ariaLabel={`${label} ${index + 1} crew role`}
                        value={station.crewRole}
                        onChange={(value) =>
                          onChange(station.clientKey, "crewRole", value)
                        }
                      >
                        <option value="">Passenger / none</option>
                        <option value="pilot">Pilot</option>
                        <option value="copilot">Co-pilot</option>
                      </GridSelect>
                    </GridCell>
                  ) : null}
                  {kind === "equipment" ? (
                    <>
                      <GridCell>
                        <GridNumberInput
                          ariaLabel={`${label} ${index + 1} installed weight`}
                          min={0}
                          value={station.fixedWeight}
                          onChange={(value) =>
                            onChange(station.clientKey, "fixedWeight", value)
                          }
                        />
                      </GridCell>
                      <GridCell>
                        <GridSelect
                          ariaLabel={`${label} ${index + 1} inclusion rule`}
                          value={station.inputType}
                          onChange={(value) =>
                            onChange(station.clientKey, "inputType", value)
                          }
                        >
                          <option value="number">Always included</option>
                          <option value="checkbox">Optional</option>
                        </GridSelect>
                      </GridCell>
                    </>
                  ) : null}
                  <td className="border-t border-slate-200 p-0 text-center">
                    {!isBlank || kind !== "seat" || rows.length > 1 ? (
                      <RemoveGridRowButton
                        onClick={() => onRemove(station.clientKey)}
                        ariaLabel={`Remove ${label.toLowerCase()} ${index + 1}`}
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WeightBalanceLimitsGrid({
  title,
  description,
  rows,
  onChange,
  onBlur,
  onRemove,
}: {
  title: string;
  description: string;
  rows: WeightBalanceLimitDraft[];
  onChange: (
    clientKey: string,
    field: keyof WeightBalanceLimitDraft,
    value: string
  ) => void;
  onBlur: () => void;
  onRemove: (clientKey: string) => void;
}) {
  return (
    <fieldset className="min-w-0 bg-white" onBlur={onBlur}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-300 bg-slate-200 px-2 py-1">
        <legend className="text-[11px] font-bold uppercase tracking-wide text-slate-800">
          {title}
        </legend>
        <span className="text-[10px] text-slate-600">{description}</span>
      </div>
      <div className="max-w-full overflow-x-auto" data-edit-grid>
        <table className="w-full min-w-[420px] border-collapse text-left text-xs">
          <thead className="bg-slate-100 text-[11px] font-semibold text-slate-700">
            <tr>
              <GridHeader className="w-9 text-center">#</GridHeader>
              <GridHeader>CG (in)</GridHeader>
              <GridHeader>Weight (lb)</GridHeader>
              <GridHeader className="w-9 text-center" last>
                <span className="sr-only">Remove</span>
              </GridHeader>
            </tr>
          </thead>
          <tbody>
            {rows.map((point, index) => {
              const isBlank = !hasWeightBalanceLimitValue(point);
              return (
                <tr key={point.clientKey} className="even:bg-slate-50/60">
                  <GridIndexCell>{isBlank ? "•" : index + 1}</GridIndexCell>
                  <GridCell>
                    <GridNumberInput
                      ariaLabel={`${title} point ${index + 1} position`}
                      value={point.cg}
                      onChange={(value) =>
                        onChange(point.clientKey, "cg", value)
                      }
                    />
                  </GridCell>
                  <GridCell>
                    <GridNumberInput
                      ariaLabel={`${title} point ${index + 1} aircraft weight`}
                      min={0}
                      value={point.weight}
                      onChange={(value) =>
                        onChange(point.clientKey, "weight", value)
                      }
                    />
                  </GridCell>
                  <td className="border-t border-slate-200 p-0 text-center">
                    {!isBlank || rows.length > 1 ? (
                      <RemoveGridRowButton
                        onClick={() => onRemove(point.clientKey)}
                        ariaLabel={`Remove ${title} point ${index + 1}`}
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </fieldset>
  );
}

function AircraftWorksheet({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="min-w-0 overflow-hidden border border-slate-300 bg-white">
      <legend className="sr-only">{title}</legend>
      <div className="border-b border-slate-300 bg-slate-800 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
        {title}
      </div>
      <div className="max-w-full overflow-x-auto" data-edit-grid>{children}</div>
    </fieldset>
  );
}

function AircraftWorksheetInput({
  ariaLabel,
  className = "",
  onChange,
  type = "text",
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> & {
  ariaLabel: string;
  className?: string;
  onChange: (value: string) => void;
  type?: React.HTMLInputTypeAttribute;
}) {
  return (
    <input
      {...props}
      aria-label={ariaLabel}
      className={`${gridControlClass} ${type === "number" ? "font-mono tabular-nums" : ""} disabled:bg-slate-100 ${className}`}
      data-grid-cell
      lang={type === "month" ? "en-US" : props.lang}
      step={type === "number" ? "any" : props.step}
      type={type}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleGridKeyDown}
    />
  );
}

const gridControlClass =
  "block h-7 w-full min-w-20 border-0 bg-transparent px-1.5 py-0 text-xs text-slate-900 outline-none transition-colors placeholder:text-slate-400 hover:bg-blue-50/60 focus:bg-blue-50 focus:ring-2 focus:ring-inset focus:ring-blue-600";

function GridHeader({
  children,
  className = "",
  last = false,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  last?: boolean;
  title?: string;
}) {
  return (
    <th
      className={`h-7 border-b border-slate-300 px-1.5 py-0 ${
        last ? "" : "border-r"
      } ${className}`}
      title={title}
    >
      {children}
    </th>
  );
}

function GridCell({ children }: { children: React.ReactNode }) {
  return <td className="border-r border-t border-slate-200 p-0">{children}</td>;
}

function GridIndexCell({ children }: { children: React.ReactNode }) {
  return (
    <td className="h-7 border-r border-t border-slate-200 bg-slate-50 px-1 text-center text-[10px] font-medium tabular-nums text-slate-500">
      {children}
    </td>
  );
}

function RemoveGridRowButton({
  ariaLabel,
  onClick,
}: {
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-rose-600"
      title="Remove row"
      type="button"
      onClick={onClick}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
        <path d="M4.5 5.5h11M8 3.5h4M6.5 5.5l.6 10h5.8l.6-10M8.5 8v5M11.5 8v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function GridTextInput({
  ariaLabel,
  placeholder,
  value,
  onChange,
}: {
  ariaLabel: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      aria-label={ariaLabel}
      className={gridControlClass}
      data-grid-cell
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleGridKeyDown}
    />
  );
}

function GridNumberInput({
  ariaLabel,
  min,
  placeholder,
  value,
  onChange,
}: {
  ariaLabel: string;
  min?: number;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      aria-label={ariaLabel}
      className={`${gridControlClass} font-mono tabular-nums`}
      data-grid-cell
      min={min}
      placeholder={placeholder}
      step="any"
      type="number"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleGridKeyDown}
    />
  );
}

function GridSelect({
  ariaLabel,
  children,
  value,
  onChange,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={ariaLabel}
      className={`${gridControlClass} cursor-pointer`}
      data-grid-cell
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleGridKeyDown}
    >
      {children}
    </select>
  );
}

function handleGridKeyDown(
  event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>
) {
  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
  event.preventDefault();
  const grid = event.currentTarget.closest<HTMLElement>("[data-edit-grid]");
  if (!grid) return;
  const currentCells = Array.from(
    grid.querySelectorAll<HTMLElement>("[data-grid-cell]:not(:disabled)")
  );
  const currentIndex = currentCells.indexOf(event.currentTarget);
  window.requestAnimationFrame(() => {
    const nextCells = Array.from(
      grid.querySelectorAll<HTMLElement>("[data-grid-cell]:not(:disabled)")
    );
    nextCells[currentIndex + 1]?.focus();
  });
}

function hasLoadingLocationValue(row: LoadingLocationDraft | undefined) {
  if (!row) return false;
  return Boolean(
    row.id.trim() ||
      row.name.trim() ||
      row.arm.trim() ||
      row.latArm.trim() ||
      row.fixedWeight.trim() ||
      row.maxWeight.trim() ||
      row.inputType !== "number" ||
      row.crewRole
  );
}

function hasWeightBalanceLimitValue(row: WeightBalanceLimitDraft | undefined) {
  return Boolean(row && (row.cg.trim() || row.weight.trim()));
}

function hasHelicopterLimitValue(row: HelicopterLimitDraft | undefined) {
  return Boolean(row && (row.x.trim() || row.y.trim()));
}

function keepOneTrailingBlank<T>(
  rows: T[],
  hasValue: (row: T | undefined) => boolean
) {
  const next = [...rows];
  while (
    next.length > 1 &&
    !hasValue(next[next.length - 1]) &&
    !hasValue(next[next.length - 2])
  ) {
    next.pop();
  }
  return next;
}

function keepOneBlankLoadingLocationPerKind(rows: LoadingLocationDraft[]) {
  const keptBlankKinds = new Set<AircraftStationKind>();
  return [...rows].reverse().filter((row) => {
    if (hasLoadingLocationValue(row)) return true;
    if (keptBlankKinds.has(row.kind)) return false;
    keptBlankKinds.add(row.kind);
    return true;
  }).reverse();
}

function ensureWeightBalanceLimitRow(rows: WeightBalanceLimitDraft[]) {
  if (rows.length === 0 || hasWeightBalanceLimitValue(rows[rows.length - 1])) {
    return [...rows, emptyWeightBalanceLimit(crypto.randomUUID())];
  }
  return rows;
}

function ensureHelicopterLimitRow(rows: HelicopterLimitDraft[]) {
  if (rows.length === 0 || hasHelicopterLimitValue(rows[rows.length - 1])) {
    return [...rows, emptyHelicopterLimit(crypto.randomUUID())];
  }
  return rows;
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

function toMonthInput(value?: string | null) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : "";
}

function monthEndDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`;
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

function memberConfirmationTitle(confirmation: MemberConfirmation | null) {
  if (!confirmation) return "Confirm change";
  if (confirmation.action === "pending") return "Remove pending person?";
  if (confirmation.action === "role") return confirmation.member.member_role === "organization_admin" ? "Remove administrator access?" : "Grant administrator access?";
  if (confirmation.action === "transfer") return "Transfer organization ownership?";
  return "Remove organization member?";
}

function memberConfirmationDescription(confirmation: MemberConfirmation | null) {
  if (!confirmation) return "";
  if (confirmation.action === "pending") return `${confirmation.person.email} will be removed from the pending organization roster.`;
  if (confirmation.action === "role") return `${confirmation.member.email} will ${confirmation.member.member_role === "organization_admin" ? "lose" : "receive"} organization administrator permissions.`;
  if (confirmation.action === "transfer") return `${confirmation.member.email} will become the organization Owner. Your role will change according to the existing ownership workflow.`;
  return `${confirmation.member.email} will lose access to this organization. Their PilotSeal account will not be deleted.`;
}

function memberConfirmationLabel(confirmation: MemberConfirmation | null) {
  if (!confirmation) return "Confirm";
  if (confirmation.action === "role") return confirmation.member.member_role === "organization_admin" ? "Remove admin access" : "Grant admin access";
  if (confirmation.action === "transfer") return "Transfer ownership";
  return "Remove";
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

function formatChartType(value?: string | null) {
  if (value === "1d1p") return "CG + weight";
  if (value === "2d1p") return "Single 2-axis";
  if (value === "2d2p") return "Top + side";
  return "—";
}

function formatFleetDate(value?: string | null) {
  return formatUsMonthYear(value);
}
