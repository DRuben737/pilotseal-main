import { getSupabaseClient } from "@/lib/supabase";

import type {
  AircraftMeterType,
  AircraftOperationalStatus,
} from "@/lib/aircraft";

export type FlightBriefStatus = "draft" | "finalized" | "superseded";

export type FlightBriefSnapshot = Record<string, unknown>;

export type FlightBriefRecord = {
  id: string;
  created_by: string;
  organization_id: string | null;
  aircraft_id: string | null;
  aircraft_tail_number: string;
  student_name: string;
  instructor_name: string;
  flight_date: string | null;
  etd: string | null;
  eta: string | null;
  ete: number | null;
  flight_rules: string | null;
  route: string | null;
  status: FlightBriefStatus;
  revision_number: number;
  supersedes_id: string | null;
  brief_data: FlightBriefSnapshot;
  mx_snapshot: FlightBriefSnapshot;
  weather_snapshot: FlightBriefSnapshot;
  notam_snapshot: FlightBriefSnapshot;
  wb_snapshot: FlightBriefSnapshot;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FlightBriefDraftInput = {
  organization_id?: string | null;
  aircraft_id?: string | null;
  aircraft_tail_number: string;
  student_name: string;
  instructor_name: string;
  flight_date?: string | null;
  etd?: string | null;
  eta?: string | null;
  ete?: number | null;
  flight_rules?: string | null;
  route?: string | null;
  brief_data: FlightBriefSnapshot;
  weather_snapshot?: FlightBriefSnapshot;
  notam_snapshot?: FlightBriefSnapshot;
  wb_snapshot?: FlightBriefSnapshot;
};

export type FinalizeFlightBriefInput = {
  meterType?: AircraftMeterType | null;
  meterValue?: number | null;
  observedAt?: string | null;
  plannedMeterIncrease?: number | null;
};

export type AircraftMeterReading = {
  id: string;
  aircraft_id: string;
  organization_id: string;
  meter_type: AircraftMeterType;
  previous_value: number | null;
  meter_value: number;
  observed_at: string;
  submitted_by: string;
  source: "preflight" | "admin" | "maintenance";
  flight_brief_id: string | null;
  correction_reason: string | null;
  created_at: string;
};

export type InspectionBasis = "calendar" | "hobbs" | "tach" | "whichever_first";

export type OrganizationInspectionDefinition = {
  id: string;
  organization_id: string;
  name: string;
  basis: InspectionBasis;
  model_id: string | null;
  warning_days: number | null;
  warning_hours: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AircraftInspectionAssignment = {
  id: string;
  definition_id: string;
  aircraft_id: string;
  due_date: string | null;
  due_meter: number | null;
  notes: string | null;
  is_active: boolean;
  definition?: OrganizationInspectionDefinition | null;
  created_at: string;
  updated_at: string;
};

const FLIGHT_BRIEF_SELECT =
  "id, created_by, organization_id, aircraft_id, aircraft_tail_number, student_name, instructor_name, flight_date, etd, eta, ete, flight_rules, route, status, revision_number, supersedes_id, brief_data, mx_snapshot, weather_snapshot, notam_snapshot, wb_snapshot, finalized_at, created_at, updated_at";

export async function createFlightBriefDraft(input: FlightBriefDraftInput) {
  const supabase = getSupabaseClient();
  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userResult.user) throw new Error("Sign in to save a flight brief.");

  const { data, error } = await supabase
    .from("flight_briefs")
    .insert({
      ...normalizeDraftInput(input),
      created_by: userResult.user.id,
      status: "draft",
    })
    .select(FLIGHT_BRIEF_SELECT)
    .single();
  if (error) throw error;
  return normalizeFlightBrief(data);
}

export async function updateFlightBriefDraft(id: string, input: FlightBriefDraftInput) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("flight_briefs")
    .update({ ...normalizeDraftInput(input), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "draft")
    .select(FLIGHT_BRIEF_SELECT)
    .single();
  if (error) throw error;
  return normalizeFlightBrief(data);
}

export async function finalizeFlightBrief(id: string, input: FinalizeFlightBriefInput) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("finalize_flight_brief", {
    p_brief_id: id,
    p_meter_type: input.meterType ?? null,
    p_meter_value: input.meterValue ?? null,
    p_observed_at: input.observedAt ?? null,
    p_planned_meter_increase: input.plannedMeterIncrease ?? null,
  });
  if (error) throw error;
  return normalizeFlightBrief(data);
}

