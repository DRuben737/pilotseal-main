import { getSupabaseClient } from "@/lib/supabase";

export type AircraftEnvelopePoint = {
  cg: number;
  weight: number;
};

export type AircraftPolygonPoint = {
  x: number;
  y: number;
};

export type AircraftEnvelopeSet = {
  normal: AircraftEnvelopePoint[];
  utility: AircraftEnvelopePoint[];
  topView: AircraftPolygonPoint[];
  sideView: AircraftPolygonPoint[];
};

export type AircraftStation = {
  id: string;
  name: string;
  arm: number;
  latArm?: number | null;
  weightPerGallon?: number | null;
  fixedWeight?: number | null;
  maxWeight?: number | null;
};

export type AircraftModelRecord = {
  id: string;
  name: string;
  category: string | null;
  stations: unknown;
  envelope: unknown;
};

export type AircraftRecord = {
  id: string;
  model_id: string | null;
  name: string;
  category?: string | null;
  empty_weight: number | null;
  empty_arm: number | null;
  empty_lat_arm?: number | null;
  max_weight?: number | null;
  model?: AircraftModelRecord | null;
};

const AIRCRAFT_MODEL_SELECT = "id, name, category, stations, envelope";
const AIRCRAFT_SELECT_VARIANTS = [
  "id, model_id, name, empty_weight, empty_arm, empty_lat_arm, max_weight",
  "id, model_id, name, empty_weight, empty_arm, max_weight",
  "id, model_id, name, empty_weight, empty_arm",
  "id, model_id, tail_number, empty_weight, empty_arm, empty_lat_arm, max_weight",
  "id, model_id, tail_number, empty_weight, empty_arm, max_weight",
  "id, model_id, tail_number, empty_weight, empty_arm",
];

export async function fetchAircraftModels() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("aircraft_models")
    .select(AIRCRAFT_MODEL_SELECT)
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as AircraftModelRecord[];
}

export async function fetchAircraft() {
  const supabase = getSupabaseClient();
  const [{ data, error }, models] = await Promise.all([
    selectAircraftRecords(),
    fetchAircraftModels().catch(() => [] as AircraftModelRecord[]),
  ]);

  if (error) {
    throw error;
  }

  const modelById = new Map(models.map((model) => [model.id, model]));

  return (data ?? []).map((record) => {
    const rawRecord = ((record ?? {}) as unknown) as Record<string, unknown>;

    return normalizeAircraftRecord({
      ...rawRecord,
      model:
        typeof rawRecord.model_id === "string" && modelById.has(rawRecord.model_id)
          ? modelById.get(rawRecord.model_id)
          : null,
    });
  });
}

