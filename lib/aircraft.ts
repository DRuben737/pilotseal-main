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

export type AircraftChartType = "1d1p" | "2d1p" | "2d2p";

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
  chart_type?: AircraftChartType | string | null;
  avg_fuel_burn_rate?: number | null;
  stations: unknown;
  envelope: unknown;
};

export type AircraftRecord = {
  id: string;
  model_id: string | null;
  name: string;
  tail_number: string;
  owner_user_id?: string | null;
  visibility?: "shared" | "private" | string | null;
  category?: string | null;
  empty_weight: number | null;
  empty_arm: number | null;
  empty_lat_arm?: number | null;
  max_weight?: number | null;
  model?: AircraftModelRecord | null;
  source?: "shared" | "mine";
  is_saved?: boolean;
};

export type AircraftUpdateRequestRecord = {
  id: string;
  aircraft_id: string;
  aircraft_tail_number: string;
  current_empty_weight: number | null;
  current_empty_arm: number | null;
  current_empty_lat_arm: number | null;
  proposed_empty_weight: number | null;
  proposed_empty_arm: number | null;
  proposed_empty_lat_arm: number | null;
  note: string;
  status: string;
  submitted_by: string;
  submitted_by_label: string;
  created_at: string;
};

export type AttachAircraftByTailInput = {
  userId: string;
  model_id: string;
  tail_number: string;
  empty_weight: number;
  empty_arm: number;
  empty_lat_arm?: number | null;
};

export type AttachAircraftConflict = {
  kind: "conflict";
  aircraft: AircraftRecord;
  proposed: {
    model_id: string;
    tail_number: string;
    empty_weight: number;
    empty_arm: number;
    empty_lat_arm: number | null;
  };
};

export type AttachAircraftSuccess = {
  kind: "attached" | "created";
  aircraft: AircraftRecord;
};

export type AttachAircraftResult = AttachAircraftSuccess | AttachAircraftConflict;

const AIRCRAFT_MODEL_SELECT = "id, name, category, chart_type, avg_fuel_burn_rate, stations, envelope";
const AIRCRAFT_MODEL_SELECT_LEGACY = "id, name, category, chart_type, stations, envelope";
const AIRCRAFT_SELECT_VARIANTS = [
  "id, model_id, name, tail_number, owner_user_id, visibility, empty_weight, empty_arm, empty_lat_arm",
  "id, model_id, tail_number, owner_user_id, visibility, empty_weight, empty_arm, empty_lat_arm",
  "id, model_id, name, owner_user_id, visibility, empty_weight, empty_arm, empty_lat_arm",
  "id, model_id, name, tail_number, empty_weight, empty_arm, empty_lat_arm",
  "id, model_id, tail_number, empty_weight, empty_arm, empty_lat_arm",
  "id, model_id, name, empty_weight, empty_arm, empty_lat_arm",
  "id, model_id, name, tail_number, owner_user_id, visibility, empty_weight, empty_arm, empty_lat_arm, max_weight",
  "id, model_id, tail_number, owner_user_id, visibility, empty_weight, empty_arm, empty_lat_arm, max_weight",
  "id, model_id, name, owner_user_id, visibility, empty_weight, empty_arm, empty_lat_arm, max_weight",
  "id, model_id, tail_number, empty_weight, empty_arm",
  "id, model_id, name, empty_weight, empty_arm",
  "id, model_id, name, tail_number, empty_weight, empty_arm, empty_lat_arm, max_weight",
  "id, model_id, tail_number, empty_weight, empty_arm, empty_lat_arm, max_weight",
  "id, model_id, name, empty_weight, empty_arm, empty_lat_arm, max_weight",
  "id, model_id, tail_number, empty_weight, empty_arm, max_weight",
  "id, model_id, name, empty_weight, empty_arm, max_weight",
];

const UPDATE_REQUEST_SELECT =
  "id, aircraft_id, proposed_empty_weight, proposed_empty_arm, proposed_empty_lat_arm, note, status, submitted_by, created_at";

export async function fetchAircraftModels() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("aircraft_models")
    .select(AIRCRAFT_MODEL_SELECT)
    .order("name", { ascending: true });

  if (!error) {
    return normalizeAircraftModels(data ?? []);
  }

  const { data: legacyData, error: legacyError } = await supabase
    .from("aircraft_models")
    .select(AIRCRAFT_MODEL_SELECT_LEGACY)
    .order("name", { ascending: true });

  if (legacyError) {
    throw legacyError;
  }

  return normalizeAircraftModels(legacyData ?? []);
}

