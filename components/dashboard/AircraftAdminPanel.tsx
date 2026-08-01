"use client";

import { useEffect, useMemo, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import {
  AdminDataTable,
  AdminPageHeader,
  CompactButton,
  CompactToolbar,
  DetailDrawer,
  EmptyState,
  StatusBadge,
  WorksheetCell,
  WorksheetGrid,
  WorksheetHeader,
  worksheetInputClass,
} from "@/components/admin/AdminConsole";
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
  inferAircraftStationKind,
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
  type AircraftStationKind,
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
  kind: AircraftStationKind;
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

type ModelFormErrors = Record<string, string>;
type AircraftFormErrors = Record<keyof Omit<AircraftFormState, "id">, string>;

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
    kind: "seat",
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
            kind: station.kind,
            arm: String(station.arm),
            latArm: station.latArm != null ? String(station.latArm) : "",
            weightPerGallon: station.weightPerGallon != null ? String(station.weightPerGallon) : "",
            fixedWeight: station.fixedWeight != null ? String(station.fixedWeight) : "",
            maxWeight:
              station.maxWeight != null &&
              station.kind === "fuel" &&
              station.weightPerGallon != null &&
              station.weightPerGallon > 0
                ? String(station.maxWeight / station.weightPerGallon)
                : station.maxWeight != null
                  ? String(station.maxWeight)
                  : "",
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

function isValidNumber(value: string) {
  return value.trim() !== "" && Number.isFinite(Number(value));
}

function getUniqueStationId(
  station: ModelStationDraft,
  stationIndex: number,
  usedIds: Set<string>
) {
  const baseId =
    station.id.trim() ||
    station.name
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") ||
    `loading-location-${stationIndex + 1}`;
  let candidate = baseId;
  let suffix = 2;

  while (usedIds.has(candidate.toLowerCase())) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate.toLowerCase());
  return candidate;
}

function validateOptionalNumber(
  errors: ModelFormErrors,
  key: string,
  value: string,
  message: string,
  options: { positive?: boolean; nonNegative?: boolean } = {}
) {
  if (!value.trim()) {
    return;
  }

  const parsed = Number(value);
  if (
    !Number.isFinite(parsed) ||
    (options.positive && parsed <= 0) ||
    (options.nonNegative && parsed < 0)
  ) {
    errors[key] = message;
  }
}

function validateModelForm(modelForm: ModelFormState) {
  const errors: ModelFormErrors = {};

  if (!modelForm.name.trim()) {
    errors["model.name"] = "Enter the aircraft model name.";
  }

  validateOptionalNumber(
    errors,
    "model.avg_fuel_burn_rate",
    modelForm.avg_fuel_burn_rate,
    "Enter a fuel burn greater than 0.",
    { positive: true }
  );
  validateOptionalNumber(
    errors,
    "model.max_weight",
    modelForm.max_weight,
    "Enter a maximum weight greater than 0.",
    { positive: true }
  );

  const usedStationIds = new Map<string, string>();
  let completeStationCount = 0;

  for (const station of modelForm.stations) {
    const prefix = `station.${station.clientKey}`;
    const hasContent = [
      station.id,
      station.name,
      station.arm,
      station.latArm,
      station.weightPerGallon,
      station.fixedWeight,
      station.maxWeight,
      station.crewRole,
    ].some((value) => value.trim() !== "");

    if (!hasContent) {
      continue;
    }

    if (!station.name.trim()) {
      errors[`${prefix}.name`] = "Enter a name for this loading location.";
    }
    if (!isValidNumber(station.arm)) {
      errors[`${prefix}.arm`] = "Enter the arm from the aircraft datum.";
    }

    validateOptionalNumber(
      errors,
      `${prefix}.latArm`,
      station.latArm,
      "Enter a valid left/right arm."
    );
    validateOptionalNumber(
      errors,
      `${prefix}.weightPerGallon`,
      station.weightPerGallon,
      "Enter a fuel weight greater than 0.",
      { positive: true }
    );
    validateOptionalNumber(
      errors,
      `${prefix}.fixedWeight`,
      station.fixedWeight,
      "Enter 0 or a positive weight.",
      { nonNegative: true }
    );
    validateOptionalNumber(
      errors,
      `${prefix}.maxWeight`,
      station.maxWeight,
      "Enter 0 or a positive weight.",
      { nonNegative: true }
    );

    const normalizedId = station.id.trim().toLowerCase();
    if (normalizedId) {
      const existingKey = usedStationIds.get(normalizedId);
      if (existingKey) {
        errors[`${prefix}.id`] = "Use a different short name for each loading location.";
        errors[existingKey] = "Use a different short name for each loading location.";
      } else {
        usedStationIds.set(normalizedId, `${prefix}.id`);
      }
    }

    if (
      station.name.trim() &&
      isValidNumber(station.arm) &&
      !Object.keys(errors).some((key) => key.startsWith(`${prefix}.`))
    ) {
      completeStationCount += 1;
    }
  }

  if (completeStationCount < 1) {
    errors.stations = "Add at least one complete loading location.";
  }

  const validatePoints = <T extends { clientKey: string }>(
    points: T[],
    sectionKey: string,
    fields: Array<{ key: keyof T; label: string }>,
    minimum: number,
    required: boolean
  ) => {
    let completeCount = 0;
    let hasAnyContent = false;

    for (const point of points) {
      const prefix = `${sectionKey}.${point.clientKey}`;
      const values = fields.map(({ key }) => String(point[key] ?? ""));
      const rowHasContent = values.some((value) => value.trim() !== "");
      hasAnyContent ||= rowHasContent;

      if (!rowHasContent) {
        continue;
      }

      fields.forEach(({ key, label }, fieldIndex) => {
        if (!isValidNumber(values[fieldIndex])) {
          errors[`${prefix}.${String(key)}`] = `Enter a valid ${label}.`;
        }
      });

      if (values.every(isValidNumber)) {
        completeCount += 1;
      }
    }

    if ((required || hasAnyContent) && completeCount < minimum) {
      errors[sectionKey] = `Enter at least ${minimum} complete limit points.`;
    }
  };

  if (modelForm.category === "helicopter") {
    validatePoints(
      modelForm.topView,
      "topView",
      [
        { key: "x", label: "forward/aft CG" },
        { key: "y", label: "left/right CG" },
      ],
      3,
      true
    );
    validatePoints(
      modelForm.sideView,
      "sideView",
      [
        { key: "x", label: "forward/aft CG" },
        { key: "y", label: "aircraft weight" },
      ],
      3,
      false
    );
  } else {
    validatePoints(
      modelForm.envelope,
      "envelope",
      [
        { key: "cg", label: "CG position" },
        { key: "weight", label: "aircraft weight" },
      ],
      3,
      true
    );
  }

  return errors;
}

