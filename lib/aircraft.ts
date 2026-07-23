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
export type AircraftMeterType = "hobbs" | "tach";
export type AircraftOperationalStatus =
  | "available"
  | "away"
  | "in_maintenance"
  | "grounded";

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
  organization_id?: string | null;
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
  updated_at?: string | null;
  owner_user_id?: string | null;
  organization_id?: string | null;
  organization_name?: string | null;
  organization_access?: "owned" | "assigned" | null;
  visibility?: "shared" | "private" | string | null;
  category?: string | null;
  empty_weight: number | null;
  empty_arm: number | null;
  empty_lat_arm?: number | null;
  max_weight?: number | null;
  model?: AircraftModelRecord | null;
  source?: "shared" | "mine" | "organization";
  is_saved?: boolean;
  hundred_hour_due_hours?: number | null;
  annual_due_date?: string | null;
  static_due_date?: string | null;
  transponder_due_date?: string | null;
  elt_due_date?: string | null;
  adsb_due_date?: string | null;
  registration_due_date?: string | null;
  current_meter_type?: AircraftMeterType | null;
  current_meter_value?: number | null;
  meter_observed_at?: string | null;
  meter_source?: string | null;
  meter_source_brief_id?: string | null;
  operational_status?: AircraftOperationalStatus;
};

export type AircraftOrganizationAssignment = {
  aircraft_id: string;
  organization_id: string;
  assigned_by: string | null;
  created_at: string;
};

export type AircraftAssignmentBulkMode = "add" | "remove";

export type BulkAircraftAssignmentInput = {
  aircraftIds: string[];
  organizationIds: string[];
  mode: AircraftAssignmentBulkMode;
};

export type BulkAircraftAssignmentResult = {
  aircraft_id: string;
  before_count: number;
  changed_count: number;
  after_count: number;
};

export type AircraftAssignmentAuditEntry = {
  id: string;
  aircraft_id: string | null;
  aircraft_tail_number: string;
  organization_id: string | null;
  organization_name: string;
  actor_user_id: string | null;
  action: "assigned" | "unassigned";
  created_at: string;
};

export type SavedAircraftDueInput = {
  hundred_hour_due_hours?: number | null;
  annual_due_date?: string | null;
  static_due_date?: string | null;
  transponder_due_date?: string | null;
  elt_due_date?: string | null;
};

export type OrganizationAircraftMaintenanceInput = SavedAircraftDueInput & {
  adsb_due_date?: string | null;
  registration_due_date?: string | null;
  operational_status?: AircraftOperationalStatus;
};

export type OrganizationAircraftMaintenance = OrganizationAircraftMaintenanceInput & {
  aircraft_id: string;
  current_meter_type?: AircraftMeterType | null;
  current_meter_value?: number | null;
  meter_observed_at?: string | null;
  meter_source?: string | null;
  meter_source_brief_id?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
};