export async function fetchSharedAircraft() {
  const [{ data, error }, models] = await Promise.all([
    selectAircraftRecords(),
    fetchAircraftModels().catch(() => [] as AircraftModelRecord[]),
  ]);

  if (error) {
    throw error;
  }

  return normalizeAircraftList(data ?? [], models, "shared", new Set()).filter(
    (aircraft) => aircraft.visibility !== "private"
  );
}

export async function fetchMyAircraft(userId: string) {
  const supabase = getSupabaseClient();

  const { data: savedRows, error: savedError } = await supabase
    .from("saved_aircraft")
    .select("aircraft_id, is_default")
    .eq("user_id", userId);

  if (savedError) {
    if (isMissingRelationError(savedError)) {
      return [] as AircraftRecord[];
    }

    throw savedError;
  }

  const savedAircraftIds = new Set(
    (savedRows ?? [])
      .map((row) => String((row as Record<string, unknown>).aircraft_id ?? ""))
      .filter(Boolean)
  );

  if (savedAircraftIds.size === 0) {
    return [];
  }

  const [{ data, error }, models] = await Promise.all([
    selectAircraftRecords(Array.from(savedAircraftIds)),
    fetchAircraftModels().catch(() => [] as AircraftModelRecord[]),
  ]);

  if (error) {
    throw error;
  }

  return normalizeAircraftList(data ?? [], models, "mine", savedAircraftIds);
}

export async function fetchAircraft() {
  return fetchSharedAircraft();
}

export async function createAircraftModel(input: {
  name: string;
  category: string;
  avg_fuel_burn_rate?: number | null;
  stations: AircraftStation[];
  envelope: unknown;
}) {
  const supabase = getSupabaseClient();
  const payload = {
    name: input.name,
    category: input.category,
    avg_fuel_burn_rate: input.avg_fuel_burn_rate ?? null,
    stations: input.stations,
    envelope: input.envelope,
  };
  const legacyPayload = {
    name: input.name,
    category: input.category,
    stations: input.stations,
    envelope: input.envelope,
  };
  const attempts: Array<{ payload: Record<string, unknown>; select: string }> = [
    { payload, select: AIRCRAFT_MODEL_SELECT },
    { payload: legacyPayload, select: AIRCRAFT_MODEL_SELECT_LEGACY },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from("aircraft_models")
      .insert(attempt.payload)
      .select(attempt.select)
      .single();

    if (!error) {
      return normalizeAircraftModelRecord(data);
    }

    lastError = error;
  }

  throw lastError;
}