function validateAircraftForm(
  aircraftForm: AircraftFormState,
  models: AircraftModelRecord[],
  aircraft: AircraftRecord[]
) {
  const errors: Partial<AircraftFormErrors> = {};
  const tailNumber = aircraftForm.name.trim().toUpperCase();

  if (!aircraftForm.model_id) {
    errors.model_id = "Choose the aircraft model.";
  }

  if (!tailNumber) {
    errors.name = "Enter the registration or tail number.";
  } else {
    const duplicate = aircraft.some(
      (item) =>
        item.id !== aircraftForm.id &&
        String(item.tail_number ?? item.name ?? "")
          .trim()
          .toUpperCase() === tailNumber
    );
    if (duplicate) {
      errors.name = "This aircraft is already in the fleet.";
    }
  }

  const emptyWeight = Number(aircraftForm.empty_weight);
  if (!isValidNumber(aircraftForm.empty_weight) || emptyWeight <= 0) {
    errors.empty_weight = "Enter a basic empty weight greater than 0.";
  }

  if (!isValidNumber(aircraftForm.empty_arm)) {
    errors.empty_arm = "Enter the empty-weight arm from the aircraft datum.";
  }

  if (
    aircraftForm.empty_lat_arm.trim() &&
    !isValidNumber(aircraftForm.empty_lat_arm)
  ) {
    errors.empty_lat_arm = "Enter a valid left/right arm or leave it blank.";
  }

  const selectedModel = models.find((model) => model.id === aircraftForm.model_id);
  if (
    selectedModel?.max_weight != null &&
    Number.isFinite(emptyWeight) &&
    emptyWeight > selectedModel.max_weight
  ) {
    errors.empty_weight = `Basic empty weight cannot exceed this model's ${selectedModel.max_weight.toLocaleString()} lb maximum weight.`;
  }

  return errors;
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
  const [modelErrors, setModelErrors] = useState<ModelFormErrors>({});
  const [aircraftForm, setAircraftForm] = useState<AircraftFormState>(emptyAircraftForm);
  const [aircraftErrors, setAircraftErrors] = useState<Partial<AircraftFormErrors>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [showModelForm, setShowModelForm] = useState(false);
  const [showAircraftForm, setShowAircraftForm] = useState(false);

  const isAdmin = profileRole === "admin";

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
  const selectedAircraftModel = useMemo(
    () => models.find((model) => model.id === aircraftForm.model_id) ?? null,
    [aircraftForm.model_id, models]
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
    setModelErrors({});
    setShowModelForm(true);
  }

  function openAircraftEditor(nextForm = emptyAircraftForm) {
    setAircraftForm(nextForm);
    setAircraftErrors({});
    setShowAircraftForm(true);
  }

  function updateModelField<K extends keyof ModelFormState>(key: K, value: ModelFormState[K]) {
    setModelForm((current) => ({ ...current, [key]: value }));
    setModelErrors((current) => {
      const next = { ...current };
      delete next[`model.${String(key)}`];
      const sectionKey =
        key === "stations" || key === "envelope" || key === "topView" || key === "sideView"
          ? key
          : null;
      if (sectionKey) {
        for (const errorKey of Object.keys(next)) {
          if (errorKey === sectionKey || errorKey.startsWith(`${sectionKey}.`)) {
            delete next[errorKey];
          }
        }
      }
      if (key === "category") {
        for (const errorKey of Object.keys(next)) {
          if (
            errorKey === "envelope" ||
            errorKey.startsWith("envelope.") ||
            errorKey === "topView" ||
            errorKey.startsWith("topView.") ||
            errorKey === "sideView" ||
            errorKey.startsWith("sideView.")
          ) {
            delete next[errorKey];
          }
        }
      }
      return next;
    });
  }

  function updateAircraftField<K extends keyof AircraftFormState>(
    key: K,
    value: AircraftFormState[K]
  ) {
    setAircraftForm((current) => ({ ...current, [key]: value }));
    if (key !== "id") {
      setAircraftErrors((current) => {
        const next = { ...current };
        delete next[key as keyof AircraftFormErrors];
        return next;
      });
    }
  }

  function updateStation(index: number, key: keyof ModelStationDraft, value: string) {
    const stationKey = modelForm.stations[index]?.clientKey;
    setModelForm((current) => ({
      ...current,
      stations: current.stations.map((station, stationIndex) =>
        stationIndex === index ? { ...station, [key]: value } : station
      ),
    }));
    if (stationKey) {
      setModelErrors((current) => {
        const next = { ...current };
        delete next[`station.${stationKey}.${String(key)}`];
        delete next.stations;
        return next;
      });
    }
  }

  function updateEnvelope(index: number, key: keyof EnvelopePointDraft, value: string) {
    const pointKey = modelForm.envelope[index]?.clientKey;
    setModelForm((current) => ({
      ...current,
      envelope: current.envelope.map((point, pointIndex) =>
        pointIndex === index ? { ...point, [key]: value } : point
      ),
    }));
    if (pointKey) {
      setModelErrors((current) => {
        const next = { ...current };
        delete next[`envelope.${pointKey}.${String(key)}`];
        delete next.envelope;
        return next;
      });
    }
  }

  function updateTopView(index: number, key: keyof PolygonPointDraft, value: string) {
    const pointKey = modelForm.topView[index]?.clientKey;
    setModelForm((current) => ({
      ...current,
      topView: current.topView.map((point, pointIndex) =>
        pointIndex === index ? { ...point, [key]: value } : point
      ),
    }));
    if (pointKey) {
      setModelErrors((current) => {
        const next = { ...current };
        delete next[`topView.${pointKey}.${String(key)}`];
        delete next.topView;
        return next;
      });
    }
  }

  function updateSideView(index: number, key: keyof PolygonPointDraft, value: string) {
    const pointKey = modelForm.sideView[index]?.clientKey;
    setModelForm((current) => ({
      ...current,
      sideView: current.sideView.map((point, pointIndex) =>
        pointIndex === index ? { ...point, [key]: value } : point
      ),
    }));
    if (pointKey) {
      setModelErrors((current) => {
        const next = { ...current };
        delete next[`sideView.${pointKey}.${String(key)}`];
        delete next.sideView;
        return next;
      });
    }
  }

  async function handleSaveModel() {
    if (!isAdmin) {
      return;
    }

    const validationErrors = validateModelForm(modelForm);
    if (Object.keys(validationErrors).length > 0) {
      setModelErrors(validationErrors);
      setStatus("Review the highlighted aircraft model fields.");
      window.requestAnimationFrame(() => {
        const firstInvalidField = document.querySelector<HTMLElement>("[aria-invalid='true']");
        firstInvalidField?.focus({ preventScroll: false });
      });
      return;
    }

    const usedStationIds = new Set<string>();
    const stations = modelForm.stations
      .filter((station) => station.name.trim() && station.arm.trim())
      .map((station, stationIndex) => {
        const weightPerGallon =
          toOptionalNumber(station.weightPerGallon) ??
          (/fuel/i.test(station.id) || /fuel/i.test(station.name) ? 6 : null);

        return {
          id: getUniqueStationId(station, stationIndex, usedStationIds),
          name: station.name.trim(),
          kind: station.kind || inferAircraftStationKind({
            ...station,
            kind: undefined,
            weightPerGallon,
          }),
          arm: toNumber(station.arm),
          latArm: toOptionalNumber(station.latArm),
          weightPerGallon,
          fixedWeight: toOptionalNumber(station.fixedWeight),
          maxWeight:
            station.kind === "fuel" &&
            toOptionalNumber(station.maxWeight) != null &&
            weightPerGallon != null
              ? Number(toOptionalNumber(station.maxWeight)) * weightPerGallon
              : toOptionalNumber(station.maxWeight),
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
      setModelErrors({});
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

    const validationErrors = validateAircraftForm(aircraftForm, models, aircraft);
    if (Object.keys(validationErrors).length > 0) {
      setAircraftErrors(validationErrors);
      setStatus("Review the highlighted aircraft fields.");
      window.requestAnimationFrame(() => {
        const editor = document.getElementById(
          aircraftForm.id ? `aircraft-editor-${aircraftForm.id}` : "aircraft-editor-new"
        );
        editor?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus({
          preventScroll: false,
        });
      });
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
      setAircraftErrors({});
      setShowAircraftForm(false);
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to save aircraft right now."));
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
      setStatus(`Approved the weight-and-balance update for ${request.aircraft_tail_number}.`);
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
      setStatus(`Rejected the weight-and-balance update for ${request.aircraft_tail_number}.`);
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
    return <div className="saas-panel">Platform administrator access is required.</div>;
  }

  const renderCompactModelForm = () => {
    const controlClass = (error?: string) =>
      `${worksheetInputClass} ${
        error ? "bg-rose-50 text-rose-900 ring-1 ring-inset ring-rose-500" : ""
      }`;
    const stationGroups: Array<{
      kind: AircraftStationKind;
      title: string;
      itemLabel: string;
    }> = [
      { kind: "seat", title: "Seats", itemLabel: "Seat" },
      { kind: "fuel", title: "Fuel tanks", itemLabel: "Tank" },
      { kind: "baggage", title: "Baggage / cargo", itemLabel: "Area" },
      { kind: "equipment", title: "Installed equipment", itemLabel: "Item" },
    ];

    const addStation = (kind: AircraftStationKind) => {
      updateModelField("stations", [
        ...modelForm.stations,
        {
          clientKey: crypto.randomUUID(),
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
        },
      ]);
    };

    return (
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSaveModel();
        }}
      >
        {Object.keys(modelErrors).length > 0 ? (
          <div
            className="border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900"
            role="alert"
          >
            <p className="font-semibold">Check the highlighted cells.</p>
            <ul className="mt-1 list-disc pl-4">
              {Array.from(new Set(Object.values(modelErrors))).slice(0, 5).map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <WorksheetGrid label="Aircraft model details" minWidth={720}>
          <thead>
            <tr>
              <WorksheetHeader>Model</WorksheetHeader>
              <WorksheetHeader>Aircraft type</WorksheetHeader>
              <WorksheetHeader>Fuel burn (gph)</WorksheetHeader>
              <WorksheetHeader>Max takeoff (lb)</WorksheetHeader>
            </tr>
          </thead>
          <tbody>
            <tr>
              <WorksheetCell>
                <input
                  autoFocus
                  required
                  aria-label="Aircraft model name"
                  aria-invalid={Boolean(modelErrors["model.name"])}
                  className={controlClass(modelErrors["model.name"])}
                  value={modelForm.name}
                  onChange={(event) => updateModelField("name", event.target.value)}
                  placeholder="Cessna 172S"
                />
              </WorksheetCell>
              <WorksheetCell>
                <select
                  aria-label="Aircraft type"
                  className={worksheetInputClass}
                  value={modelForm.category}
                  onChange={(event) =>
                    updateModelField(
                      "category",
                      event.target.value as ModelFormState["category"]
                    )
                  }
                >
                  <option value="airplane">Airplane</option>
                  <option value="helicopter">Helicopter</option>
                </select>
              </WorksheetCell>
              <WorksheetCell>
                <input
                  aria-label="Typical fuel burn in gallons per hour"
                  aria-invalid={Boolean(modelErrors["model.avg_fuel_burn_rate"])}
                  className={controlClass(modelErrors["model.avg_fuel_burn_rate"])}
                  type="number"
                  min="0"
                  step="any"
                  value={modelForm.avg_fuel_burn_rate}
                  onChange={(event) =>
                    updateModelField("avg_fuel_burn_rate", event.target.value)
                  }
                />
              </WorksheetCell>
              <WorksheetCell>
                <input
                  aria-label="Maximum takeoff weight in pounds"
                  aria-invalid={Boolean(modelErrors["model.max_weight"])}
                  className={controlClass(modelErrors["model.max_weight"])}
                  type="number"
                  min="0"
                  step="any"
                  value={modelForm.max_weight}
                  onChange={(event) => updateModelField("max_weight", event.target.value)}
                />
              </WorksheetCell>
            </tr>
          </tbody>
        </WorksheetGrid>

        {stationGroups.map(({ kind, title, itemLabel }) => {
          const rows = modelForm.stations
            .map((station, index) => ({ station, index }))
            .filter(({ station }) => station.kind === kind);
          const columnCount = kind === "baggage" ? 5 : 6;

          return (
            <section key={kind} className="border border-slate-300 bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-slate-300 bg-slate-800 px-2 py-1 text-white">
                <h3 className="text-[11px] font-bold uppercase tracking-wide">{title}</h3>
                <CompactButton
                  type="button"
                  className="border-white/30 bg-white/10 text-white hover:bg-white/20"
                  onClick={() => addStation(kind)}
                >
                  Add
                </CompactButton>
              </div>
              <div className="max-w-full overflow-x-auto">
                <table
                  aria-label={`${title} worksheet`}
                  className="w-full min-w-[760px] border-collapse text-left text-xs"
                >
                  <thead>
                    <tr>
                      <WorksheetHeader>{itemLabel}</WorksheetHeader>
                      <WorksheetHeader>Arm (in)</WorksheetHeader>
                      <WorksheetHeader>Lat arm</WorksheetHeader>
                      {kind === "fuel" ? (
                        <>
                          <WorksheetHeader>Capacity (gal)</WorksheetHeader>
                          <WorksheetHeader>lb/gal</WorksheetHeader>
                        </>
                      ) : kind === "equipment" ? (
                        <>
                          <WorksheetHeader>Weight (lb)</WorksheetHeader>
                          <WorksheetHeader>Use</WorksheetHeader>
                        </>
                      ) : (
                        <WorksheetHeader>Max load (lb)</WorksheetHeader>
                      )}
                      {kind === "seat" ? <WorksheetHeader>Crew seat</WorksheetHeader> : null}
                      <WorksheetHeader className="w-20 text-right">Action</WorksheetHeader>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={columnCount}
                          className="h-8 border-b border-slate-200 px-2 text-xs text-slate-400"
                        >
                          No {title.toLowerCase()} entered.
                        </td>
                      </tr>
                    ) : null}
                    {rows.map(({ station, index }) => {
                      const prefix = `station.${station.clientKey}`;
                      return (
                        <tr key={station.clientKey}>
                          <WorksheetCell>
                            <input
                              aria-label={`${itemLabel} name`}
                              aria-invalid={Boolean(modelErrors[`${prefix}.name`])}
                              className={controlClass(modelErrors[`${prefix}.name`])}
                              value={station.name}
                              onChange={(event) => updateStation(index, "name", event.target.value)}
                            />
                          </WorksheetCell>
                          <WorksheetCell>
                            <input
                              aria-label={`${station.name || itemLabel} arm`}
                              aria-invalid={Boolean(modelErrors[`${prefix}.arm`])}
                              className={controlClass(modelErrors[`${prefix}.arm`])}
                              type="number"
                              step="any"
                              value={station.arm}
                              onChange={(event) => updateStation(index, "arm", event.target.value)}
                            />
                          </WorksheetCell>
                          <WorksheetCell>
                            <input
                              aria-label={`${station.name || itemLabel} lateral arm`}
                              aria-invalid={Boolean(modelErrors[`${prefix}.latArm`])}
                              className={controlClass(modelErrors[`${prefix}.latArm`])}
                              type="number"
                              step="any"
                              value={station.latArm}
                              onChange={(event) =>
                                updateStation(index, "latArm", event.target.value)
                              }
                            />
                          </WorksheetCell>
                          {kind === "fuel" ? (
                            <>
                              <WorksheetCell>
                                <input
                                  aria-label={`${station.name || itemLabel} capacity in gallons`}
                                  aria-invalid={Boolean(modelErrors[`${prefix}.maxWeight`])}
                                  className={controlClass(modelErrors[`${prefix}.maxWeight`])}
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={station.maxWeight}
                                  onChange={(event) =>
                                    updateStation(index, "maxWeight", event.target.value)
                                  }
                                />
                              </WorksheetCell>
                              <WorksheetCell>
                                <input
                                  aria-label={`${station.name || itemLabel} fuel pounds per gallon`}
                                  aria-invalid={Boolean(
                                    modelErrors[`${prefix}.weightPerGallon`]
                                  )}
                                  className={controlClass(
                                    modelErrors[`${prefix}.weightPerGallon`]
                                  )}
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={station.weightPerGallon}
                                  onChange={(event) =>
                                    updateStation(
                                      index,
                                      "weightPerGallon",
                                      event.target.value
                                    )
                                  }
                                />
                              </WorksheetCell>
                            </>
                          ) : kind === "equipment" ? (
                            <>
                              <WorksheetCell>
                                <input
                                  aria-label={`${station.name || itemLabel} installed weight`}
                                  aria-invalid={Boolean(modelErrors[`${prefix}.fixedWeight`])}
                                  className={controlClass(modelErrors[`${prefix}.fixedWeight`])}
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={station.fixedWeight}
                                  onChange={(event) =>
                                    updateStation(index, "fixedWeight", event.target.value)
                                  }
                                />
                              </WorksheetCell>
                              <WorksheetCell>
                                <select
                                  aria-label={`${station.name || itemLabel} usage`}
                                  className={worksheetInputClass}
                                  value={station.inputType}
                                  onChange={(event) =>
                                    updateStation(index, "inputType", event.target.value)
                                  }
                                >
                                  <option value="number">Always included</option>
                                  <option value="checkbox">Optional</option>
                                </select>
                              </WorksheetCell>
                            </>
                          ) : (
                            <WorksheetCell>
                              <input
                                aria-label={`${station.name || itemLabel} maximum load`}
                                aria-invalid={Boolean(modelErrors[`${prefix}.maxWeight`])}
                                className={controlClass(modelErrors[`${prefix}.maxWeight`])}
                                type="number"
                                min="0"
                                step="any"
                                value={station.maxWeight}
                                onChange={(event) =>
                                  updateStation(index, "maxWeight", event.target.value)
                                }
                              />
                            </WorksheetCell>
                          )}
                          {kind === "seat" ? (
                            <WorksheetCell>
                              <select
                                aria-label={`${station.name || itemLabel} crew assignment`}
                                className={worksheetInputClass}
                                value={station.crewRole}
                                onChange={(event) =>
                                  updateStation(index, "crewRole", event.target.value)
                                }
                              >
                                <option value="">Passenger / none</option>
                                <option value="pilot">Pilot</option>
                                <option value="copilot">Co-pilot</option>
                              </select>
                            </WorksheetCell>
                          ) : null}
                          <WorksheetCell className="px-1 text-right">
                            <button
                              type="button"
                              className="h-7 px-1 text-xs font-semibold text-rose-700"
                              aria-label={`Remove ${station.name || itemLabel}`}
                              onClick={() =>
                                updateModelField(
                                  "stations",
                                  modelForm.stations.filter(
                                    (item) => item.clientKey !== station.clientKey
                                  )
                                )
                              }
                            >
                              Remove
                            </button>
                          </WorksheetCell>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        {modelForm.category === "airplane" ? (
          <section className="border border-slate-300 bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-slate-300 bg-slate-800 px-2 py-1 text-white">
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wide">CG envelope</h3>
                <p className="text-[10px] text-slate-300">Minimum 3 boundary points</p>
              </div>
              <CompactButton
                type="button"
                className="border-white/30 bg-white/10 text-white hover:bg-white/20"
                onClick={() =>
                  updateModelField("envelope", [
                    ...modelForm.envelope,
                    { clientKey: crypto.randomUUID(), cg: "", weight: "" },
                  ])
                }
              >
                Add point
              </CompactButton>
            </div>
            <WorksheetGrid label="CG envelope points" minWidth={520}>
              <thead>
                <tr>
                  <WorksheetHeader>#</WorksheetHeader>
                  <WorksheetHeader>CG (in)</WorksheetHeader>
                  <WorksheetHeader>Weight (lb)</WorksheetHeader>
                  <WorksheetHeader className="w-20 text-right">Action</WorksheetHeader>
                </tr>
              </thead>
              <tbody>
                {modelForm.envelope.map((point, index) => {
                  const prefix = `envelope.${point.clientKey}`;
                  return (
                    <tr key={point.clientKey}>
                      <WorksheetCell className="px-2 text-slate-500">{index + 1}</WorksheetCell>
                      <WorksheetCell>
                        <input
                          aria-label={`Envelope point ${index + 1} CG`}
                          aria-invalid={Boolean(modelErrors[`${prefix}.cg`])}
                          className={controlClass(modelErrors[`${prefix}.cg`])}
                          type="number"
                          step="any"
                          value={point.cg}
                          onChange={(event) => updateEnvelope(index, "cg", event.target.value)}
                        />
                      </WorksheetCell>
                      <WorksheetCell>
                        <input
                          aria-label={`Envelope point ${index + 1} weight`}
                          aria-invalid={Boolean(modelErrors[`${prefix}.weight`])}
                          className={controlClass(modelErrors[`${prefix}.weight`])}
                          type="number"
                          min="0"
                          step="any"
                          value={point.weight}
                          onChange={(event) =>
                            updateEnvelope(index, "weight", event.target.value)
                          }
                        />
                      </WorksheetCell>
                      <WorksheetCell className="px-1 text-right">
                        <button
                          type="button"
                          className="h-7 px-1 text-xs font-semibold text-rose-700"
                          onClick={() =>
                            updateModelField(
                              "envelope",
                              modelForm.envelope.filter(
                                (item) => item.clientKey !== point.clientKey
                              )
                            )
                          }
                        >
                          Remove
                        </button>
                      </WorksheetCell>
                    </tr>
                  );
                })}
              </tbody>
            </WorksheetGrid>
          </section>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {(["topView", "sideView"] as const).map((section) => {
              const points = modelForm[section];
              const title = section === "topView" ? "Top-view CG envelope" : "Side-view weight envelope";
              return (
                <section key={section} className="border border-slate-300 bg-white">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-300 bg-slate-800 px-2 py-1 text-white">
                    <div>
                      <h3 className="text-[11px] font-bold uppercase tracking-wide">{title}</h3>
                      <p className="text-[10px] text-slate-300">
                        {section === "topView" ? "Minimum 3 points" : "Optional"}
                      </p>
                    </div>
                    <CompactButton
                      type="button"
                      className="border-white/30 bg-white/10 text-white hover:bg-white/20"
                      onClick={() =>
                        updateModelField(section, [
                          ...points,
                          { clientKey: crypto.randomUUID(), x: "", y: "" },
                        ])
                      }
                    >
                      Add point
                    </CompactButton>
                  </div>
                  <WorksheetGrid label={title} minWidth={480}>
                    <thead>
                      <tr>
                        <WorksheetHeader>Fwd/aft CG (in)</WorksheetHeader>
                        <WorksheetHeader>
                          {section === "topView" ? "Left/right CG (in)" : "Weight (lb)"}
                        </WorksheetHeader>
                        <WorksheetHeader className="w-20 text-right">Action</WorksheetHeader>
                      </tr>
                    </thead>
                    <tbody>
                      {points.map((point, index) => {
                        const prefix = `${section}.${point.clientKey}`;
                        return (
                          <tr key={point.clientKey}>
                            <WorksheetCell>
                              <input
                                aria-label={`${title} point ${index + 1} forward aft CG`}
                                aria-invalid={Boolean(modelErrors[`${prefix}.x`])}
                                className={controlClass(modelErrors[`${prefix}.x`])}
                                type="number"
                                step="any"
                                value={point.x}
                                onChange={(event) =>
                                  section === "topView"
                                    ? updateTopView(index, "x", event.target.value)
                                    : updateSideView(index, "x", event.target.value)
                                }
                              />
                            </WorksheetCell>
                            <WorksheetCell>
                              <input
                                aria-label={`${title} point ${index + 1} ${
                                  section === "topView" ? "left right CG" : "weight"
                                }`}
                                aria-invalid={Boolean(modelErrors[`${prefix}.y`])}
                                className={controlClass(modelErrors[`${prefix}.y`])}
                                type="number"
                                step="any"
                                value={point.y}
                                onChange={(event) =>
                                  section === "topView"
                                    ? updateTopView(index, "y", event.target.value)
                                    : updateSideView(index, "y", event.target.value)
                                }
                              />
                            </WorksheetCell>
                            <WorksheetCell className="px-1 text-right">
                              <button
                                type="button"
                                className="h-7 px-1 text-xs font-semibold text-rose-700"
                                onClick={() =>
                                  updateModelField(
                                    section,
                                    points.filter(
                                      (item) => item.clientKey !== point.clientKey
                                    )
                                  )
                                }
                              >
                                Remove
                              </button>
                            </WorksheetCell>
                          </tr>
                        );
                      })}
                    </tbody>
                  </WorksheetGrid>
                </section>
              );
            })}
          </div>
        )}

        <div className="sticky -bottom-5 flex justify-end gap-2 border-t border-slate-200 bg-white/95 py-3 backdrop-blur">
          <CompactButton type="button" onClick={() => setShowModelForm(false)}>
            Cancel
          </CompactButton>
          <CompactButton type="submit" tone="primary" disabled={saving}>
            {saving ? "Saving…" : modelForm.id ? "Save model" : "Add model"}
          </CompactButton>
        </div>
      </form>
    );
  };

  const renderAircraftForm = () => {
    const controlClass = (error?: string) =>
      `${worksheetInputClass} ${error ? "bg-rose-50 text-rose-900 ring-1 ring-inset ring-rose-500" : ""}`;

    return (
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSaveAircraft();
        }}
      >
        {Object.keys(aircraftErrors).length > 0 ? (
          <div className="border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900" role="alert">
            Check the highlighted cells before saving.
          </div>
        ) : null}

        <WorksheetGrid label="Platform aircraft details" minWidth={820}>
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
                  autoFocus
                  required
                  aria-label="Aircraft model"
                  aria-invalid={Boolean(aircraftErrors.model_id)}
                  className={controlClass(aircraftErrors.model_id)}
                  value={aircraftForm.model_id}
                  onChange={(event) => updateAircraftField("model_id", event.target.value)}
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
                  aria-label="Registration or tail number"
                  aria-invalid={Boolean(aircraftErrors.name)}
                  className={controlClass(aircraftErrors.name)}
                  value={aircraftForm.name}
                  onChange={(event) => updateAircraftField("name", event.target.value.toUpperCase())}
                  placeholder="N5520X"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
              </WorksheetCell>
              <WorksheetCell>
                <input
                  required
                  aria-label="Basic empty weight in pounds"
                  aria-invalid={Boolean(aircraftErrors.empty_weight)}
                  className={controlClass(aircraftErrors.empty_weight)}
                  type="number"
                  min="0"
                  step="0.1"
                  value={aircraftForm.empty_weight}
                  onChange={(event) => updateAircraftField("empty_weight", event.target.value)}
                />
              </WorksheetCell>
              <WorksheetCell>
                <input
                  required
                  aria-label="Empty weight longitudinal arm in inches"
                  aria-invalid={Boolean(aircraftErrors.empty_arm)}
                  className={controlClass(aircraftErrors.empty_arm)}
                  type="number"
                  step="0.01"
                  value={aircraftForm.empty_arm}
                  onChange={(event) => updateAircraftField("empty_arm", event.target.value)}
                />
              </WorksheetCell>
              <WorksheetCell>
                <input
                  aria-label="Empty weight lateral arm in inches"
                  aria-invalid={Boolean(aircraftErrors.empty_lat_arm)}
                  className={controlClass(aircraftErrors.empty_lat_arm)}
                  type="number"
                  step="0.01"
                  value={aircraftForm.empty_lat_arm}
                  onChange={(event) => updateAircraftField("empty_lat_arm", event.target.value)}
                />
              </WorksheetCell>
            </tr>
          </tbody>
        </WorksheetGrid>

        {aircraftForm.model_id ? (
          <p className="px-1 text-[11px] text-slate-500">
            {selectedAircraftModel?.max_weight != null
              ? `Model maximum: ${selectedAircraftModel.max_weight.toLocaleString()} lb`
              : "No maximum weight is saved for this model."}
          </p>
        ) : null}

        <div className="sticky -bottom-5 flex justify-end gap-2 border-t border-slate-200 bg-white/95 py-3 backdrop-blur">
          <CompactButton type="button" onClick={() => setShowAircraftForm(false)}>Cancel</CompactButton>
          <CompactButton type="submit" tone="primary" disabled={saving}>
            {saving ? "Saving…" : aircraftForm.id ? "Save aircraft" : "Add aircraft"}
          </CompactButton>
        </div>
      </form>
    );
  };

  return (
    <>
      <div className="grid gap-3">
        <AdminPageHeader eyebrow="Platform administration" title="Aircraft Library" description="Platform aircraft models, fleet records, organization access, and submitted weight-and-balance changes." />
        <AdminDataTable label="Platform aircraft models">
          <thead>
            <tr><th colSpan={5} className="p-0 font-normal"><CompactToolbar resultLabel={`${models.length} models`} actions={<CompactButton type="button" tone="primary" onClick={() => openModelEditor()}>Add model</CompactButton>} /></th></tr>
            <tr className="border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700"><th className="px-3 py-2">Model</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Envelope</th><th className="px-3 py-2">Fuel burn</th><th className="px-3 py-2 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!models.length ? <tr><td colSpan={5}><EmptyState title="No aircraft models" description="Add the first platform aircraft model." /></td></tr> : null}
            {models.map((model) => <tr key={model.id} className="hover:bg-blue-50/40"><td className="px-3 py-2 font-semibold text-slate-950">{model.name}</td><td className="px-3 py-2 text-xs text-slate-600">{model.category === "helicopter" ? "Helicopter" : "Airplane"}</td><td className="px-3 py-2 text-xs text-slate-600">{model.chart_type ?? "1d1p"}</td><td className="px-3 py-2 text-xs text-slate-600">{typeof model.avg_fuel_burn_rate === "number" ? `${model.avg_fuel_burn_rate} gph` : "—"}</td><td className="px-3 py-2"><div className="flex justify-end gap-1"><CompactButton type="button" onClick={() => openModelEditor(normalizeModelForm(model))}>Edit</CompactButton><CompactButton type="button" tone="danger" disabled={saving} onClick={() => void handleDeleteModel(model.id)}>Delete</CompactButton></div></td></tr>)}
          </tbody>
        </AdminDataTable>

        <AdminDataTable label="Platform fleet aircraft">
          <thead>
            <tr><th colSpan={7} className="p-0 font-normal"><CompactToolbar resultLabel={`${aircraft.length} aircraft`} actions={<CompactButton type="button" tone="primary" onClick={() => openAircraftEditor()}>Add aircraft</CompactButton>} /></th></tr>
            <tr className="border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700"><th className="px-3 py-2">Tail</th><th className="px-3 py-2">Model</th><th className="px-3 py-2">Visibility</th><th className="px-3 py-2">Empty weight</th><th className="px-3 py-2">Empty arm</th><th className="px-3 py-2">Organizations</th><th className="px-3 py-2 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!aircraft.length ? <tr><td colSpan={7}><EmptyState title="No fleet aircraft" description="Add the first platform aircraft record." /></td></tr> : null}
            {aircraft.map((item) => {
              const assignmentCount = organizationAssignments.filter((assignment) => assignment.aircraft_id === item.id).length;
              return <tr key={item.id} className="hover:bg-blue-50/40"><td className="px-3 py-2 font-semibold text-slate-950">{item.tail_number ?? item.name}</td><td className="px-3 py-2 text-xs text-slate-600">{modelNameById.get(item.model_id ?? "") ?? item.model?.name ?? "—"}</td><td className="px-3 py-2"><StatusBadge tone={item.visibility === "private" ? "warning" : "info"}>{item.visibility === "private" ? "Private" : "Shared"}</StatusBadge></td><td className="px-3 py-2 text-xs tabular-nums text-slate-600">{item.empty_weight ?? "—"}</td><td className="px-3 py-2 text-xs tabular-nums text-slate-600">{item.empty_arm ?? "—"}</td><td className="px-3 py-2 text-center text-xs tabular-nums text-slate-600">{assignmentCount}</td><td className="px-3 py-2"><div className="flex justify-end gap-1">{item.visibility === "private" && item.owner_user_id === session?.user?.id ? <CompactButton type="button" onClick={() => openOrganizationAssignments(item)}>Organizations</CompactButton> : null}<CompactButton type="button" onClick={() => openAircraftEditor(normalizeAircraftForm(item))}>Edit</CompactButton><CompactButton type="button" tone="danger" disabled={saving} onClick={() => void handleDeleteAircraft(item.id)}>Delete</CompactButton></div></td></tr>;
            })}
          </tbody>
        </AdminDataTable>

        <AdminDataTable label="Pending weight and balance changes">
          <thead>
            <tr><th colSpan={7} className="p-0 font-normal"><CompactToolbar resultLabel={`${updateRequests.filter((request) => request.status === "pending").length} pending`} /></th></tr>
            <tr className="border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700"><th className="px-3 py-2">Aircraft</th><th className="px-3 py-2">Submitted by</th><th className="px-3 py-2">Empty weight</th><th className="px-3 py-2">Arm</th><th className="px-3 py-2">Lat arm</th><th className="px-3 py-2">Note</th><th className="px-3 py-2 text-right">Review</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!updateRequests.some((request) => request.status === "pending") ? <tr><td colSpan={7}><EmptyState title="No pending changes" description="Submitted weight-and-balance changes will appear here." /></td></tr> : null}
            {updateRequests.filter((request) => request.status === "pending").map((request) => <tr key={request.id} className="hover:bg-blue-50/40"><td className="px-3 py-2 font-semibold text-slate-950">{request.aircraft_tail_number}</td><td className="px-3 py-2 text-xs text-slate-600">{request.submitted_by_label}</td><td className="px-3 py-2 text-xs tabular-nums text-slate-600">{request.current_empty_weight ?? "—"} → {request.proposed_empty_weight ?? "—"}</td><td className="px-3 py-2 text-xs tabular-nums text-slate-600">{request.current_empty_arm ?? "—"} → {request.proposed_empty_arm ?? "—"}</td><td className="px-3 py-2 text-xs tabular-nums text-slate-600">{request.current_empty_lat_arm ?? "—"} → {request.proposed_empty_lat_arm ?? "—"}</td><td className="max-w-48 truncate px-3 py-2 text-xs text-slate-600">{request.note || "—"}</td><td className="px-3 py-2"><div className="flex justify-end gap-1"><CompactButton type="button" tone="primary" disabled={saving} onClick={() => void handleApproveRequest(request)}>Approve</CompactButton><CompactButton type="button" tone="danger" disabled={saving} onClick={() => void handleRejectRequest(request)}>Reject</CompactButton></div></td></tr>)}
          </tbody>
        </AdminDataTable>
      </div>

      {status ? <p className="saas-meta-text">{status}</p> : null}

      <DetailDrawer open={showModelForm} width="wide" onClose={() => setShowModelForm(false)} title={modelForm.id ? "Edit aircraft model" : "Add aircraft model"} description="Model identity, loading locations, and approved envelopes.">
        {renderCompactModelForm()}
      </DetailDrawer>
      <DetailDrawer open={showAircraftForm} width="wide" onClose={() => setShowAircraftForm(false)} title={aircraftForm.id ? "Edit aircraft" : "Add aircraft"} description="Aircraft identity and weight-and-balance record.">
        {renderAircraftForm()}
      </DetailDrawer>
      <DetailDrawer open={Boolean(assigningAircraftId)} onClose={() => { setAssigningAircraftId(""); setSelectedOrganizationIds([]); }} title="Organization access" description="Choose every organization that may use this private aircraft.">
        <div className="divide-y divide-slate-100 border border-slate-200">{organizations.map((organization) => <label key={organization.id} className="flex min-h-10 cursor-pointer items-center gap-3 px-3 text-sm hover:bg-slate-50"><input type="checkbox" checked={selectedOrganizationIds.includes(organization.id)} onChange={() => toggleOrganizationAssignment(organization.id)} /><span className="flex-1 font-medium text-slate-900">{organization.name}</span><span className="text-xs text-slate-500">{organization.owner_display_name || organization.owner_email || "No owner"}</span></label>)}</div>
        <div className="mt-4 flex justify-end gap-2"><CompactButton type="button" onClick={() => { setAssigningAircraftId(""); setSelectedOrganizationIds([]); }}>Cancel</CompactButton><CompactButton type="button" tone="primary" disabled={saving} onClick={() => void handleSaveOrganizationAssignments()}>{saving ? "Saving…" : "Save access"}</CompactButton></div>
      </DetailDrawer>

    </>
  );
}
