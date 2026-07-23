"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import {
  approveAircraftUpdateRequest,
  createAircraft,
  createAircraftModel,
  deleteAircraft,
  deleteAircraftModel,
  fetchAircraftOrganizationAssignments,
  fetchAircraftModels,
  fetchAircraftUpdateRequests,
  fetchMyAircraft,
  fetchSharedAircraft,
  makeAircraftPrivateForUser,
  rejectAircraftUpdateRequest,
  parseAircraftEnvelopeSet,
  parseAircraftStations,
  saveCurrentAircraftForUser,
  setPlatformAircraftOrganizations,
  updateAircraft,
  updateAircraftModel,
  type AircraftModelRecord,
  type AircraftRecord,
  type AircraftUpdateRequestRecord,
  type AircraftOrganizationAssignment,
} from "@/lib/aircraft";
import {
  fetchPlatformOrganizations,
  type PlatformOrganization,
} from "@/lib/platform-admin";
import { fetchCurrentProfile } from "@/lib/profile";

type ModelStationDraft = {
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

type EnvelopePointDraft = {
  clientKey: string;
  cg: string;
  weight: string;
};

type PolygonPointDraft = {
  clientKey: string;
  x: string;
  y: string;
};

type ModelFormState = {
  id: string | null;
  name: string;
  category: "airplane" | "helicopter";
  avg_fuel_burn_rate: string;
  max_weight: string;
  stations: ModelStationDraft[];
  envelope: EnvelopePointDraft[];
  topView: PolygonPointDraft[];
  sideView: PolygonPointDraft[];
};

type AircraftFormState = {
  id: string | null;
  model_id: string;
  name: string;
  empty_weight: string;
  empty_arm: string;
  empty_lat_arm: string;
};

const emptyModelForm: ModelFormState = {
  id: null,
  name: "",
  category: "airplane",
  avg_fuel_burn_rate: "",
  max_weight: "",
  stations: [{
    clientKey: "new-station-1",
    id: "",
    name: "",
    arm: "",
    latArm: "",
    weightPerGallon: "",
    fixedWeight: "",
    maxWeight: "",
    inputType: "number",
    crewRole: "",
  }],
  envelope: [
    { clientKey: "new-envelope-1", cg: "", weight: "" },
    { clientKey: "new-envelope-2", cg: "", weight: "" },
    { clientKey: "new-envelope-3", cg: "", weight: "" },
  ],
  topView: [
    { clientKey: "new-top-view-1", x: "", y: "" },
    { clientKey: "new-top-view-2", x: "", y: "" },
    { clientKey: "new-top-view-3", x: "", y: "" },
  ],
  sideView: [
    { clientKey: "new-side-view-1", x: "", y: "" },
    { clientKey: "new-side-view-2", x: "", y: "" },
    { clientKey: "new-side-view-3", x: "", y: "" },
  ],
};

const emptyAircraftForm: AircraftFormState = {
  id: null,
  model_id: "",
  name: "",
  empty_weight: "",
  empty_arm: "",
  empty_lat_arm: "",
};

function normalizeModelForm(model: AircraftModelRecord): ModelFormState {
  const stations = parseAircraftStations(model.stations);
  const envelopeSet = parseAircraftEnvelopeSet(model.envelope);
  const envelope = envelopeSet.normal;

  return {
    id: model.id,
    name: model.name ?? "",
    category: model.category === "helicopter" ? "helicopter" : "airplane",
    avg_fuel_burn_rate:
      typeof model.avg_fuel_burn_rate === "number" ? String(model.avg_fuel_burn_rate) : "",
    max_weight: typeof model.max_weight === "number" ? String(model.max_weight) : "",
    stations:
      stations.length > 0
        ? stations.map((station, index) => ({
            clientKey: `station-${model.id}-${index}`,
            id: station.id,
            name: station.name,
            arm: String(station.arm),
            latArm: station.latArm != null ? String(station.latArm) : "",
            weightPerGallon: station.weightPerGallon != null ? String(station.weightPerGallon) : "",
            fixedWeight: station.fixedWeight != null ? String(station.fixedWeight) : "",
            maxWeight: station.maxWeight != null ? String(station.maxWeight) : "",
            inputType: station.inputType === "checkbox" ? "checkbox" : "number",
            crewRole:
              station.crewRole === "pilot" || station.crewRole === "copilot"
                ? station.crewRole
                : "",
          }))
        : emptyModelForm.stations,
    envelope:
      envelope.length > 0
        ? envelope.map((point, index) => ({
            clientKey: `envelope-${model.id}-${index}`,
            cg: String(point.cg),
            weight: String(point.weight),
          }))
        : emptyModelForm.envelope,
    topView:
      envelopeSet.topView.length > 0
        ? envelopeSet.topView.map((point, index) => ({
            clientKey: `top-view-${model.id}-${index}`,
            x: String(point.x),
            y: String(point.y),
          }))
        : emptyModelForm.topView,
    sideView:
      envelopeSet.sideView.length > 0
        ? envelopeSet.sideView.map((point, index) => ({
            clientKey: `side-view-${model.id}-${index}`,
            x: String(point.x),
            y: String(point.y),
          }))
        : emptyModelForm.sideView,
  };
}

function normalizeAircraftForm(aircraft: AircraftRecord): AircraftFormState {
  return {
    id: aircraft.id,
    model_id: aircraft.model_id ?? aircraft.model?.id ?? "",
    name: aircraft.tail_number ?? aircraft.name ?? "",
    empty_weight: aircraft.empty_weight != null ? String(aircraft.empty_weight) : "",
    empty_arm: aircraft.empty_arm != null ? String(aircraft.empty_arm) : "",
    empty_lat_arm: aircraft.empty_lat_arm != null ? String(aircraft.empty_lat_arm) : "",
  };
}

function toNumber(value: string) {
  return Number.parseFloat(value);
}

function toOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function scrollEditorIntoView(
  targetId: string,
  scrollContainer: HTMLElement | null | undefined
) {
  const runScroll = () => {
    const element = document.getElementById(targetId);
    if (!element || !(scrollContainer instanceof HTMLElement)) {
      return;
    }

    const top = element.offsetTop - 24;
    scrollContainer.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  };

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(runScroll);
  });
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