export async function updateAircraftModel(
  id: string,
  input: {
    name: string;
    category: string;
    avg_fuel_burn_rate?: number | null;
    stations: AircraftStation[];
    envelope: unknown;
  }
) {
  const supabase = getSupabaseClient();
  const payload = {
    name: input.name,
    category: input.category,
    avg_fuel_burn_rate: input.avg_fuel_burn_rate ?? null,
    stations: input.stations,
    envelope: input.envelope,
  };
  const legacyPayload = {
    name: input.name,
    category: input.category,
    stations: input.stations,
    envelope: input.envelope,
  };
  const attempts: Array<{ payload: Record<string, unknown>; select: string }> = [
    { payload, select: AIRCRAFT_MODEL_SELECT },
    { payload: legacyPayload, select: AIRCRAFT_MODEL_SELECT_LEGACY },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from("aircraft_models")
      .update(attempt.payload)
      .eq("id", id)
      .select(attempt.select)
      .single();

    if (!error) {
      return normalizeAircraftModelRecord(data);
    }

    lastError = error;
  }

  throw lastError;
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
  empty_lat_arm?: number | null;
  owner_user_id?: string | null;
  visibility?: "shared" | "private";
}) {
  const supabase = getSupabaseClient();
  const normalizedTail = normalizeTailNumber(input.name);
  const visibility = input.visibility ?? (input.owner_user_id ? "private" : "shared");
  const attempts: Array<{ payload: Record<string, unknown>; select: string }> = [
    {
      payload: {
        model_id: input.model_id,
        tail_number: normalizedTail,
        name: normalizedTail,
        owner_user_id: input.owner_user_id ?? null,
        visibility,
        empty_weight: input.empty_weight,
        empty_arm: input.empty_arm,
        empty_lat_arm: input.empty_lat_arm ?? null,
      },
      select: AIRCRAFT_SELECT_VARIANTS[0],
    },
    {
      payload: {
        model_id: input.model_id,
        tail_number: normalizedTail,
        owner_user_id: input.owner_user_id ?? null,
        visibility,
        empty_weight: input.empty_weight,
        empty_arm: input.empty_arm,
        empty_lat_arm: input.empty_lat_arm ?? null,
      },
      select: AIRCRAFT_SELECT_VARIANTS[1],
    },
    {
      payload: {
        model_id: input.model_id,
        name: normalizedTail,
        owner_user_id: input.owner_user_id ?? null,
        visibility,
        empty_weight: input.empty_weight,
        empty_arm: input.empty_arm,
        empty_lat_arm: input.empty_lat_arm ?? null,
      },
      select: AIRCRAFT_SELECT_VARIANTS[2],
    },
  ];

  if (visibility === "shared" && !input.owner_user_id) {
    attempts.push(
      {
        payload: {
          model_id: input.model_id,
          tail_number: normalizedTail,
          name: normalizedTail,
          empty_weight: input.empty_weight,
          empty_arm: input.empty_arm,
          empty_lat_arm: input.empty_lat_arm ?? null,
        },
        select: AIRCRAFT_SELECT_VARIANTS[3],
      },
      {
        payload: {
          model_id: input.model_id,
          tail_number: normalizedTail,
          empty_weight: input.empty_weight,
          empty_arm: input.empty_arm,
          empty_lat_arm: input.empty_lat_arm ?? null,
        },
        select: AIRCRAFT_SELECT_VARIANTS[4],
      },
      {
        payload: {
          model_id: input.model_id,
          name: normalizedTail,
          empty_weight: input.empty_weight,
          empty_arm: input.empty_arm,
          empty_lat_arm: input.empty_lat_arm ?? null,
        },
        select: AIRCRAFT_SELECT_VARIANTS[5],
      }
    );
  }

  let lastError = null;

  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from("aircraft")
      .insert(attempt.payload)
      .select(attempt.select)
      .single();

    if (!error) {
      return normalizeAircraftRecord(data, null, "shared", false);
    }

    lastError = error;
  }

  if (lastError && isMissingColumnError(lastError) && visibility === "private") {
    throw new Error("Run the aircraft visibility migration before creating private aircraft.");
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
    empty_lat_arm?: number | null;
  }
) {
  const supabase = getSupabaseClient();
  const normalizedTail = normalizeTailNumber(input.name);
  const attempts = [
    {
      payload: {
        model_id: input.model_id,
        tail_number: normalizedTail,
        name: normalizedTail,
        empty_weight: input.empty_weight,
        empty_arm: input.empty_arm,
        empty_lat_arm: input.empty_lat_arm ?? null,
      },
      select: AIRCRAFT_SELECT_VARIANTS[0],
    },
    {
      payload: {
        model_id: input.model_id,
        tail_number: normalizedTail,
        empty_weight: input.empty_weight,
        empty_arm: input.empty_arm,
        empty_lat_arm: input.empty_lat_arm ?? null,
      },
      select: AIRCRAFT_SELECT_VARIANTS[1],
    },
    {
      payload: {
        model_id: input.model_id,
        name: normalizedTail,
        empty_weight: input.empty_weight,
        empty_arm: input.empty_arm,
        empty_lat_arm: input.empty_lat_arm ?? null,
      },
      select: AIRCRAFT_SELECT_VARIANTS[2],
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
      return normalizeAircraftRecord(data, null, "shared", false);
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

export async function attachAircraftByTail(
  input: AttachAircraftByTailInput
): Promise<AttachAircraftResult> {
  const normalizedTail = normalizeTailNumber(input.tail_number);
  if (!normalizedTail) {
    throw new Error("Tail number is required.");
  }

  const existing =
    (await findUserAircraftByTailNumber(input.userId, normalizedTail)) ??
    (await findAircraftByTailNumber(normalizedTail));

  if (existing) {
    const sameValues =
      numbersEqual(existing.empty_weight, input.empty_weight) &&
      numbersEqual(existing.empty_arm, input.empty_arm) &&
      numbersEqual(existing.empty_lat_arm ?? null, input.empty_lat_arm ?? null) &&
      String(existing.model_id ?? "") === String(input.model_id ?? "");

    if (!sameValues) {
      return {
        kind: "conflict",
        aircraft: existing,
        proposed: {
          model_id: input.model_id,
          tail_number: normalizedTail,
          empty_weight: input.empty_weight,
          empty_arm: input.empty_arm,
          empty_lat_arm: input.empty_lat_arm ?? null,
        },
      };
    }

    await attachAircraftToUser(input.userId, existing.id);
    return { kind: "attached", aircraft: { ...existing, source: "mine", is_saved: true } };
  }

  const created = await createAircraft({
    model_id: input.model_id,
    name: normalizedTail,
    empty_weight: input.empty_weight,
    empty_arm: input.empty_arm,
    empty_lat_arm: input.empty_lat_arm ?? null,
    owner_user_id: input.userId,
    visibility: "private",
  });

  await attachAircraftToUser(input.userId, created.id);
  return { kind: "created", aircraft: { ...created, source: "mine", is_saved: true } };
}

export async function saveCurrentAircraftForUser(userId: string, aircraftId: string) {
  await attachAircraftToUser(userId, aircraftId);
}

export async function updateMyAircraft(
  userId: string,
  aircraftId: string,
  input: {
    model_id: string;
    name: string;
    empty_weight: number;
    empty_arm: number;
    empty_lat_arm?: number | null;
  }
) {
  const supabase = getSupabaseClient();
  const normalizedTail = normalizeTailNumber(input.name);
  const attempts: Array<{ payload: Record<string, unknown>; select: string }> = [
    {
      payload: {
        model_id: input.model_id,
        tail_number: normalizedTail,
        name: normalizedTail,
        empty_weight: input.empty_weight,
        empty_arm: input.empty_arm,
        empty_lat_arm: input.empty_lat_arm ?? null,
      },
      select: AIRCRAFT_SELECT_VARIANTS[0],
    },
    {
      payload: {
        model_id: input.model_id,
        tail_number: normalizedTail,
        empty_weight: input.empty_weight,
        empty_arm: input.empty_arm,
        empty_lat_arm: input.empty_lat_arm ?? null,
      },
      select: AIRCRAFT_SELECT_VARIANTS[1],
    },
    {
      payload: {
        model_id: input.model_id,
        name: normalizedTail,
        empty_weight: input.empty_weight,
        empty_arm: input.empty_arm,
        empty_lat_arm: input.empty_lat_arm ?? null,
      },
      select: AIRCRAFT_SELECT_VARIANTS[2],
    },
  ];

  let lastError = null;

  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from("aircraft")
      .update(attempt.payload)
      .eq("id", aircraftId)
      .eq("owner_user_id", userId)
      .eq("visibility", "private")
      .select(attempt.select)
      .single();

    if (!error) {
      return normalizeAircraftRecord(data, null, "mine", true);
    }

    lastError = error;
  }

  throw lastError ?? new Error("Unable to update this aircraft.");
}

export async function makeAircraftPrivateForUser(userId: string, aircraftId: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("aircraft")
    .update({
      owner_user_id: userId,
      visibility: "private",
    })
    .eq("id", aircraftId);

  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error("Run the aircraft visibility migration before marking aircraft private.");
    }

    throw error;
  }

  await attachAircraftToUser(userId, aircraftId);
}