export async function createFlightBriefRevision(id: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("create_flight_brief_revision", {
    p_brief_id: id,
  });
  if (error) throw error;
  return String(data ?? "");
}

export async function fetchMyFlightBriefs(userId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("flight_briefs")
    .select(FLIGHT_BRIEF_SELECT)
    .eq("created_by", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalizeFlightBrief);
}

export async function fetchOrganizationStudentBriefs(organizationId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("flight_briefs")
    .select(FLIGHT_BRIEF_SELECT)
    .eq("organization_id", organizationId)
    .in("status", ["finalized", "superseded"])
    .order("flight_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalizeFlightBrief);
}

export async function fetchFlightBriefById(id: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("flight_briefs")
    .select(FLIGHT_BRIEF_SELECT)
    .eq("id", id)
    .single();
  if (error) throw error;
  return normalizeFlightBrief(data);
}

export async function fetchAircraftMeterHistory(aircraftId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("aircraft_meter_readings")
    .select("id, aircraft_id, organization_id, meter_type, previous_value, meter_value, observed_at, submitted_by, source, flight_brief_id, correction_reason, created_at")
    .eq("aircraft_id", aircraftId)
    .order("observed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AircraftMeterReading[];
}

export async function correctAircraftMeter(input: {
  aircraftId: string;
  meterType: AircraftMeterType;
  meterValue: number;
  observedAt: string;
  reason: string;
}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("correct_aircraft_meter", {
    p_aircraft_id: input.aircraftId,
    p_meter_type: input.meterType,
    p_meter_value: input.meterValue,
    p_observed_at: input.observedAt,
    p_reason: input.reason,
  });
  if (error) throw error;
  return data as {
    aircraft_id: string;
    current_meter_type: AircraftMeterType;
    current_meter_value: number;
    operational_status: AircraftOperationalStatus;
  };
}

export async function fetchOrganizationInspectionDefinitions(organizationId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("organization_inspection_definitions")
    .select("id, organization_id, name, basis, model_id, warning_days, warning_hours, notes, is_active, created_at, updated_at")
    .eq("organization_id", organizationId)
    .order("name");
  if (error) throw error;
  return (data ?? []) as OrganizationInspectionDefinition[];
}

export async function saveOrganizationInspectionDefinition(input: {
  id?: string;
  organization_id: string;
  name: string;
  basis: InspectionBasis;
  model_id?: string | null;
  warning_days?: number | null;
  warning_hours?: number | null;
  notes?: string | null;
  is_active?: boolean;
}) {
  const supabase = getSupabaseClient();
  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userResult.user) throw new Error("Sign in to manage inspections.");
  const payload = {
    organization_id: input.organization_id,
    name: input.name.trim(),
    basis: input.basis,
    model_id: input.model_id || null,
    warning_days: input.warning_days ?? null,
    warning_hours: input.warning_hours ?? null,
    notes: input.notes?.trim() || null,
    is_active: input.is_active ?? true,
    updated_by: userResult.user.id,
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? supabase.from("organization_inspection_definitions").update(payload).eq("id", input.id)
    : supabase.from("organization_inspection_definitions").insert({
        ...payload,
        created_by: userResult.user.id,
      });
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data as OrganizationInspectionDefinition;
}

export async function deleteOrganizationInspectionDefinition(id: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("organization_inspection_definitions").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchAircraftInspectionAssignments(aircraftId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("aircraft_inspection_assignments")
    .select("id, definition_id, aircraft_id, due_date, due_meter, notes, is_active, created_at, updated_at, definition:organization_inspection_definitions(id, organization_id, name, basis, model_id, warning_days, warning_hours, notes, is_active, created_at, updated_at)")
    .eq("aircraft_id", aircraftId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    definition: Array.isArray(row.definition) ? row.definition[0] ?? null : row.definition,
  })) as AircraftInspectionAssignment[];
}

export async function saveAircraftInspectionAssignment(input: {
  id?: string;
  definition_id: string;
  aircraft_id: string;
  due_date?: string | null;
  due_meter?: number | null;
  notes?: string | null;
  is_active?: boolean;
}) {
  const supabase = getSupabaseClient();
  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userResult.user) throw new Error("Sign in to manage inspections.");
  const payload = {
    definition_id: input.definition_id,
    aircraft_id: input.aircraft_id,
    due_date: input.due_date || null,
    due_meter: input.due_meter ?? null,
    notes: input.notes?.trim() || null,
    is_active: input.is_active ?? true,
    updated_by: userResult.user.id,
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? supabase.from("aircraft_inspection_assignments").update(payload).eq("id", input.id)
    : supabase.from("aircraft_inspection_assignments").insert(payload);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data as AircraftInspectionAssignment;
}

export async function deleteAircraftInspectionAssignment(id: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("aircraft_inspection_assignments").delete().eq("id", id);
  if (error) throw error;
}

function normalizeDraftInput(input: FlightBriefDraftInput) {
  return {
    organization_id: input.organization_id || null,
    aircraft_id: input.aircraft_id || null,
    aircraft_tail_number: input.aircraft_tail_number.trim(),
    student_name: input.student_name.trim(),
    instructor_name: input.instructor_name.trim(),
    flight_date: input.flight_date || null,
    etd: input.etd || null,
    eta: input.eta || null,
    ete: input.ete ?? null,
    flight_rules: input.flight_rules || null,
    route: input.route?.trim() || null,
    brief_data: input.brief_data ?? {},
    weather_snapshot: input.weather_snapshot ?? {},
    notam_snapshot: input.notam_snapshot ?? {},
    wb_snapshot: input.wb_snapshot ?? {},
  };
}

function normalizeFlightBrief(value: unknown): FlightBriefRecord {
  const record = (value ?? {}) as Record<string, unknown>;
  return {
    id: String(record.id ?? ""),
    created_by: String(record.created_by ?? ""),
    organization_id: typeof record.organization_id === "string" ? record.organization_id : null,
    aircraft_id: typeof record.aircraft_id === "string" ? record.aircraft_id : null,
    aircraft_tail_number: String(record.aircraft_tail_number ?? ""),
    student_name: String(record.student_name ?? ""),
    instructor_name: String(record.instructor_name ?? ""),
    flight_date: typeof record.flight_date === "string" ? record.flight_date : null,
    etd: typeof record.etd === "string" ? record.etd : null,
    eta: typeof record.eta === "string" ? record.eta : null,
    ete: toOptionalNumber(record.ete),
    flight_rules: typeof record.flight_rules === "string" ? record.flight_rules : null,
    route: typeof record.route === "string" ? record.route : null,
    status: isFlightBriefStatus(record.status) ? record.status : "draft",
    revision_number: toOptionalNumber(record.revision_number) ?? 1,
    supersedes_id: typeof record.supersedes_id === "string" ? record.supersedes_id : null,
    brief_data: toSnapshot(record.brief_data),
    mx_snapshot: toSnapshot(record.mx_snapshot),
    weather_snapshot: toSnapshot(record.weather_snapshot),
    notam_snapshot: toSnapshot(record.notam_snapshot),
    wb_snapshot: toSnapshot(record.wb_snapshot),
    finalized_at: typeof record.finalized_at === "string" ? record.finalized_at : null,
    created_at: String(record.created_at ?? ""),
    updated_at: String(record.updated_at ?? ""),
  };
}

function toSnapshot(value: unknown): FlightBriefSnapshot {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as FlightBriefSnapshot)
    : {};
}

function toOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isFlightBriefStatus(value: unknown): value is FlightBriefStatus {
  return value === "draft" || value === "finalized" || value === "superseded";
}