export type OrganizationAircraftInput = {
  organization_id: string;
  model_id: string;
  tail_number: string;
  empty_weight: number;
  empty_arm: number;
  empty_lat_arm?: number | null;
  maintenance?: OrganizationAircraftMaintenanceInput;
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

const AIRCRAFT_MODEL_SELECT = "id, organization_id, name, category, chart_type, avg_fuel_burn_rate, stations, envelope";
const AIRCRAFT_MODEL_SELECT_LEGACY = "id, name, category, chart_type, stations, envelope";
const AIRCRAFT_SELECT_VARIANTS = [
  "id, model_id, name, tail_number, updated_at, owner_user_id, visibility, empty_weight, empty_arm, empty_lat_arm",
  "id, model_id, tail_number, updated_at, owner_user_id, visibility, empty_weight, empty_arm, empty_lat_arm",
  "id, model_id, name, updated_at, owner_user_id, visibility, empty_weight, empty_arm, empty_lat_arm",
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

const SAVED_AIRCRAFT_SELECT_WITH_DUE =
  "aircraft_id, is_default, hundred_hour_due_hours, annual_due_date, static_due_date, transponder_due_date, elt_due_date";
const SAVED_AIRCRAFT_SELECT_LEGACY = "aircraft_id, is_default";
const ORGANIZATION_AIRCRAFT_SELECT =
  "id, model_id, name, tail_number, updated_at, owner_user_id, organization_id, visibility, empty_weight, empty_arm, empty_lat_arm";
const ORGANIZATION_MAINTENANCE_SELECT =
  "aircraft_id, hundred_hour_due_hours, annual_due_date, static_due_date, transponder_due_date, elt_due_date, adsb_due_date, registration_due_date, current_meter_type, current_meter_value, meter_observed_at, meter_source, meter_source_brief_id, operational_status, updated_by, updated_at";

export async function fetchAircraftModels(organizationId?: string | null) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from("aircraft_models")
    .select(AIRCRAFT_MODEL_SELECT)
    .order("name", { ascending: true });
  query = organizationId
    ? query.or(`organization_id.is.null,organization_id.eq.${organizationId}`)
    : query.is("organization_id", null);
  const { data, error } = await query;

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
    (aircraft) => aircraft.visibility === "shared"
  );
}

export async function fetchOrganizationAircraft(organizationId: string) {
  const supabase = getSupabaseClient();
  const [{ data, error }, models, organizationResult] = await Promise.all([
    supabase.rpc("list_organization_aircraft", {
      p_organization_id: organizationId,
    }),
    fetchAircraftModels(organizationId).catch(() => [] as AircraftModelRecord[]),
    supabase.from("organizations").select("id, name").eq("id", organizationId).maybeSingle(),
  ]);

  if (error) {
    if (isMissingColumnError(error) || isMissingRelationError(error)) {
      return [] as AircraftRecord[];
    }
    throw error;
  }

  const organizationAircraftRows = (data ?? []) as unknown[];
  const aircraftIds = organizationAircraftRows.map((row) =>
    String((row as Record<string, unknown>).id ?? "")
  );
  let maintenanceRows: unknown[] = [];
  if (aircraftIds.length > 0) {
    const maintenanceResult = await supabase
      .from("organization_aircraft_maintenance")
      .select(ORGANIZATION_MAINTENANCE_SELECT)
      .in("aircraft_id", aircraftIds);

    if (maintenanceResult.error && !isMissingRelationError(maintenanceResult.error)) {
      throw maintenanceResult.error;
    }
    maintenanceRows = maintenanceResult.data ?? [];
  }

  const maintenanceByAircraftId = new Map(
    maintenanceRows.map((row) => {
      const record = (row ?? {}) as Record<string, unknown>;
      return [String(record.aircraft_id ?? ""), record as OrganizationAircraftMaintenance];
    })
  );
  const organizationName =
    typeof organizationResult.data?.name === "string" ? organizationResult.data.name : null;

  return normalizeAircraftList(
    organizationAircraftRows.map((row) => ({
      ...(row as Record<string, unknown>),
      organization_name: organizationName,
    })),
    models,
    "organization",
    new Set(),
    maintenanceByAircraftId
  );
}

export async function fetchAircraftOrganizationAssignments(aircraftIds: string[]) {
  if (aircraftIds.length === 0) return [] as AircraftOrganizationAssignment[];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("aircraft_organization_assignments")
    .select("aircraft_id, organization_id, assigned_by, created_at")
    .in("aircraft_id", aircraftIds);

  if (error) throw error;
  return (data ?? []) as AircraftOrganizationAssignment[];
}

export async function setPlatformAircraftOrganizations(
  aircraftId: string,
  organizationIds: string[]
) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("set_platform_aircraft_organizations", {
    p_aircraft_id: aircraftId,
    p_organization_ids: organizationIds,
  });

  if (error) throw error;
  return (data ?? []) as string[];
}