export async function removeMyAircraft(userId: string, aircraftId: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("saved_aircraft")
    .delete()
    .eq("user_id", userId)
    .eq("aircraft_id", aircraftId);

  if (error) {
    if (isMissingRelationError(error)) {
      throw new Error("The saved_aircraft table is not installed yet.");
    }

    throw error;
  }
}

export async function submitAircraftUpdateRequest(input: {
  aircraft_id: string;
  submitted_by: string;
  proposed_empty_weight: number;
  proposed_empty_arm: number;
  proposed_empty_lat_arm?: number | null;
  note?: string;
}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("aircraft_update_requests")
    .insert({
      aircraft_id: input.aircraft_id,
      submitted_by: input.submitted_by,
      proposed_empty_weight: input.proposed_empty_weight,
      proposed_empty_arm: input.proposed_empty_arm,
      proposed_empty_lat_arm: input.proposed_empty_lat_arm ?? null,
      note: input.note?.trim() || null,
      status: "pending",
    })
    .select(UPDATE_REQUEST_SELECT)
    .single();

  if (error) {
    if (isMissingRelationError(error)) {
      throw new Error("The aircraft_update_requests table is not installed yet.");
    }

    throw error;
  }

  return data;
}

export async function fetchAircraftUpdateRequests() {
  const supabase = getSupabaseClient();

  const [{ data, error }, aircraftList, profiles] = await Promise.all([
    supabase
      .from("aircraft_update_requests")
      .select(UPDATE_REQUEST_SELECT)
      .order("created_at", { ascending: false }),
    fetchSharedAircraft().catch(() => [] as AircraftRecord[]),
    fetchProfilesMap().catch(() => new Map<string, string>()),
  ]);

  if (error) {
    if (isMissingRelationError(error)) {
      return [] as AircraftUpdateRequestRecord[];
    }

    throw error;
  }

  const aircraftById = new Map(aircraftList.map((aircraft) => [aircraft.id, aircraft]));

  return (data ?? []).map((row) => {
    const record = (row ?? {}) as Record<string, unknown>;
    const aircraft = aircraftById.get(String(record.aircraft_id ?? ""));
    const submittedBy = String(record.submitted_by ?? "");

    return {
      id: String(record.id ?? ""),
      aircraft_id: String(record.aircraft_id ?? ""),
      aircraft_tail_number: aircraft?.tail_number ?? aircraft?.name ?? "Unknown tail",
      current_empty_weight: aircraft?.empty_weight ?? null,
      current_empty_arm: aircraft?.empty_arm ?? null,
      current_empty_lat_arm: aircraft?.empty_lat_arm ?? null,
      proposed_empty_weight: toNumber(record.proposed_empty_weight),
      proposed_empty_arm: toNumber(record.proposed_empty_arm),
      proposed_empty_lat_arm: toNumber(record.proposed_empty_lat_arm),
      note: typeof record.note === "string" ? record.note : "",
      status: typeof record.status === "string" ? record.status : "pending",
      submitted_by: submittedBy,
      submitted_by_label: profiles.get(submittedBy) ?? submittedBy,
      created_at: typeof record.created_at === "string" ? record.created_at : "",
    } as AircraftUpdateRequestRecord;
  });
}