function mergeAircraftLists(...lists: AircraftRecord[][]) {
  const byId = new Map<string, AircraftRecord>();
  for (const list of lists) {
    for (const item of list) {
      byId.set(item.id, { ...byId.get(item.id), ...item });
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.tail_number.localeCompare(b.tail_number));
}

export default function AircraftAdminPanel() {
  const { session } = useAuthSession();
  const [profileRole, setProfileRole] = useState("");
  const [models, setModels] = useState<AircraftModelRecord[]>([]);
  const [aircraft, setAircraft] = useState<AircraftRecord[]>([]);
  const [updateRequests, setUpdateRequests] = useState<AircraftUpdateRequestRecord[]>([]);
  const [organizations, setOrganizations] = useState<PlatformOrganization[]>([]);
  const [organizationAssignments, setOrganizationAssignments] = useState<AircraftOrganizationAssignment[]>([]);
  const [assigningAircraftId, setAssigningAircraftId] = useState("");
  const [selectedOrganizationIds, setSelectedOrganizationIds] = useState<string[]>([]);
  const [modelForm, setModelForm] = useState<ModelFormState>(emptyModelForm);
  const [aircraftForm, setAircraftForm] = useState<AircraftFormState>(emptyAircraftForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [showModelsModal, setShowModelsModal] = useState(false);
  const [showAircraftModal, setShowAircraftModal] = useState(false);
  const [showRequestsModal, setShowRequestsModal] = useState(false);
  const [showModelForm, setShowModelForm] = useState(false);
  const [showAircraftForm, setShowAircraftForm] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const modelsScrollRef = useRef<HTMLDivElement | null>(null);
  const aircraftScrollRef = useRef<HTMLDivElement | null>(null);

  const isAdmin = profileRole === "admin";

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    if (!showModelsModal && !showAircraftModal) {
      if (!showRequestsModal) {
        return;
      }
    }

    if (!showModelsModal && !showAircraftModal && !showRequestsModal) {
      return;
    }

    const scrollY = window.scrollY;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousOverflow = document.body.style.overflow;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousOverflow;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      window.scrollTo({ top: scrollY, behavior: "auto" });
    };
  }, [showAircraftModal, showModelsModal, showRequestsModal]);

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

        if (!cancelled) {
          setProfileRole(nextRole);
        }

        if (nextRole !== "admin") {
          if (!cancelled) {
            setModels([]);
            setAircraft([]);
          }
          return;
        }

        await reloadAll(cancelled);
      } catch {
        if (!cancelled) {
          setProfileRole("user");
          setStatus("Unable to load aircraft management right now.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    async function reloadAll(cancelledState = false) {
      const [modelResult, sharedResult, myResult, requestResult, organizationResult] = await Promise.allSettled([
        fetchAircraftModels(),
        fetchSharedAircraft(),
        session?.user?.id ? fetchMyAircraft(session.user.id) : Promise.resolve([]),
        fetchAircraftUpdateRequests(),
        fetchPlatformOrganizations(),
      ]);

      if (cancelledState) {
        return;
      }

      if (modelResult.status === "fulfilled") {
        setModels(modelResult.value);
      }

      const nextAircraft = mergeAircraftLists(
        sharedResult.status === "fulfilled" ? sharedResult.value : [],
        myResult.status === "fulfilled" ? myResult.value : [],
      );
      setAircraft(nextAircraft);
      try {
        setOrganizationAssignments(await fetchAircraftOrganizationAssignments(nextAircraft.map((item) => item.id)));
      } catch {
        setOrganizationAssignments([]);
      }

      if (requestResult.status === "fulfilled") {
        setUpdateRequests(requestResult.value);
      }
      if (organizationResult.status === "fulfilled") {
        setOrganizations(organizationResult.value);
      }

      if (
        modelResult.status === "rejected" ||
        sharedResult.status === "rejected" ||
        myResult.status === "rejected" ||
        requestResult.status === "rejected"
      ) {
        setStatus("Unable to load aircraft management right now.");
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const modelNameById = useMemo(
    () => new Map(models.map((model) => [model.id, model.name])),
    [models]
  );

  async function reloadAll() {
    const [modelResult, sharedResult, myResult, requestResult, organizationResult] = await Promise.allSettled([
      fetchAircraftModels(),
      fetchSharedAircraft(),
      session?.user?.id ? fetchMyAircraft(session.user.id) : Promise.resolve([]),
      fetchAircraftUpdateRequests(),
      fetchPlatformOrganizations(),
    ]);

    if (modelResult.status === "fulfilled") {
      setModels(modelResult.value);
    }

    const nextAircraft = mergeAircraftLists(
      sharedResult.status === "fulfilled" ? sharedResult.value : [],
      myResult.status === "fulfilled" ? myResult.value : [],
    );
    setAircraft(nextAircraft);
    try {
      setOrganizationAssignments(await fetchAircraftOrganizationAssignments(nextAircraft.map((item) => item.id)));
    } catch {
      setOrganizationAssignments([]);
    }

    if (requestResult.status === "fulfilled") {
      setUpdateRequests(requestResult.value);
    }
    if (organizationResult.status === "fulfilled") {
      setOrganizations(organizationResult.value);
    }

  }

  function openModelEditor(nextForm = emptyModelForm) {
    setModelForm(nextForm);
    setShowModelForm(true);
    setShowModelsModal(true);
  }

  function openAircraftEditor(nextForm = emptyAircraftForm) {
    setAircraftForm(nextForm);
    setShowAircraftForm(true);
    setShowAircraftModal(true);
  }

  useEffect(() => {
    if (showModelsModal && showModelForm && !modelForm.id) {
      scrollEditorIntoView("model-editor-new", modelsScrollRef.current);
    }
  }, [showModelsModal, showModelForm, modelForm.id]);

  useEffect(() => {
    if (showAircraftModal && showAircraftForm && !aircraftForm.id) {
      scrollEditorIntoView("aircraft-editor-new", aircraftScrollRef.current);
    }
  }, [showAircraftModal, showAircraftForm, aircraftForm.id]);

  function updateModelField<K extends keyof ModelFormState>(key: K, value: ModelFormState[K]) {
    setModelForm((current) => ({ ...current, [key]: value }));
  }

  function updateAircraftField<K extends keyof AircraftFormState>(
    key: K,
    value: AircraftFormState[K]
  ) {
    setAircraftForm((current) => ({ ...current, [key]: value }));
  }

  function updateStation(index: number, key: keyof ModelStationDraft, value: string) {
    setModelForm((current) => ({
      ...current,
      stations: current.stations.map((station, stationIndex) =>
        stationIndex === index ? { ...station, [key]: value } : station
      ),
    }));
  }

  function updateEnvelope(index: number, key: keyof EnvelopePointDraft, value: string) {
    setModelForm((current) => ({
      ...current,
      envelope: current.envelope.map((point, pointIndex) =>
        pointIndex === index ? { ...point, [key]: value } : point
      ),
    }));
  }

  function updateTopView(index: number, key: keyof PolygonPointDraft, value: string) {
    setModelForm((current) => ({
      ...current,
      topView: current.topView.map((point, pointIndex) =>
        pointIndex === index ? { ...point, [key]: value } : point
      ),
    }));
  }

  function updateSideView(index: number, key: keyof PolygonPointDraft, value: string) {
    setModelForm((current) => ({
      ...current,
      sideView: current.sideView.map((point, pointIndex) =>
        pointIndex === index ? { ...point, [key]: value } : point
      ),
    }));
  }

  async function handleSaveModel() {
    if (!isAdmin) {
      return;
    }

    if (!modelForm.name.trim()) {
      setStatus("Model name is required.");
      return;
    }

    const stations = modelForm.stations
      .filter((station) => station.id.trim() && station.name.trim() && station.arm.trim())
      .map((station) => {
        const weightPerGallon =
          toOptionalNumber(station.weightPerGallon) ??
          (/fuel/i.test(station.id) || /fuel/i.test(station.name) ? 6 : null);

        return {
          id: station.id.trim(),
          name: station.name.trim(),
          arm: toNumber(station.arm),
          latArm: toOptionalNumber(station.latArm),
          weightPerGallon,
          fixedWeight: toOptionalNumber(station.fixedWeight),
          maxWeight: toOptionalNumber(station.maxWeight),
          inputType: station.inputType,
          crewRole: station.crewRole || null,
        };
      });

    if (stations.length < 1) {
      setStatus("Add at least one loading location.");
      return;
    }

    const envelope = modelForm.envelope
      .filter((point) => point.cg.trim() && point.weight.trim())
      .map((point) => ({
        cg: toNumber(point.cg),
        weight: toNumber(point.weight),
      }));

    const topView = modelForm.topView
      .filter((point) => point.x.trim() && point.y.trim())
      .map((point) => ({
        x: toNumber(point.x),
        y: toNumber(point.y),
      }));

    const sideView = modelForm.sideView
      .filter((point) => point.x.trim() && point.y.trim())
      .map((point) => ({
        x: toNumber(point.x),
        y: toNumber(point.y),
      }));

    const savedEnvelope =
      modelForm.category === "helicopter" && topView.length > 0 && sideView.length > 0
        ? {
            top_view: topView,
            side_view: sideView,
          }
        : modelForm.category === "helicopter" && topView.length > 0
          ? {
              polygon: topView,
            }
          : envelope;

    if (modelForm.category === "helicopter" && (topView.length > 0 || sideView.length > 0)) {
      if (topView.length < 3) {
        setStatus("Add at least three top-view points.");
        return;
      }

      if (sideView.length > 0 && sideView.length < 3) {
        setStatus("Add at least three side-view points or leave side view empty.");
        return;
      }
    } else if (envelope.length < 3) {
      setStatus("Add at least three envelope points.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: modelForm.name.trim(),
        category: modelForm.category,
        avg_fuel_burn_rate: modelForm.avg_fuel_burn_rate.trim()
          ? toNumber(modelForm.avg_fuel_burn_rate)
          : null,
        max_weight: toOptionalNumber(modelForm.max_weight),
        stations,
        envelope: savedEnvelope,
      };
      let savedModel: AircraftModelRecord;

      if (modelForm.id) {
        savedModel = await updateAircraftModel(modelForm.id, payload);
        setStatus("Aircraft model updated.");
      } else {
        savedModel = await createAircraftModel(payload);
        setStatus("Aircraft model created.");
      }

      setModels((current) =>
        [...current.filter((model) => model.id !== savedModel.id), savedModel].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
      await reloadAll();
      setModelForm(emptyModelForm);
      setShowModelForm(false);
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to save aircraft model right now."));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAircraft() {
    if (!isAdmin) {
      return;
    }

    if (!aircraftForm.model_id) {
      setStatus("Select a model.");
      return;
    }

    if (!aircraftForm.name.trim()) {
      setStatus("Tail number is required.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        model_id: aircraftForm.model_id,
        name: aircraftForm.name.trim(),
        empty_weight: toNumber(aircraftForm.empty_weight),
        empty_arm: toNumber(aircraftForm.empty_arm),
        empty_lat_arm:
          aircraftForm.empty_lat_arm.trim() === "" ? null : toNumber(aircraftForm.empty_lat_arm),
        owner_user_id: session?.user?.id ?? null,
        visibility: "private" as const,
      };
      let savedAircraft: AircraftRecord;

      if (aircraftForm.id) {
        savedAircraft = await updateAircraft(aircraftForm.id, payload);
        setStatus("Aircraft updated.");
      } else {
        savedAircraft = await createAircraft(payload);
        if (session?.user?.id) {
          try {
            await saveCurrentAircraftForUser(session.user.id, savedAircraft.id);
            savedAircraft = { ...savedAircraft, source: "mine", is_saved: true };
            setStatus("Aircraft created and added to My Aircraft.");
          } catch (attachError) {
            setStatus(
              getErrorMessage(
                attachError,
                "Aircraft created, but it could not be added to My Aircraft."
              )
            );
          }
        } else {
          setStatus("Aircraft created.");
        }
      }

      setAircraft((current) =>
        [
          ...current.filter((item) => item.id !== savedAircraft.id),
          {
            ...savedAircraft,
            model: models.find((model) => model.id === savedAircraft.model_id) ?? null,
          },
        ].sort((a, b) => a.name.localeCompare(b.name))
      );
      await reloadAll();
      setAircraftForm(emptyAircraftForm);
      setShowAircraftForm(false);
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to save aircraft right now."));
    } finally {
      setSaving(false);
    }
  }

  async function handleMakeAircraftPrivate(aircraftId: string) {
    if (!session?.user?.id) {
      return;
    }

    setSaving(true);

    try {
      await makeAircraftPrivateForUser(session.user.id, aircraftId);
      setAircraft((current) => current.filter((item) => item.id !== aircraftId));
      setStatus("Aircraft moved to My Aircraft and removed from shared registry.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to make this aircraft private."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteModel(id: string) {
    const confirmed = window.confirm(
      "Delete this aircraft model? This will remove the saved model information."
    );
    if (!confirmed) {
      return;
    }

    setSaving(true);
    try {
      await deleteAircraftModel(id);
      setModels((current) => current.filter((model) => model.id !== id));
      setStatus("Aircraft model deleted.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to delete aircraft model right now."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAircraft(id: string) {
    const confirmed = window.confirm(
      "Delete this aircraft? This will remove the saved aircraft information."
    );
    if (!confirmed) {
      return;
    }

    setSaving(true);
    try {
      await deleteAircraft(id);
      setAircraft((current) => current.filter((item) => item.id !== id));
      setStatus("Aircraft deleted.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to delete aircraft right now."));
    } finally {
      setSaving(false);
    }
  }

  function openOrganizationAssignments(item: AircraftRecord) {
    setAssigningAircraftId(item.id);
    setSelectedOrganizationIds(
      organizationAssignments
        .filter((assignment) => assignment.aircraft_id === item.id)
        .map((assignment) => assignment.organization_id),
    );
    setStatus("");
  }

  function toggleOrganizationAssignment(organizationId: string) {
    setSelectedOrganizationIds((current) =>
      current.includes(organizationId)
        ? current.filter((id) => id !== organizationId)
        : [...current, organizationId],
    );
  }

  async function handleSaveOrganizationAssignments() {
    if (!assigningAircraftId) return;
    setSaving(true);
    setStatus("");
    try {
      await setPlatformAircraftOrganizations(assigningAircraftId, selectedOrganizationIds);
      setOrganizationAssignments(
        await fetchAircraftOrganizationAssignments(aircraft.map((item) => item.id)),
      );
      setAssigningAircraftId("");
      setSelectedOrganizationIds([]);
      setStatus("Organization access updated.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to update organization access."));
    } finally {
      setSaving(false);
    }
  }

  async function handleApproveRequest(request: AircraftUpdateRequestRecord) {
    setSaving(true);
    setStatus("");

    try {
      await approveAircraftUpdateRequest(request);
      await reloadAll();
      setStatus(`Approved W&B update for ${request.aircraft_tail_number}.`);
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to approve this aircraft update right now."));
    } finally {
      setSaving(false);
    }
  }

  async function handleRejectRequest(request: AircraftUpdateRequestRecord) {
    setSaving(true);
    setStatus("");

    try {
      await rejectAircraftUpdateRequest(request.id);
      await reloadAll();
      setStatus(`Rejected W&B update for ${request.aircraft_tail_number}.`);
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to reject this aircraft update right now."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="saas-panel">Loading aircraft...</div>;
  }

  if (!isAdmin) {
    return <div className="saas-panel">Admin access required.</div>;
  }

  const renderModelForm = () => (
    <div className="mt-6 rounded-2xl border border-[var(--border)] bg-white/85 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">
          {modelForm.id ? "Edit aircraft model" : "Add aircraft model"}
        </h3>
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            setModelForm(emptyModelForm);
            setShowModelForm(false);
          }}
        >
          Close
        </button>
      </div>

      <p className="saas-meta-text mt-3">
        Enter the values from the aircraft flight manual or approved weight-and-balance
        records. Nothing changes until you save.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm">
          <span>Model name</span>
          <input
            className="rounded-xl border border-slate-300 px-3 py-2"
            value={modelForm.name}
            onChange={(event) => updateModelField("name", event.target.value)}
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span>Aircraft type</span>
          <select
            className="rounded-xl border border-slate-300 px-3 py-2"
            value={modelForm.category}
            onChange={(event) =>
              updateModelField("category", event.target.value as "airplane" | "helicopter")
            }
          >
            <option value="airplane">Airplane</option>
            <option value="helicopter">Helicopter</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm md:col-span-2">
          <span>Typical fuel burn (gallons per hour)</span>
          <input
            className="rounded-xl border border-slate-300 px-3 py-2"
            type="number"
            min="0"
            step="0.1"
            value={modelForm.avg_fuel_burn_rate}
            onChange={(event) => updateModelField("avg_fuel_burn_rate", event.target.value)}
            placeholder="e.g. 8.5"
          />
        </label>
        <label className="grid gap-2 text-sm md:col-span-2">
          <span>Maximum takeoff weight (lb)</span>
          <input
            className="rounded-xl border border-slate-300 px-3 py-2"
            type="number"
            min="0"
            step="0.1"
            value={modelForm.max_weight}
            onChange={(event) => updateModelField("max_weight", event.target.value)}
            placeholder="e.g. 2400"
          />
        </label>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Loading locations</h4>
            <p className="saas-meta-text mt-1">
              Add each seat, baggage area, fuel tank, or permanently installed item.
            </p>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={() =>
              updateModelField("stations", [
                ...modelForm.stations,
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
              ])
            }
          >
            Add loading location
          </button>
        </div>
        <div className="grid gap-3">
          {modelForm.stations.map((station, index) => (
            <div
              key={station.clientKey}
              className="grid gap-3 rounded-2xl border border-[var(--border)] bg-white/80 p-4 md:grid-cols-2 lg:grid-cols-3"
            >
              <label className="grid gap-2 text-sm">
                <span>Short code</span>
                <input
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  value={station.id}
                  onChange={(event) => updateStation(index, "id", event.target.value)}
                  placeholder="e.g. pilot, baggage, mainFuel"
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span>Name shown to users</span>
                <input
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  value={station.name}
                  onChange={(event) => updateStation(index, "name", event.target.value)}
                  placeholder="e.g. Pilot seat"
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span>Forward/aft arm (in)</span>
                <input
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  type="number"
                  value={station.arm}
                  onChange={(event) => updateStation(index, "arm", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span>Left/right arm (in, optional)</span>
                <input
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  type="number"
                  value={station.latArm}
                  onChange={(event) => updateStation(index, "latArm", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span>Fuel weight (lb per gallon)</span>
                <input
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  type="number"
                  value={station.weightPerGallon}
                  onChange={(event) => updateStation(index, "weightPerGallon", event.target.value)}
                  placeholder={/fuel/i.test(station.id) || /fuel/i.test(station.name) ? "6" : ""}
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span>Always-loaded weight (lb)</span>
                <input
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  type="number"
                  value={station.fixedWeight}
                  onChange={(event) => updateStation(index, "fixedWeight", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span>Maximum allowed load (lb)</span>
                <input
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  type="number"
                  value={station.maxWeight}
                  onChange={(event) => updateStation(index, "maxWeight", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span>How users enter the load</span>
                <select
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  value={station.inputType}
                  onChange={(event) =>
                    updateStation(index, "inputType", event.target.value as "number" | "checkbox")
                  }
                >
                  <option value="number">Enter a weight or quantity</option>
                  <option value="checkbox">Included / not included</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm">
                <span>Seat assignment</span>
                <select
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  value={station.crewRole}
                  onChange={(event) =>
                    updateStation(index, "crewRole", event.target.value as "" | "pilot" | "copilot")
                  }
                >
                  <option value="">Not a crew seat</option>
                  <option value="pilot">Pilot seat</option>
                  <option value="copilot">Co-pilot seat</option>
                </select>
              </label>
              <button
                type="button"
                className="danger-button-compact self-end"
                onClick={() =>
                  updateModelField(
                    "stations",
                    modelForm.stations.filter((_, stationIndex) => stationIndex !== index)
                  )
                }
              >
                Remove location
              </button>
            </div>
          ))}
        </div>
      </div>

      {modelForm.category === "helicopter" ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">
                  CG limits — top view
                </h4>
                <p className="saas-meta-text mt-1">
                  Enter each forward/aft and left/right CG boundary point.
                </p>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  updateModelField("topView", [
                    ...modelForm.topView,
                    { clientKey: crypto.randomUUID(), x: "", y: "" },
                  ])
                }
              >
                Add limit point
              </button>
            </div>
            <div className="grid gap-3">
              {modelForm.topView.map((point, index) => (
                <div
                  key={point.clientKey}
                  className="grid gap-3 rounded-2xl border border-[var(--border)] bg-white/80 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <label className="grid gap-2 text-sm">
                    <span>Forward/aft CG (in)</span>
                    <input
                      className="rounded-xl border border-slate-300 px-3 py-2"
                      type="number"
                      value={point.x}
                      onChange={(event) => updateTopView(index, "x", event.target.value)}
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Left/right CG (in)</span>
                    <input
                      className="rounded-xl border border-slate-300 px-3 py-2"
                      type="number"
                      value={point.y}
                      onChange={(event) => updateTopView(index, "y", event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="danger-button-compact self-end"
                    onClick={() =>
                      updateModelField(
                        "topView",
                        modelForm.topView.filter((_, pointIndex) => pointIndex !== index)
                      )
                    }
                  >
                    Remove point
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">
                  CG and weight limits
                </h4>
                <p className="saas-meta-text mt-1">
                  Enter the approved forward/aft CG boundary at each aircraft weight.
                </p>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  updateModelField("sideView", [
                    ...modelForm.sideView,
                    { clientKey: crypto.randomUUID(), x: "", y: "" },
                  ])
                }
              >
                Add limit point
              </button>
            </div>
            <div className="grid gap-3">
              {modelForm.sideView.map((point, index) => (
                <div
                  key={point.clientKey}
                  className="grid gap-3 rounded-2xl border border-[var(--border)] bg-white/80 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <label className="grid gap-2 text-sm">
                    <span>Forward/aft CG (in)</span>
                    <input
                      className="rounded-xl border border-slate-300 px-3 py-2"
                      type="number"
                      value={point.x}
                      onChange={(event) => updateSideView(index, "x", event.target.value)}
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Aircraft weight (lb)</span>
                    <input
                      className="rounded-xl border border-slate-300 px-3 py-2"
                      type="number"
                      value={point.y}
                      onChange={(event) => updateSideView(index, "y", event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="danger-button-compact self-end"
                    onClick={() =>
                      updateModelField(
                        "sideView",
                        modelForm.sideView.filter((_, pointIndex) => pointIndex !== index)
                      )
                    }
                  >
                    Remove point
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">
                Weight-and-balance limits
              </h4>
              <p className="saas-meta-text mt-1">
                Enter the approved CG boundary at each aircraft weight.
              </p>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                updateModelField("envelope", [
                  ...modelForm.envelope,
                  { clientKey: crypto.randomUUID(), cg: "", weight: "" },
                ])
              }
            >
              Add limit point
            </button>
          </div>
          <div className="grid gap-3">
            {modelForm.envelope.map((point, index) => (
              <div
                key={point.clientKey}
                className="grid gap-3 rounded-2xl border border-[var(--border)] bg-white/80 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
              >
                <label className="grid gap-2 text-sm">
                  <span>CG position (in)</span>
                  <input
                    className="rounded-xl border border-slate-300 px-3 py-2"
                    type="number"
                    value={point.cg}
                    onChange={(event) => updateEnvelope(index, "cg", event.target.value)}
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span>Aircraft weight (lb)</span>
                  <input
                    className="rounded-xl border border-slate-300 px-3 py-2"
                    type="number"
                    value={point.weight}
                    onChange={(event) => updateEnvelope(index, "weight", event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="danger-button-compact self-end"
                  onClick={() =>
                    updateModelField(
                      "envelope",
                      modelForm.envelope.filter((_, pointIndex) => pointIndex !== index)
                    )
                  }
                >
                  Remove point
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          className="primary-button"
          disabled={saving}
          onClick={() => void handleSaveModel()}
        >
          {saving ? "Saving..." : modelForm.id ? "Save changes" : "Add aircraft model"}
        </button>
      </div>
    </div>
  );

  const renderAircraftForm = () => (
    <div className="mt-6 rounded-2xl border border-[var(--border)] bg-white/85 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">
          {aircraftForm.id ? "Edit aircraft" : "Add aircraft"}
        </h3>
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            setAircraftForm(emptyAircraftForm);
            setShowAircraftForm(false);
          }}
        >
          Close
        </button>
      </div>

      <p className="saas-meta-text mt-3">
        Use the current weight-and-balance record for this aircraft. Nothing changes
        until you save.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm md:col-span-2">
          <span>Aircraft model</span>
          <select
            className="rounded-xl border border-slate-300 px-3 py-2"
            value={aircraftForm.model_id}
            onChange={(event) => updateAircraftField("model_id", event.target.value)}
          >
            <option value="">Select a model</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm md:col-span-2">
          <span>Registration / tail number</span>
          <input
            className="rounded-xl border border-slate-300 px-3 py-2"
            value={aircraftForm.name}
            onChange={(event) => updateAircraftField("name", event.target.value)}
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span>Basic empty weight (lb)</span>
          <input
            className="rounded-xl border border-slate-300 px-3 py-2"
            type="number"
            value={aircraftForm.empty_weight}
            onChange={(event) => updateAircraftField("empty_weight", event.target.value)}
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span>Empty-weight CG arm (in)</span>
          <input
            className="rounded-xl border border-slate-300 px-3 py-2"
            type="number"
            value={aircraftForm.empty_arm}
            onChange={(event) => updateAircraftField("empty_arm", event.target.value)}
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span>Empty-weight left/right arm (in, optional)</span>
          <input
            className="rounded-xl border border-slate-300 px-3 py-2"
            type="number"
            value={aircraftForm.empty_lat_arm}
            onChange={(event) => updateAircraftField("empty_lat_arm", event.target.value)}
          />
        </label>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          className="primary-button"
          disabled={saving}
          onClick={() => void handleSaveAircraft()}
        >
          {saving ? "Saving..." : aircraftForm.id ? "Save aircraft" : "Create aircraft"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="saas-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="saas-subsection-title">Aircraft Model Setup</h3>
              <p className="saas-meta-text mt-2">{models.length} saved</p>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowModelsModal(true)}
            >
              View and edit
            </button>
          </div>
        </section>

        <section className="saas-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="saas-subsection-title">Shared Aircraft Registry</h3>
              <p className="saas-meta-text mt-2">{aircraft.length} aircraft</p>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowAircraftModal(true)}
            >
              Manage
            </button>
          </div>
        </section>

        <section className="saas-panel md:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="saas-subsection-title">Pending Aircraft Updates</h3>
              <p className="saas-meta-text mt-2">
                {updateRequests.filter((request) => request.status === "pending").length} pending
              </p>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowRequestsModal(true)}
            >
              Review
            </button>
          </div>
        </section>
      </div>

      {status ? <p className="saas-meta-text">{status}</p> : null}

      {showModelsModal && portalRoot
        ? createPortal(
            <div className="Overlay" onClick={() => setShowModelsModal(false)}>
              <div className="Modal" onClick={(event) => event.stopPropagation()}>
                <div className="tools-child-shell flex h-full min-h-0 flex-col">
                  <div className="tools-child-header">
                    <div>
                      <p className="saas-kicker">Admin</p>
                      <h2 className="tools-child-title">Aircraft Model Setup</h2>
                    </div>
                    <div className="tools-child-actions">
                      <button type="button" className="ghost-button" onClick={() => openModelEditor()}>
                        Add aircraft model
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setShowModelsModal(false)}
                      >
                        Close
                      </button>
                    </div>
                  </div>

                  <div
                    ref={modelsScrollRef}
                    className="mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]"
                  >
                    <div className="grid gap-3">
                      {models.map((model) => (
                        <div key={model.id} id={`model-editor-${model.id}`}>
                          <div className="rounded-2xl border border-[var(--border)] bg-white/80 px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{model.name}</p>
                                <p className="saas-meta-text">
                                  {model.category === "helicopter" ? "Helicopter" : "Airplane"}
                                  {" · Typical fuel burn: "}
                                  {typeof model.avg_fuel_burn_rate === "number"
                                    ? `${model.avg_fuel_burn_rate} gal/hr`
                                    : "not entered"}
                                </p>
                              </div>
                              <div className="flex flex-wrap justify-end gap-2">
                                <button
                                  type="button"
                                  className="ghost-button"
                                  onClick={() => openModelEditor(normalizeModelForm(model))}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="danger-button-compact"
                                  disabled={saving}
                                  onClick={() => void handleDeleteModel(model.id)}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>

                          {showModelForm && modelForm.id === model.id ? renderModelForm() : null}
                        </div>
                      ))}

                      {showModelForm && !modelForm.id ? (
                        <div id="model-editor-new">{renderModelForm()}</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            portalRoot
          )
        : null}

      {showAircraftModal && portalRoot
        ? createPortal(
            <div className="Overlay" onClick={() => setShowAircraftModal(false)}>
              <div className="Modal" onClick={(event) => event.stopPropagation()}>
                <div className="tools-child-shell flex h-full min-h-0 flex-col">
                  <div className="tools-child-header">
                    <div>
                      <p className="saas-kicker">Admin</p>
                      <h2 className="tools-child-title">Aircraft Registry</h2>
                    </div>
                    <div className="tools-child-actions">
                      <button type="button" className="ghost-button" onClick={() => openAircraftEditor()}>
                        Add aircraft
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setShowAircraftModal(false)}
                      >
                        Close
                      </button>
                    </div>
                  </div>

                  <div
                    ref={aircraftScrollRef}
                    className="mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]"
                  >
                    <div className="grid gap-3">
                      {aircraft.map((item) => (
                        <div key={item.id} id={`aircraft-editor-${item.id}`}>
                          <div className="rounded-2xl border border-[var(--border)] bg-white/80 px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {item.tail_number ?? item.name}
                                </p>
                                <p className="saas-meta-text">
                                  {modelNameById.get(item.model_id ?? "") ?? item.model?.name ?? "Model"} · Empty{" "}
                                  {item.empty_weight ?? "--"} lbs
                                </p>
                                <p className="saas-meta-text mt-1">
                                  {item.visibility === "private" ? "Your private aircraft" : "Shared platform aircraft"}
                                  {organizationAssignments.filter((assignment) => assignment.aircraft_id === item.id).length > 0
                                    ? ` · ${organizationAssignments.filter((assignment) => assignment.aircraft_id === item.id).length} organization assignment(s)`
                                    : ""}
                                </p>
                              </div>
                              <div className="flex flex-wrap justify-end gap-2">
                                {item.visibility === "shared" ? <button
                                  type="button"
                                  className="ghost-button"
                                  disabled={saving}
                                  onClick={() => void handleMakeAircraftPrivate(item.id)}
                                >
                                  Make private
                                </button> : null}
                                {item.visibility === "private" && item.owner_user_id === session?.user?.id ? (
                                  <button
                                    type="button"
                                    className="ghost-button"
                                    disabled={saving}
                                    onClick={() => openOrganizationAssignments(item)}
                                  >
                                    Organizations
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="ghost-button"
                                  onClick={() => openAircraftEditor(normalizeAircraftForm(item))}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="danger-button-compact"
                                  disabled={saving}
                                  onClick={() => void handleDeleteAircraft(item.id)}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>

                          {assigningAircraftId === item.id ? (
                            <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
                              <h3 className="text-sm font-semibold text-slate-900">Organization access</h3>
                              <p className="saas-meta-text mt-1">
                                Select every organization that may use {item.tail_number}. The aircraft remains private to your account.
                              </p>
                              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                {organizations.map((organization) => (
                                  <label key={organization.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                                    <input
                                      type="checkbox"
                                      className="mt-0.5"
                                      checked={selectedOrganizationIds.includes(organization.id)}
                                      onChange={() => toggleOrganizationAssignment(organization.id)}
                                    />
                                    <span>
                                      <span className="block font-medium text-slate-900">{organization.name}</span>
                                      <span className="block text-xs text-slate-500">Owner: {organization.owner_display_name || organization.owner_email || "Unavailable"}</span>
                                    </span>
                                  </label>
                                ))}
                              </div>
                              {organizations.length === 0 ? <p className="saas-meta-text mt-3">No organizations are available.</p> : null}
                              <div className="mt-4 flex flex-wrap gap-2">
                                <button type="button" className="primary-button" disabled={saving} onClick={() => void handleSaveOrganizationAssignments()}>
                                  {saving ? "Saving..." : "Save organization access"}
                                </button>
                                <button type="button" className="ghost-button" disabled={saving} onClick={() => { setAssigningAircraftId(""); setSelectedOrganizationIds([]); }}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {showAircraftForm && aircraftForm.id === item.id ? renderAircraftForm() : null}
                        </div>
                      ))}

                      {showAircraftForm && !aircraftForm.id ? (
                        <div id="aircraft-editor-new">{renderAircraftForm()}</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            portalRoot
          )
        : null}

      {showRequestsModal && portalRoot
        ? createPortal(
            <div className="Overlay" onClick={() => setShowRequestsModal(false)}>
              <div className="Modal" onClick={(event) => event.stopPropagation()}>
                <div className="tools-child-shell flex h-full min-h-0 flex-col">
                  <div className="tools-child-header">
                    <div>
                      <p className="saas-kicker">Admin</p>
                      <h2 className="tools-child-title">Pending Aircraft Updates</h2>
                    </div>
                    <div className="tools-child-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setShowRequestsModal(false)}
                      >
                        Close
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]">
                    <div className="grid gap-3">
                      {updateRequests.filter((request) => request.status === "pending").length === 0 ? (
                        <div className="rounded-2xl border border-[var(--border)] bg-white/80 px-4 py-3">
                          <p className="text-sm font-medium text-slate-900">No pending requests.</p>
                          <p className="saas-meta-text mt-1">
                            Submitted W&B conflicts will appear here for admin review.
                          </p>
                        </div>
                      ) : null}

                      {updateRequests
                        .filter((request) => request.status === "pending")
                        .map((request) => (
                          <div
                            key={request.id}
                            className="rounded-2xl border border-[var(--border)] bg-white/80 px-4 py-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {request.aircraft_tail_number}
                                </p>
                                <p className="saas-meta-text mt-1">
                                  Submitted by {request.submitted_by_label} ·{" "}
                                  {request.created_at
                                    ? new Date(request.created_at).toLocaleString()
                                    : "Unknown time"}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="ghost-button"
                                  disabled={saving}
                                  onClick={() => void handleApproveRequest(request)}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="danger-button-compact"
                                  disabled={saving}
                                  onClick={() => void handleRejectRequest(request)}
                                >
                                  Reject
                                </button>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              <div className="rounded-2xl border border-[var(--border)] bg-white/85 p-3">
                                <p className="saas-meta-text">Current shared values</p>
                                <p className="mt-2 text-sm text-slate-900">
                                  Empty weight: {request.current_empty_weight ?? "--"} lbs
                                </p>
                                <p className="mt-1 text-sm text-slate-900">
                                  Empty arm: {request.current_empty_arm ?? "--"}
                                </p>
                                <p className="mt-1 text-sm text-slate-900">
                                  Empty lat arm: {request.current_empty_lat_arm ?? "--"}
                                </p>
                              </div>

                              <div className="rounded-2xl border border-[var(--border)] bg-white/85 p-3">
                                <p className="saas-meta-text">Proposed values</p>
                                <p className="mt-2 text-sm text-slate-900">
                                  Empty weight: {request.proposed_empty_weight ?? "--"} lbs
                                </p>
                                <p className="mt-1 text-sm text-slate-900">
                                  Empty arm: {request.proposed_empty_arm ?? "--"}
                                </p>
                                <p className="mt-1 text-sm text-slate-900">
                                  Empty lat arm: {request.proposed_empty_lat_arm ?? "--"}
                                </p>
                              </div>
                            </div>

                            {request.note ? (
                              <p className="saas-meta-text mt-3">Note: {request.note}</p>
                            ) : null}
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            portalRoot
          )
        : null}
    </>
  );
}
