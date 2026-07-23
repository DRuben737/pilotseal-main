import { getSupabaseClient } from "@/lib/supabase";

export const AIRCRAFT_DISCREPANCY_TYPES = [
  "Wings",
  "Fuselage",
  "Main Rotor",
  "Tail Rotor",
  "Propeller",
  "Flight Controls",
  "Engine",
  "Fuel",
  "Landing Gear",
  "Electrical/Lighting",
  "Flight Instrument",
  "Hobbs",
  "Pitot Static",
  "Radio",
  "Navigation",
  "EFIS",
  "Transponder/ADS-B",
  "Auto Pilot",
] as const;

export type AircraftDiscrepancyType = (typeof AIRCRAFT_DISCREPANCY_TYPES)[number];
export type OrganizationReportStatus = "submitted" | "in_review" | "closed";
export type TriState = boolean | null;

export type OrganizationReportPerson = {
  person_id: string;
  user_id: string | null;
  display_name: string;
  teaching_role: "student" | "instructor" | null;
  status: "pending" | "linked";
};

export type OrganizationReportEvent = {
  id: string;
  event_type:
    | "submitted"
    | "instructor_signed"
    | "grounded"
    | "reviewed"
    | "closed"
    | "asr_submitted"
    | "review_requested"
    | "risk_rated"
    | "training_review_completed"
    | "maintenance_review_completed"
    | "safety_review_completed"
    | "revision_created"
    | "linked";
  actor_user_id: string | null;
  actor_name: string;
  details: Record<string, unknown>;
  created_at: string;
};

export type AircraftDiscrepancyReport = {
  id: string;
  organization_id: string;
  status: OrganizationReportStatus;
  submitted_by: string;
  submitted_by_name: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  aircraft_id: string;
  aircraft_tail_number: string;
  report_date: string;
  student_person_id: string | null;
  student_name: string | null;
  instructor_person_id: string | null;
  instructor_name: string | null;
  flight_hobbs_end: number | null;
  maintenance_hobbs_end: number | null;
  flight_duration: number | null;
  discrepancy_type: AircraftDiscrepancyType;
  description: string;
  asr_submitted: TriState;
  deferrable: TriState;
  aircraft_down: TriState;
  credit_applied: TriState;
  instructor_signed_by: string | null;
  instructor_signed_name: string | null;
  instructor_signed_at: string | null;
  processed_by: string | null;
  processed_by_name: string | null;
  credit_authorized_by: string | null;
  credit_authorized_name: string | null;
  credit_authorized_at: string | null;
  events: OrganizationReportEvent[];
};

export type SubmitAircraftDiscrepancyInput = {
  organizationId: string;
  clientRequestId: string;
  aircraftId: string;
  reportDate: string;
  studentPersonId?: string | null;
  instructorPersonId?: string | null;
  flightHobbsEnd?: number | null;
  maintenanceHobbsEnd?: number | null;
  flightDuration?: number | null;
  discrepancyType: AircraftDiscrepancyType;
  description: string;
  groundAircraft: boolean;
};

export type ProcessAircraftDiscrepancyInput = {
  reportId: string;
  status: OrganizationReportStatus;
  instructorPersonId?: string | null;
  asrSubmitted: TriState;
  deferrable: TriState;
  aircraftDown: TriState;
  creditApplied: TriState;
  creditAuthorized: boolean;
};

const REPORT_SELECT = `
  id, organization_id, status, submitted_by, submitted_by_name,
  created_at, updated_at, closed_at,
  aircraft_discrepancy_reports (
    aircraft_id, aircraft_tail_number, report_date,
    student_person_id, student_name, instructor_person_id, instructor_name,
    flight_hobbs_end, maintenance_hobbs_end, flight_duration,
    discrepancy_type, description, is_asr_submitted, is_deferrable, is_aircraft_down,
    is_credit_applied, instructor_signed_by, instructor_signed_name,
    instructor_signed_at, processed_by, processed_by_name,
    credit_authorized_by, credit_authorized_name, credit_authorized_at
  ),
  organization_report_events (
    id, event_type, actor_user_id, actor_name, details, created_at
  )
`;

export async function fetchOrganizationAircraftReports(
  organizationId: string
): Promise<AircraftDiscrepancyReport[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("organization_reports")
    .select(REPORT_SELECT)
    .eq("organization_id", organizationId)
    .eq("report_type", "aircraft_discrepancy")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? [])
    .map((value) => normalizeAircraftDiscrepancyReport(value as unknown as Record<string, unknown>))
    .filter((value): value is AircraftDiscrepancyReport => value !== null);
}

export async function fetchOrganizationReportPeople(
  organizationId: string
): Promise<OrganizationReportPerson[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("list_organization_report_people", {
    p_organization_id: organizationId,
  });
  if (error) throw error;

  return ((data ?? []) as Array<Record<string, unknown>>).map((record) => ({
    person_id: String(record.person_id ?? ""),
    user_id: typeof record.user_id === "string" ? record.user_id : null,
    display_name: String(record.display_name ?? "Organization person"),
    teaching_role:
      record.teaching_role === "student" || record.teaching_role === "instructor"
        ? record.teaching_role
        : null,
    status: record.status === "linked" ? "linked" : "pending",
  }));
}