export async function approveAircraftUpdateRequest(request: AircraftUpdateRequestRecord) {
  const sharedAircraft = await fetchSharedAircraft();
  const currentAircraft = sharedAircraft.find((aircraft) => aircraft.id === request.aircraft_id);

  if (!currentAircraft) {
    throw new Error("Unable to find the shared aircraft tied to this update request.");
  }

  const updatedAircraft = await updateAircraft(request.aircraft_id, {
    model_id: String(currentAircraft.model_id ?? ""),
    name: request.aircraft_tail_number,
    empty_weight: request.proposed_empty_weight ?? 0,
    empty_arm: request.proposed_empty_arm ?? 0,
    empty_lat_arm: request.proposed_empty_lat_arm ?? null,
  });

  await updateAircraftRequestStatus(request.id, "approved");

  return updatedAircraft;
}

export async function rejectAircraftUpdateRequest(id: string) {
  await updateAircraftRequestStatus(id, "rejected");
}

export function parseAircraftEnvelope(envelope: unknown) {
  return parseAircraftEnvelopeSet(envelope).normal;
}

export function parseAircraftEnvelopeSet(envelope: unknown): AircraftEnvelopeSet {
  if (!envelope) {
    return { normal: [], utility: [], topView: [], sideView: [] };
  }

  const rawValue = typeof envelope === "string" ? safelyParseJson(envelope) : envelope;

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
      polygon?: unknown[];
      top_view?: unknown[];
      side_view?: unknown[];
      topView?: unknown[];
      sideView?: unknown[];
    };
    const normalPoints = Array.isArray(set.normal)
      ? (set.normal.map(normalizeEnvelopePoint).filter(Boolean) as AircraftEnvelopePoint[])
      : [];
    const utilityPoints = Array.isArray(set.utility)
      ? (set.utility.map(normalizeEnvelopePoint).filter(Boolean) as AircraftEnvelopePoint[])
      : [];
    const topViewPoints = Array.isArray(set.top_view)
      ? (set.top_view.map(normalizePolygonPoint).filter(Boolean) as AircraftPolygonPoint[])
      : Array.isArray(set.topView)
        ? (set.topView.map(normalizePolygonPoint).filter(Boolean) as AircraftPolygonPoint[])
        : [];
    const sideViewPoints = Array.isArray(set.side_view)
      ? (set.side_view.map(normalizePolygonPoint).filter(Boolean) as AircraftPolygonPoint[])
      : Array.isArray(set.sideView)
        ? (set.sideView.map(normalizePolygonPoint).filter(Boolean) as AircraftPolygonPoint[])
        : [];
    const polygonPoints = Array.isArray(set.polygon)
      ? (set.polygon.map(normalizePolygonPoint).filter(Boolean) as AircraftPolygonPoint[])
      : [];
    const fallbackNormalPolygon = Array.isArray(set.normal)
      ? (set.normal.map(normalizePolygonPoint).filter(Boolean) as AircraftPolygonPoint[])
      : [];
    const fallbackUtilityPolygon = Array.isArray(set.utility)
      ? (set.utility.map(normalizePolygonPoint).filter(Boolean) as AircraftPolygonPoint[])
      : [];

    return {
      normal: normalPoints,
      utility: utilityPoints,
      topView:
        topViewPoints.length > 0
          ? topViewPoints
          : polygonPoints.length > 0
            ? polygonPoints
            : fallbackNormalPolygon,
      sideView: sideViewPoints.length > 0 ? sideViewPoints : fallbackUtilityPolygon,
    };
  }

  return { normal: [], utility: [], topView: [], sideView: [] };
}