export async function createAircraftModel(input: {
  name: string;
  category: string;
  stations: AircraftStation[];
  envelope: AircraftEnvelopePoint[];
}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("aircraft_models")
    .insert({
      name: input.name,
      category: input.category,
      stations: input.stations,
      envelope: input.envelope,
    })
    .select(AIRCRAFT_MODEL_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data as AircraftModelRecord;
}

export async function updateAircraftModel(
  id: string,
  input: {
    name: string;
    category: string;
    stations: AircraftStation[];
    envelope: AircraftEnvelopePoint[];
  }
) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("aircraft_models")
    .update({
      name: input.name,
      category: input.category,
      stations: input.stations,
      envelope: input.envelope,
    })
    .eq("id", id)
    .select(AIRCRAFT_MODEL_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data as AircraftModelRecord;
}

export async function deleteAircraftModel(id: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("aircraft_models").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function createAircraft(input: {
  model_id: string;
  name: string;
  empty_weight: number;
  empty_arm: number;
}) {
  const supabase = getSupabaseClient();
  const attempts = [
    {
      payload: {
        model_id: input.model_id,
        name: input.name,
        empty_weight: input.empty_weight,
        empty_arm: input.empty_arm,
      },
      select: AIRCRAFT_SELECT_VARIANTS[0],
    },
    {
      payload: {
        model_id: input.model_id,
        name: input.name,
        empty_weight: input.empty_weight,
        empty_arm: input.empty_arm,
      },
      select: AIRCRAFT_SELECT_VARIANTS[1],
    },
    {
      payload: {
        model_id: input.model_id,
        tail_number: input.name,
        empty_weight: input.empty_weight,
        empty_arm: input.empty_arm,
      },
      select: AIRCRAFT_SELECT_VARIANTS[2],
    },
    {
      payload: {
        model_id: input.model_id,
        tail_number: input.name,
        empty_weight: input.empty_weight,
        empty_arm: input.empty_arm,
      },
      select: AIRCRAFT_SELECT_VARIANTS[3],
    },
  ];

  let lastError = null;

  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from("aircraft")
      .insert(attempt.payload)
      .select(attempt.select)
      .single();

    if (!error) {
      return normalizeAircraftRecord(data);
    }

    lastError = error;
  }

  throw lastError;
}

export async function updateAircraft(
  id: string,
  input: {
    model_id: string;
    name: string;
    empty_weight: number;
    empty_arm: number;
  }
) {
  const supabase = getSupabaseClient();
  const attempts = [
    {
      payload: {
        model_id: input.model_id,
        name: input.name,
        empty_weight: input.empty_weight,
        empty_arm: input.empty_arm,
      },
      select: AIRCRAFT_SELECT_VARIANTS[0],
    },
    {
      payload: {
        model_id: input.model_id,
        name: input.name,
        empty_weight: input.empty_weight,
        empty_arm: input.empty_arm,
      },
      select: AIRCRAFT_SELECT_VARIANTS[1],
    },
    {
      payload: {
        model_id: input.model_id,
        tail_number: input.name,
        empty_weight: input.empty_weight,
        empty_arm: input.empty_arm,
      },
      select: AIRCRAFT_SELECT_VARIANTS[2],
    },
    {
      payload: {
        model_id: input.model_id,
        tail_number: input.name,
        empty_weight: input.empty_weight,
        empty_arm: input.empty_arm,
      },
      select: AIRCRAFT_SELECT_VARIANTS[3],
    },
  ];

  let lastError = null;

  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from("aircraft")
      .update(attempt.payload)
      .eq("id", id)
      .select(attempt.select)
      .single();

    if (!error) {
      return normalizeAircraftRecord(data);
    }

    lastError = error;
  }

  throw lastError;
}

