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
  fetchAircraftModels,
  fetchAircraftUpdateRequests,
  fetchSharedAircraft,
  makeAircraftPrivateForUser,
  rejectAircraftUpdateRequest,
  parseAircraftEnvelopeSet,
  parseAircraftStations,
  saveCurrentAircraftForUser,
  updateAircraft,
  updateAircraftModel,
  type AircraftModelRecord,
  type AircraftRecord,
  type AircraftUpdateRequestRecord,
} from "@/lib/aircraft";
import { fetchCurrentProfile } from "@/lib/profile";

type ModelStationDraft = {
  id: string;
  name: string;
  arm: string;
  latArm: string;
  weightPerGallon: string;
  fixedWeight: string;
  maxWeight: string;
};

type EnvelopePointDraft = {
  cg: string;
  weight: string;
};

type PolygonPointDraft = {
  x: string;
  y: string;
};

type ModelFormState = {
  id: string | null;
  name: string;
  category: "airplane" | "helicopter";
  avg_fuel_burn_rate: string;
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
  stations: [{ id: "", name: "", arm: "", latArm: "", weightPerGallon: "", fixedWeight: "", maxWeight: "" }],
  envelope: [
    { cg: "", weight: "" },
    { cg: "", weight: "" },
    { cg: "", weight: "" },
  ],
  topView: [
    { x: "", y: "" },
    { x: "", y: "" },
    { x: "", y: "" },
  ],
  sideView: [
    { x: "", y: "" },
    { x: "", y: "" },
    { x: "", y: "" },
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
    stations:
      stations.length > 0
        ? stations.map((station) => ({
            id: station.id,
            name: station.name,
            arm: String(station.arm),
            latArm: station.latArm != null ? String(station.latArm) : "",
            weightPerGallon: station.weightPerGallon != null ? String(station.weightPerGallon) : "",
            fixedWeight: station.fixedWeight != null ? String(station.fixedWeight) : "",
            maxWeight: station.maxWeight != null ? String(station.maxWeight) : "",
          }))
        : emptyModelForm.stations,
    envelope:
      envelope.length > 0
        ? envelope.map((point) => ({
            cg: String(point.cg),
            weight: String(point.weight),
          }))
        : emptyModelForm.envelope,
    topView:
      envelopeSet.topView.length > 0
        ? envelopeSet.topView.map((point) => ({
            x: String(point.x),
            y: String(point.y),
          }))
        : emptyModelForm.topView,
    sideView:
      envelopeSet.sideView.length > 0
        ? envelopeSet.sideView.map((point) => ({
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

export default function AircraftAdminPanel() {
  const { session } = useAuthSession();
  const [profileRole, setProfileRole] = useState("");
  const [models, setModels] = useState<AircraftModelRecord[]>([]);
  const [aircraft, setAircraft] = useState<AircraftRecord[]>([]);
  const [updateRequests, setUpdateRequests] = useState<AircraftUpdateRequestRecord[]>([]);
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
      const [modelResult, aircraftResult, requestResult] = await Promise.allSettled([
        fetchAircraftModels(),
        fetchSharedAircraft(),
        fetchAircraftUpdateRequests(),
      ]);

      if (cancelledState) {
        return;
      }

      if (modelResult.status === "fulfilled") {
        setModels(modelResult.value);
      }

      if (aircraftResult.status === "fulfilled") {
        setAircraft(aircraftResult.value);
      }

      if (requestResult.status === "fulfilled") {
        setUpdateRequests(requestResult.value);
      }

      if (
        modelResult.status === "rejected" ||
        aircraftResult.status === "rejected" ||
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
    const [modelResult, aircraftResult, requestResult] = await Promise.allSettled([
      fetchAircraftModels(),
      fetchSharedAircraft(),
      fetchAircraftUpdateRequests(),
    ]);

    if (modelResult.status === "fulfilled") {
      setModels(modelResult.value);
    }

    if (aircraftResult.status === "fulfilled") {
      setAircraft(aircraftResult.value);
    }

    if (requestResult.status === "fulfilled") {
      setUpdateRequests(requestResult.value);
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
        };
      });

    if (stations.length < 1) {
      setStatus("Add at least one station.");
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
          {modelForm.id ? "Edit model" : "Add model"}
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
        Changes here update saved aircraft model data after you save.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm">
          <span>Name</span>
          <input
            className="rounded-xl border border-slate-300 px-3 py-2"
            value={modelForm.name}
            onChange={(event) => updateModelField("name", event.target.value)}
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span>Category</span>
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
          <span>Average fuel burn rate (GPH)</span>
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
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-slate-900">Stations</h4>
          <button
            type="button"
            className="ghost-button"
            onClick={() =>
              updateModelField("stations", [
                ...modelForm.stations,
                { id: "", name: "", arm: "", latArm: "", weightPerGallon: "", fixedWeight: "", maxWeight: "" },
              ])
            }
          >
            Add station
          </button>
        </div>
        <div className="grid gap-3">
          {modelForm.stations.map((station, index) => (
            <div
              key={`${station.id}-${index}`}
              className="grid gap-3 rounded-2xl border border-[var(--border)] bg-white/80 p-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto]"
            >
              <label className="grid gap-2 text-sm">
                <span>Key</span>
                <input
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  value={station.id}
                  onChange={(event) => updateStation(index, "id", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span>Name</span>
                <input
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  value={station.name}
                  onChange={(event) => updateStation(index, "name", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span>Long arm</span>
                <input
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  type="number"
                  value={station.arm}
                  onChange={(event) => updateStation(index, "arm", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span>Lat arm</span>
                <input
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  type="number"
                  value={station.latArm}
                  onChange={(event) => updateStation(index, "latArm", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span>Weight / gallon</span>
                <input
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  type="number"
                  value={station.weightPerGallon}
                  onChange={(event) => updateStation(index, "weightPerGallon", event.target.value)}
                  placeholder={/fuel/i.test(station.id) || /fuel/i.test(station.name) ? "6" : ""}
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span>Fixed weight</span>
                <input
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  type="number"
                  value={station.fixedWeight}
                  onChange={(event) => updateStation(index, "fixedWeight", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span>Max weight</span>
                <input
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  type="number"
                  value={station.maxWeight}
                  onChange={(event) => updateStation(index, "maxWeight", event.target.value)}
                />
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
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      {modelForm.category === "helicopter" ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-slate-900">Top view envelope</h4>
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  updateModelField("topView", [
                    ...modelForm.topView,
                    { x: "", y: "" },
                  ])
                }
              >
                Add point
              </button>
            </div>
            <div className="grid gap-3">
              {modelForm.topView.map((point, index) => (
                <div
                  key={`top-${point.x}-${point.y}-${index}`}
                  className="grid gap-3 rounded-2xl border border-[var(--border)] bg-white/80 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <label className="grid gap-2 text-sm">
                    <span>Longitudinal CG</span>
                    <input
                      className="rounded-xl border border-slate-300 px-3 py-2"
                      type="number"
                      value={point.x}
                      onChange={(event) => updateTopView(index, "x", event.target.value)}
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Lateral CG</span>
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
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-slate-900">Side view envelope</h4>
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  updateModelField("sideView", [
                    ...modelForm.sideView,
                    { x: "", y: "" },
                  ])
                }
              >
                Add point
              </button>
            </div>
            <div className="grid gap-3">
              {modelForm.sideView.map((point, index) => (
                <div
                  key={`side-${point.x}-${point.y}-${index}`}
                  className="grid gap-3 rounded-2xl border border-[var(--border)] bg-white/80 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <label className="grid gap-2 text-sm">
                    <span>Longitudinal CG</span>
                    <input
                      className="rounded-xl border border-slate-300 px-3 py-2"
                      type="number"
                      value={point.x}
                      onChange={(event) => updateSideView(index, "x", event.target.value)}
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Weight</span>
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
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-slate-900">Envelope</h4>
            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                updateModelField("envelope", [
                  ...modelForm.envelope,
                  { cg: "", weight: "" },
                ])
              }
            >
              Add point
            </button>
          </div>
          <div className="grid gap-3">
            {modelForm.envelope.map((point, index) => (
              <div
                key={`${point.cg}-${point.weight}-${index}`}
                className="grid gap-3 rounded-2xl border border-[var(--border)] bg-white/80 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
              >
                <label className="grid gap-2 text-sm">
                  <span>CG</span>
                  <input
                    className="rounded-xl border border-slate-300 px-3 py-2"
                    type="number"
                    value={point.cg}
                    onChange={(event) => updateEnvelope(index, "cg", event.target.value)}
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span>Weight</span>
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
                  Remove
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
          {saving ? "Saving..." : modelForm.id ? "Save model" : "Create model"}
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
        Changes here update saved aircraft data after you save.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm md:col-span-2">
          <span>Model</span>
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
          <span>Tail number</span>
          <input
            className="rounded-xl border border-slate-300 px-3 py-2"
            value={aircraftForm.name}
            onChange={(event) => updateAircraftField("name", event.target.value)}
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span>Empty weight</span>
          <input
            className="rounded-xl border border-slate-300 px-3 py-2"
            type="number"
            value={aircraftForm.empty_weight}
            onChange={(event) => updateAircraftField("empty_weight", event.target.value)}
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span>Empty arm</span>
          <input
            className="rounded-xl border border-slate-300 px-3 py-2"
            type="number"
            value={aircraftForm.empty_arm}
            onChange={(event) => updateAircraftField("empty_arm", event.target.value)}
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span>Empty lat arm</span>
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
              <h3 className="saas-subsection-title">Aircraft Models</h3>
              <p className="saas-meta-text mt-2">{models.length} saved</p>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowModelsModal(true)}
            >
              Manage
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
                      <h2 className="tools-child-title">Aircraft Models</h2>
                    </div>
                    <div className="tools-child-actions">
                      <button type="button" className="ghost-button" onClick={() => openModelEditor()}>
                        Add model
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
                                  {model.category ?? "Aircraft"} model · Avg burn{" "}
                                  {typeof model.avg_fuel_burn_rate === "number"
                                    ? `${model.avg_fuel_burn_rate} GPH`
                                    : "--"}
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
                      <h2 className="tools-child-title">Shared Aircraft Registry</h2>
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
                              </div>
                              <div className="flex flex-wrap justify-end gap-2">
                                <button
                                  type="button"
                                  className="ghost-button"
                                  disabled={saving}
                                  onClick={() => void handleMakeAircraftPrivate(item.id)}
                                >
                                  Make private
                                </button>
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