export function parseAircraftStations(stations: unknown) {
  const rawValue = typeof stations === "string" ? safelyParseJson(stations) : stations;

  if (!Array.isArray(rawValue)) {
    return [];
  }

  return rawValue
    .map((station) => normalizeStation(station))
    .filter(Boolean) as AircraftStation[];
}

async function selectAircraftRecords(aircraftIds?: string[]) {
  const supabase = getSupabaseClient();
  let lastError = null;

  for (const select of AIRCRAFT_SELECT_VARIANTS) {
    const orderColumn = select.includes("tail_number") ? "tail_number" : "name";
    let query = supabase.from("aircraft").select(select).order(orderColumn, { ascending: true });

    if (Array.isArray(aircraftIds) && aircraftIds.length > 0) {
      query = query.in("id", aircraftIds);
    }

    const { data, error } = await query;

    if (!error) {
      return { data, error: null };
    }

    lastError = error;
  }

  return { data: null, error: lastError };
}

async function findAircraftByTailNumber(tailNumber: string) {
  const sharedAircraft = await fetchSharedAircraft();
  return (
    sharedAircraft.find(
      (aircraft) => normalizeTailNumber(aircraft.tail_number || aircraft.name) === tailNumber
    ) ?? null
  );
}

async function findUserAircraftByTailNumber(userId: string, tailNumber: string) {
  const myAircraft = await fetchMyAircraft(userId);
  return (
    myAircraft.find(
      (aircraft) => normalizeTailNumber(aircraft.tail_number || aircraft.name) === tailNumber
    ) ?? null
  );
}

async function attachAircraftToUser(userId: string, aircraftId: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("saved_aircraft").insert({
    user_id: userId,
    aircraft_id: aircraftId,
  });

  if (!error) {
    return;
  }

  if (isDuplicateError(error)) {
    return;
  }

  if (isMissingRelationError(error)) {
    throw new Error("The saved_aircraft table is not installed yet.");
  }

  throw error;
}

async function updateAircraftRequestStatus(id: string, status: "approved" | "rejected") {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("aircraft_update_requests")
    .update({ status })
    .eq("id", id);

  if (error) {
    if (isMissingRelationError(error)) {
      throw new Error("The aircraft_update_requests table is not installed yet.");
    }

    throw error;
  }
}

async function fetchProfilesMap() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("profiles").select("id, display_name, email");

  if (error) {
    throw error;
  }

  return new Map(
    (data ?? []).map((row) => {
      const record = row as Record<string, unknown>;
      const id = String(record.id ?? "");
      const label =
        (typeof record.display_name === "string" && record.display_name.trim()) ||
        (typeof record.email === "string" && record.email.trim()) ||
        id;

      return [id, label];
    })
  );
}