export async function submitAircraftDiscrepancyReport(
  input: SubmitAircraftDiscrepancyInput
): Promise<string> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("submit_aircraft_discrepancy_report", {
    p_organization_id: input.organizationId,
    p_client_request_id: input.clientRequestId,
    p_aircraft_id: input.aircraftId,
    p_report_date: input.reportDate,
    p_student_person_id: input.studentPersonId || null,
    p_instructor_person_id: input.instructorPersonId || null,
    p_flight_hobbs_end: input.flightHobbsEnd ?? null,
    p_maintenance_hobbs_end: input.maintenanceHobbsEnd ?? null,
    p_flight_duration: input.flightDuration ?? null,
    p_discrepancy_type: input.discrepancyType,
    p_description: input.description.trim(),
    p_ground_aircraft: input.groundAircraft,
  });
  if (error) throw error;
  return String(data ?? "");
}

export async function signAircraftDiscrepancyReport(reportId: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("sign_aircraft_discrepancy_report", {
    p_report_id: reportId,
  });
  if (error) throw error;
}

export async function processAircraftDiscrepancyReport(
  input: ProcessAircraftDiscrepancyInput
) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("process_aircraft_discrepancy_report", {
    p_report_id: input.reportId,
    p_status: input.status,
    p_instructor_person_id: input.instructorPersonId || null,
    p_asr_submitted: input.asrSubmitted,
    p_deferrable: input.deferrable,
    p_aircraft_down: input.aircraftDown,
    p_credit_applied: input.creditApplied,
    p_credit_authorized: input.creditAuthorized,
  });
  if (error) throw error;
}

function normalizeAircraftDiscrepancyReport(
  value: Record<string, unknown>
): AircraftDiscrepancyReport | null {
  const detailValue = Array.isArray(value.aircraft_discrepancy_reports)
    ? value.aircraft_discrepancy_reports[0]
    : value.aircraft_discrepancy_reports;
  const detail = (detailValue ?? null) as Record<string, unknown> | null;
  if (!detail) return null;

  const events = Array.isArray(value.organization_report_events)
    ? value.organization_report_events
        .map(normalizeEvent)
        .sort((left, right) => left.created_at.localeCompare(right.created_at))
    : [];

  return {
    id: String(value.id ?? ""),
    organization_id: String(value.organization_id ?? ""),
    status: normalizeStatus(value.status),
    submitted_by: String(value.submitted_by ?? ""),
    submitted_by_name: String(value.submitted_by_name ?? "Organization member"),
    created_at: String(value.created_at ?? ""),
    updated_at: String(value.updated_at ?? ""),
    closed_at: nullableString(value.closed_at),
    aircraft_id: String(detail.aircraft_id ?? ""),
    aircraft_tail_number: String(detail.aircraft_tail_number ?? ""),
    report_date: String(detail.report_date ?? ""),
    student_person_id: nullableString(detail.student_person_id),
    student_name: nullableString(detail.student_name),
    instructor_person_id: nullableString(detail.instructor_person_id),
    instructor_name: nullableString(detail.instructor_name),
    flight_hobbs_end: nullableNumber(detail.flight_hobbs_end),
    maintenance_hobbs_end: nullableNumber(detail.maintenance_hobbs_end),
    flight_duration: nullableNumber(detail.flight_duration),
    discrepancy_type: String(detail.discrepancy_type ?? "Wings") as AircraftDiscrepancyType,
    description: String(detail.description ?? ""),
    asr_submitted: nullableBoolean(detail.is_asr_submitted),
    deferrable: nullableBoolean(detail.is_deferrable),
    aircraft_down: nullableBoolean(detail.is_aircraft_down),
    credit_applied: nullableBoolean(detail.is_credit_applied),
    instructor_signed_by: nullableString(detail.instructor_signed_by),
    instructor_signed_name: nullableString(detail.instructor_signed_name),
    instructor_signed_at: nullableString(detail.instructor_signed_at),
    processed_by: nullableString(detail.processed_by),
    processed_by_name: nullableString(detail.processed_by_name),
    credit_authorized_by: nullableString(detail.credit_authorized_by),
    credit_authorized_name: nullableString(detail.credit_authorized_name),
    credit_authorized_at: nullableString(detail.credit_authorized_at),
    events,
  };
}

function normalizeEvent(value: unknown): OrganizationReportEvent {
  const record = (value ?? {}) as Record<string, unknown>;
  return {
    id: String(record.id ?? ""),
    event_type: String(record.event_type ?? "submitted") as OrganizationReportEvent["event_type"],
    actor_user_id: nullableString(record.actor_user_id),
    actor_name: String(record.actor_name ?? "Organization member"),
    details:
      record.details && typeof record.details === "object"
        ? (record.details as Record<string, unknown>)
        : {},
    created_at: String(record.created_at ?? ""),
  };
}

function normalizeStatus(value: unknown): OrganizationReportStatus {
  return value === "in_review" || value === "closed" ? value : "submitted";
}

function nullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function nullableBoolean(value: unknown): TriState {
  return typeof value === "boolean" ? value : null;
}