export async function deleteAircraft(id: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("aircraft").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export function parseAircraftEnvelope(envelope: unknown) {
  return parseAircraftEnvelopeSet(envelope).normal;
}

export function parseAircraftEnvelopeSet(envelope: unknown): AircraftEnvelopeSet {
  if (!envelope) {
    return { normal: [], utility: [], topView: [], sideView: [] };
  }

  const rawValue =
    typeof envelope === "string" ? safelyParseJson(envelope) : envelope;

  if (Array.isArray(rawValue)) {
    return {
      normal: rawValue
        .map(normalizeEnvelopePoint)
        .filter(Boolean) as AircraftEnvelopePoint[],
      utility: [],
      topView: [],
      sideView: [],
    };
  }

  if (
    rawValue &&
    typeof rawValue === "object" &&
    Array.isArray((rawValue as { points?: unknown[] }).points)
  ) {
    return {
      normal: (rawValue as { points: unknown[] }).points
        .map(normalizeEnvelopePoint)
        .filter(Boolean) as AircraftEnvelopePoint[],
      utility: [],
      topView: [],
      sideView: [],
    };
  }

  if (rawValue && typeof rawValue === "object") {
    const set = rawValue as {
      normal?: unknown[];
      utility?: unknown[];
      top_view?: unknown[];
      side_view?: unknown[];
      topView?: unknown[];
      sideView?: unknown[];
    };
    return {
      normal: Array.isArray(set.normal)
        ? (set.normal.map(normalizeEnvelopePoint).filter(Boolean) as AircraftEnvelopePoint[])
        : [],
      utility: Array.isArray(set.utility)
        ? (set.utility.map(normalizeEnvelopePoint).filter(Boolean) as AircraftEnvelopePoint[])
        : [],
      topView: Array.isArray(set.top_view)
        ? (set.top_view.map(normalizePolygonPoint).filter(Boolean) as AircraftPolygonPoint[])
        : Array.isArray(set.topView)
          ? (set.topView.map(normalizePolygonPoint).filter(Boolean) as AircraftPolygonPoint[])
          : [],
      sideView: Array.isArray(set.side_view)
        ? (set.side_view.map(normalizePolygonPoint).filter(Boolean) as AircraftPolygonPoint[])
        : Array.isArray(set.sideView)
          ? (set.sideView.map(normalizePolygonPoint).filter(Boolean) as AircraftPolygonPoint[])
          : [],
    };
  }

  return { normal: [], utility: [], topView: [], sideView: [] };
}

export function parseAircraftStations(stations: unknown) {
  const rawValue =
    typeof stations === "string" ? safelyParseJson(stations) : stations;

  if (!Array.isArray(rawValue)) {
    return [];
  }

  return rawValue
    .map((station) => normalizeStation(station))
    .filter(Boolean) as AircraftStation[];
}

function normalizeAircraftRecord(value: unknown) {
  const record = (value ?? {}) as Record<string, unknown>;
  const rawModel = record.model;
  const model =
    rawModel && typeof rawModel === "object"
      ? ({
          id: String((rawModel as Record<string, unknown>).id ?? ""),
          name: String((rawModel as Record<string, unknown>).name ?? ""),
          category:
            typeof (rawModel as Record<string, unknown>).category === "string"
              ? String((rawModel as Record<string, unknown>).category)
              : null,
          stations: (rawModel as Record<string, unknown>).stations ?? [],
          envelope: (rawModel as Record<string, unknown>).envelope ?? [],
        } as AircraftModelRecord)
      : null;

  return {
    id: String(record.id ?? ""),
    model_id: typeof record.model_id === "string" ? record.model_id : model?.id ?? null,
    name:
      typeof record.name === "string" && record.name.trim()
        ? record.name
        : typeof record.tail_number === "string"
          ? record.tail_number
          : "",
    empty_weight: toNumber(record.empty_weight),
    empty_arm: toNumber(record.empty_arm),
    empty_lat_arm: toNumber(record.empty_lat_arm),
    max_weight: toNumber(record.max_weight),
    category: model?.category ?? null,
    model,
  } as AircraftRecord;
}

async function selectAircraftRecords() {
  const supabase = getSupabaseClient();
  let lastError = null;

  for (const select of AIRCRAFT_SELECT_VARIANTS) {
    const orderColumn = select.includes("tail_number") ? "tail_number" : "name";
    const { data, error } = await supabase
      .from("aircraft")
      .select(select)
      .order(orderColumn, { ascending: true });

    if (!error) {
      return { data, error: null };
    }

    lastError = error;
  }

  return { data: null, error: lastError };
}

function safelyParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeEnvelopePoint(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const point = value as Record<string, unknown>;
  const cg = toNumber(point.cg) ?? toNumber(point.x);
  const weight = toNumber(point.weight) ?? toNumber(point.y);

  if (cg === null || weight === null) {
    return null;
  }

  return { cg, weight };
}

function normalizePolygonPoint(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const point = value as Record<string, unknown>;
  const x = toNumber(point.x) ?? toNumber(point.cg) ?? toNumber(point.long);
  const y =
    toNumber(point.y) ??
    toNumber(point.weight) ??
    toNumber(point.lat);

  if (x === null || y === null) {
    return null;
  }

  return { x, y };
}

function normalizeStation(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const station = value as Record<string, unknown>;
  const id =
    typeof station.id === "string"
      ? station.id.trim()
      : typeof station.key === "string"
        ? station.key.trim()
        : "";
  const name =
    typeof station.name === "string"
      ? station.name.trim()
      : typeof station.label === "string"
        ? station.label.trim()
        : "";
  const arm = toNumber(station.arm);

  if (!id || !name || arm === null) {
    return null;
  }

  return {
    id,
    name,
    arm,
    latArm: toNumber(station.latArm) ?? toNumber(station.lat_arm),
    weightPerGallon:
      toNumber(station.weightPerGallon) ?? toNumber(station.weight_per_gallon),
    fixedWeight: toNumber(station.fixedWeight) ?? toNumber(station.fixed_weight),
    maxWeight: toNumber(station.maxWeight) ?? toNumber(station.max_weight),
  };
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))
      ? Number(value)
      : null;
}