function normalizeAircraftList(
  records: unknown[],
  models: AircraftModelRecord[],
  source: "shared" | "mine",
  savedAircraftIds: Set<string>
) {
  const modelById = new Map(models.map((model) => [model.id, model]));

  return records.map((record) => {
    const rawRecord = ((record ?? {}) as unknown) as Record<string, unknown>;

    return normalizeAircraftRecord(
      {
        ...rawRecord,
        model:
          typeof rawRecord.model_id === "string" && modelById.has(rawRecord.model_id)
            ? modelById.get(rawRecord.model_id)
            : null,
      },
      null,
      source,
      savedAircraftIds.has(String(rawRecord.id ?? ""))
    );
  });
}

function normalizeAircraftModels(records: unknown[]) {
  return records.map((record) => normalizeAircraftModelRecord(record));
}

function normalizeAircraftModelRecord(value: unknown) {
  const record = (value ?? {}) as Record<string, unknown>;

  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    category: typeof record.category === "string" ? record.category : null,
    chart_type: typeof record.chart_type === "string" ? record.chart_type : null,
    avg_fuel_burn_rate: toNumber(record.avg_fuel_burn_rate),
    stations: record.stations ?? [],
    envelope: record.envelope ?? [],
  } as AircraftModelRecord;
}

function normalizeAircraftRecord(
  value: unknown,
  fallbackModel: AircraftModelRecord | null = null,
  source: "shared" | "mine" = "shared",
  isSaved = false
) {
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
          chart_type:
            typeof (rawModel as Record<string, unknown>).chart_type === "string"
              ? String((rawModel as Record<string, unknown>).chart_type)
              : null,
          avg_fuel_burn_rate: toNumber((rawModel as Record<string, unknown>).avg_fuel_burn_rate),
          stations: (rawModel as Record<string, unknown>).stations ?? [],
          envelope: (rawModel as Record<string, unknown>).envelope ?? [],
        } as AircraftModelRecord)
      : fallbackModel;
  const tailNumber =
    typeof record.tail_number === "string" && record.tail_number.trim()
      ? record.tail_number.trim()
      : typeof record.name === "string" && record.name.trim()
        ? record.name.trim()
        : "";

  return {
    id: String(record.id ?? ""),
    model_id: typeof record.model_id === "string" ? record.model_id : model?.id ?? null,
    name: tailNumber,
    tail_number: tailNumber,
    empty_weight: toNumber(record.empty_weight),
    empty_arm: toNumber(record.empty_arm),
    empty_lat_arm: toNumber(record.empty_lat_arm),
    max_weight: toNumber(record.max_weight),
    owner_user_id: typeof record.owner_user_id === "string" ? record.owner_user_id : null,
    visibility: typeof record.visibility === "string" ? record.visibility : "shared",
    category: model?.category ?? null,
    model,
    source,
    is_saved: isSaved,
  } as AircraftRecord;
}

function numbersEqual(a: number | null | undefined, b: number | null | undefined) {
  if (a == null && b == null) {
    return true;
  }

  if (a == null || b == null) {
    return false;
  }

  return Math.abs(a - b) < 0.0001;
}

function normalizeTailNumber(value: string) {
  return String(value ?? "").trim().toUpperCase();
}

function isMissingRelationError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: string }).code === "42P01" ||
      (error as { code?: string }).code === "PGRST205")
  );
}

function isDuplicateError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

function isMissingColumnError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: string }).code === "42703" ||
      (error as { code?: string }).code === "PGRST204")
  );
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
  const cg = toNumber(point.cg) ?? toNumber(point.x) ?? toNumber(point.arm);
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
  const x = toNumber(point.x) ?? toNumber(point.cg) ?? toNumber(point.long) ?? toNumber(point.arm);
  const y =
    toNumber(point.y) ??
    toNumber(point.weight) ??
    toNumber(point.lat) ??
    toNumber(point.latArm) ??
    toNumber(point.lat_arm);

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
  const arm = toNumber(station.arm) ?? toNumber(station.longArm) ?? toNumber(station.long_arm);

  if (!id || !name || arm === null) {
    return null;
  }

  return {
    id,
    name,
    arm,
    latArm: toNumber(station.latArm) ?? toNumber(station.lat_arm) ?? toNumber(station.lat),
    weightPerGallon: toNumber(station.weightPerGallon) ?? toNumber(station.weight_per_gallon),
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