export async function bulkUpdatePlatformAircraftOrganizations(
  input: BulkAircraftAssignmentInput
) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("bulk_update_platform_aircraft_organizations", {
    p_aircraft_ids: input.aircraftIds,
    p_organization_ids: input.organizationIds,
    p_mode: input.mode,
  });

  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    aircraft_id: String(row.aircraft_id ?? ""),
    before_count: Number(row.before_count ?? 0),
    changed_count: Number(row.changed_count ?? 0),
    after_count: Number(row.after_count ?? 0),
  })) as BulkAircraftAssignmentResult[];
}

export async function fetchAircraftAssignmentAudit(organizationId?: string | null, limit = 100) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("list_aircraft_assignment_audit", {
    p_organization_id: organizationId ?? null,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as AircraftAssignmentAuditEntry[];
}

export async function fetchActiveOrganizationAircraft() {
  if (typeof window === "undefined") {
    return [] as AircraftRecord[];
  }

  const organizationId = window.localStorage.getItem("pilotseal.activeOrganizationId") ?? "";
  return organizationId ? fetchOrganizationAircraft(organizationId) : [];
}

export async function createOrganizationAircraft(input: OrganizationAircraftInput) {
  const supabase = getSupabaseClient();
  const normalizedTail = normalizeTailNumber(input.tail_number);
  if (!normalizedTail) {
    throw new Error("Tail number is required.");
  }

  const { data, error } = await supabase
    .from("aircraft")
    .insert({
      organization_id: input.organization_id,
      owner_user_id: null,
      visibility: "organization",
      model_id: input.model_id,
      name: normalizedTail,
      tail_number: normalizedTail,
      empty_weight: input.empty_weight,
      empty_arm: input.empty_arm,
      empty_lat_arm: input.empty_lat_arm ?? null,
    })
    .select(ORGANIZATION_AIRCRAFT_SELECT)
    .single();

  if (error) {
    throw error;
  }

  if (input.maintenance) {
    await updateOrganizationAircraftMaintenance(data.id, input.maintenance);
  }

  return normalizeAircraftRecord(data, null, "organization", false);
}

export async function updateOrganizationAircraft(
  organizationId: string,
  aircraftId: string,
  input: Omit<OrganizationAircraftInput, "organization_id">
) {
  const supabase = getSupabaseClient();
  const normalizedTail = normalizeTailNumber(input.tail_number);
  if (!normalizedTail) {
    throw new Error("Tail number is required.");
  }

  const { data, error } = await supabase
    .from("aircraft")
    .update({
      model_id: input.model_id,
      name: normalizedTail,
      tail_number: normalizedTail,
      empty_weight: input.empty_weight,
      empty_arm: input.empty_arm,
      empty_lat_arm: input.empty_lat_arm ?? null,
    })
    .eq("id", aircraftId)
    .eq("organization_id", organizationId)
    .eq("visibility", "organization")
    .select(ORGANIZATION_AIRCRAFT_SELECT)
    .single();

  if (error) {
    throw error;
  }

  await updateOrganizationAircraftMaintenance(aircraftId, input.maintenance ?? {});
  return normalizeAircraftRecord(data, null, "organization", false);
}

export async function deleteOrganizationAircraft(organizationId: string, aircraftId: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("aircraft")
    .delete()
    .eq("id", aircraftId)
    .eq("organization_id", organizationId)
    .eq("visibility", "organization");

  if (error) {
    throw error;
  }
}

export async function updateOrganizationAircraftMaintenance(
  aircraftId: string,
  input: OrganizationAircraftMaintenanceInput
) {
  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("organization_aircraft_maintenance").upsert({
    aircraft_id: aircraftId,
    ...normalizeOrganizationMaintenanceInput(input),
    updated_by: user?.id ?? null,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw error;
  }
}

export async function fetchMyAircraft(userId: string) {
  const supabase = getSupabaseClient();

  const savedResult = await supabase
    .from("saved_aircraft")
    .select(SAVED_AIRCRAFT_SELECT_WITH_DUE)
    .eq("user_id", userId);
  let savedRows = (savedResult.data ?? null) as Array<Record<string, unknown>> | null;
  let savedError = savedResult.error;

  if (savedError && isMissingColumnError(savedError)) {
    const legacyResult = await supabase
      .from("saved_aircraft")
      .select(SAVED_AIRCRAFT_SELECT_LEGACY)
      .eq("user_id", userId);

    savedRows = (legacyResult.data ?? null) as Array<Record<string, unknown>> | null;
    savedError = legacyResult.error;
  }

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
  const savedDetailsByAircraftId = new Map(
    (savedRows ?? []).map((row) => {
      const record = (row ?? {}) as Record<string, unknown>;
      return [
        String(record.aircraft_id ?? ""),
        {
          hundred_hour_due_hours: toNumber(record.hundred_hour_due_hours),
          annual_due_date: toDateString(record.annual_due_date),
          static_due_date: toDateString(record.static_due_date),
          transponder_due_date: toDateString(record.transponder_due_date),
          elt_due_date: toDateString(record.elt_due_date),
        } satisfies SavedAircraftDueInput,
      ];
    })
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

  return normalizeAircraftList(data ?? [], models, "mine", savedAircraftIds, savedDetailsByAircraftId);
}

export async function fetchAircraft() {
  return fetchSharedAircraft();
}

export async function createAircraftModel(input: {
  organization_id?: string | null;
  name: string;
  category: string;
  avg_fuel_burn_rate?: number | null;
  stations: AircraftStation[];
  envelope: unknown;
}) {
  const supabase = getSupabaseClient();
  const payload = {
    organization_id: input.organization_id ?? null,
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
  const attempts: Array<{ payload: Record<string, unknown>; select: string }> = input.organization_id
    ? [{ payload, select: AIRCRAFT_MODEL_SELECT }]
    : [
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
        select: AIRCRAFT_SELECT_VARIANTS[6],
      },
      {
        payload: {
          model_id: input.model_id,
          tail_number: normalizedTail,
          empty_weight: input.empty_weight,
          empty_arm: input.empty_arm,
          empty_lat_arm: input.empty_lat_arm ?? null,
        },
        select: AIRCRAFT_SELECT_VARIANTS[7],
      },
      {
        payload: {
          model_id: input.model_id,
          name: normalizedTail,
          empty_weight: input.empty_weight,
          empty_arm: input.empty_arm,
          empty_lat_arm: input.empty_lat_arm ?? null,
        },
        select: AIRCRAFT_SELECT_VARIANTS[8],
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

export async function updateSavedAircraftDue(
  userId: string,
  aircraftId: string,
  input: SavedAircraftDueInput
) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("saved_aircraft")
    .update(normalizeSavedAircraftDueInput(input))
    .eq("user_id", userId)
    .eq("aircraft_id", aircraftId);

  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error("Run the saved aircraft due fields migration before saving due dates.");
    }

    if (isMissingRelationError(error)) {
      throw new Error("The saved_aircraft table is not installed yet.");
    }

    throw error;
  }
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
  const { data: aircraftRecord, error: aircraftError } = await supabase
    .from("aircraft")
    .select("id, owner_user_id, visibility")
    .eq("id", aircraftId)
    .maybeSingle();

  if (aircraftError) {
    throw aircraftError;
  }

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

  const aircraft = (aircraftRecord ?? {}) as Record<string, unknown>;
  const isOwnedPrivateAircraft =
    aircraft.visibility === "private" && aircraft.owner_user_id === userId;

  if (!isOwnedPrivateAircraft) {
    return;
  }

  const { error: deleteAircraftError } = await supabase
    .from("aircraft")
    .delete()
    .eq("id", aircraftId)
    .eq("owner_user_id", userId)
    .eq("visibility", "private");

  if (deleteAircraftError) {
    throw deleteAircraftError;
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
  source: "shared" | "mine" | "organization",
  savedAircraftIds: Set<string>,
  savedDetailsByAircraftId = new Map<string, SavedAircraftDueInput>()
) {
  const modelById = new Map(models.map((model) => [model.id, model]));

  return records.map((record) => {
    const rawRecord = ((record ?? {}) as unknown) as Record<string, unknown>;
    const aircraftId = String(rawRecord.id ?? "");
    const savedDetails = savedDetailsByAircraftId.get(aircraftId);

    return normalizeAircraftRecord(
      {
        ...rawRecord,
        ...(savedDetails ?? {}),
        model:
          typeof rawRecord.model_id === "string" && modelById.has(rawRecord.model_id)
            ? modelById.get(rawRecord.model_id)
            : null,
      },
      null,
      source,
      savedAircraftIds.has(aircraftId)
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
    organization_id: typeof record.organization_id === "string" ? record.organization_id : null,
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
  source: "shared" | "mine" | "organization" = "shared",
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
    updated_at: toDateString(record.updated_at),
    empty_weight: toNumber(record.empty_weight),
    empty_arm: toNumber(record.empty_arm),
    empty_lat_arm: toNumber(record.empty_lat_arm),
    max_weight: toNumber(record.max_weight),
    owner_user_id: typeof record.owner_user_id === "string" ? record.owner_user_id : null,
    organization_id: typeof record.organization_id === "string" ? record.organization_id : null,
    organization_name:
      typeof record.organization_name === "string" ? record.organization_name : null,
    organization_access:
      record.organization_access === "owned" || record.organization_access === "assigned"
        ? record.organization_access
        : null,
    visibility: typeof record.visibility === "string" ? record.visibility : "shared",
    category: model?.category ?? null,
    model,
    source,
    is_saved: isSaved,
    hundred_hour_due_hours: toNumber(record.hundred_hour_due_hours),
    annual_due_date: toDateString(record.annual_due_date),
    static_due_date: toDateString(record.static_due_date),
    transponder_due_date: toDateString(record.transponder_due_date),
    elt_due_date: toDateString(record.elt_due_date),
    adsb_due_date: toDateString(record.adsb_due_date),
    registration_due_date: toDateString(record.registration_due_date),
    current_meter_type:
      record.current_meter_type === "hobbs" || record.current_meter_type === "tach"
        ? record.current_meter_type
        : null,
    current_meter_value: toNumber(record.current_meter_value),
    meter_observed_at: toDateString(record.meter_observed_at),
    meter_source: typeof record.meter_source === "string" ? record.meter_source : null,
    meter_source_brief_id:
      typeof record.meter_source_brief_id === "string" ? record.meter_source_brief_id : null,
    operational_status: isAircraftOperationalStatus(record.operational_status)
      ? record.operational_status
      : "available",
  } as AircraftRecord;
}

function normalizeOrganizationMaintenanceInput(input: OrganizationAircraftMaintenanceInput) {
  return {
    ...normalizeSavedAircraftDueInput(input),
    adsb_due_date: normalizeDateForStorage(input.adsb_due_date),
    registration_due_date: normalizeDateForStorage(input.registration_due_date),
    operational_status: input.operational_status ?? "available",
  };
}

function isAircraftOperationalStatus(value: unknown): value is AircraftOperationalStatus {
  return (
    value === "available" ||
    value === "away" ||
    value === "in_maintenance" ||
    value === "grounded"
  );
}

function normalizeSavedAircraftDueInput(input: SavedAircraftDueInput) {
  return {
    hundred_hour_due_hours: input.hundred_hour_due_hours ?? null,
    annual_due_date: normalizeDateForStorage(input.annual_due_date),
    static_due_date: normalizeDateForStorage(input.static_due_date),
    transponder_due_date: normalizeDateForStorage(input.transponder_due_date),
    elt_due_date: normalizeDateForStorage(input.elt_due_date),
  };
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

function normalizeDateForStorage(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function toDateString(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim();
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
