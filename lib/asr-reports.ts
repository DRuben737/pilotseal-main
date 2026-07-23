import { getSupabaseClient } from "@/lib/supabase";
import type {
  AircraftDiscrepancyType,
  OrganizationReportEvent,
  OrganizationReportStatus,
} from "@/lib/aircraft-reports";

export type AsrReviewerCapability =
  | "training_reviewer"
  | "maintenance_reviewer"
  | "safety_reviewer";

export type AsrOptionCategory =
  | "occurrence_type"
  | "nature_of_flight"
  | "phase_of_flight"
  | "maneuver"
  | "training_area"
  | "program"
  | "day_night"
  | "flight_conditions"
  | "precipitation"
  | "intensity"
  | "external_agency";

export type AsrOption = {
  id: string;
  organization_id: string;
  category: AsrOptionCategory;
  value: string;
  sort_order: number;
  is_active: boolean;
};

export type AsrReviewerAssignment = {
  organization_id: string;
  user_id: string;
  capability: AsrReviewerCapability;
  assigned_by: string | null;
  created_at: string;
};

export type AsrReportData = {
  source_discrepancy_report_id: string;
  occurrence_date: string;
  occurrence_local_time: string;
  aircraft_id: string;
  aircraft_registration: string;
  aircraft_type: string;
  no_aircraft: boolean;
  type_of_occurrence: string;
  nature_of_flight: string;
  route_from: string;
  route_to: string;
  training_area: string;
  phase_of_flight: string;
  training_maneuver: string;
  aircraft_commander_person_id: string;
  aircraft_commander_name: string;
  put_sic_person_id: string;
  put_sic_name: string;
  student_person_id: string;
  instructor_person_id: string;
  other_crew: string;
  passengers: string;
  program: string;
  wind: string;
  turbulence: string;
  day_night: string;
  visibility_sm: string;
  flight_conditions: string;
  precipitation: string;
  oat_c: string;
  icing: string;
  precipitation_intensity: string;
  fuel_state_value: string;
  fuel_state_unit: "Gal" | "Lbs" | "Kg";
  gross_weight_value: string;
  gross_weight_unit: "Lbs" | "Kg";
  speed_value: string;
  speed_unit: "KIAS" | "KTAS" | "MPH";
  altitude_value: string;
  altitude_unit: "ft" | "m";
  description: string;
  reporter_title: string;
};

export type AsrExternalNotification = {
  id?: string;
  agency: string;
  notified_on: string;
  contact_information: string;
};

export type AsrReport = {
  id: string;
  organization_id: string;
  status: OrganizationReportStatus | "draft" | "superseded";
  reference_number: string | null;
  revision_number: number;
  supersedes_report_id: string | null;
  submitted_by: string;
  submitted_by_name: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  source_discrepancy_report_id: string | null;
  aircraft_id: string | null;
  aircraft_tail_number: string | null;
  aircraft_type: string | null;
  occurrence_date: string | null;
  occurrence_local_time: string | null;
  type_of_occurrence: string | null;
  description: string | null;
  report_data: AsrReportData;
  reporter_title: string | null;
  reporter_signed_name: string | null;
  reporter_signed_at: string | null;
  risk_score: number | null;
  risk_rated_name: string | null;
  risk_rated_at: string | null;
  training_review_required: boolean;
  training_comments: string | null;
  training_signed_name: string | null;
  training_signed_title: string | null;
  training_signed_at: string | null;
  maintenance_review_required: boolean;
  maintenance_comments: string | null;
  maintenance_action: Record<string, unknown>;
  maintenance_signed_name: string | null;
  maintenance_signed_title: string | null;
  maintenance_signed_at: string | null;
  safety_comments: string | null;
  hazard_log_reference: string | null;
  internal_investigation_reference: string | null;
  safety_signed_name: string | null;
  safety_signed_title: string | null;
  safety_signed_at: string | null;
  external_notifications: AsrExternalNotification[];
  events: OrganizationReportEvent[];
};

export const ASR_RISK_SCORES = [1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 16, 20, 25] as const;

export function createEmptyAsrReportData(): AsrReportData {
  return {
    source_discrepancy_report_id: "",
    occurrence_date: new Date().toISOString().slice(0, 10),
    occurrence_local_time: "",
    aircraft_id: "",
    aircraft_registration: "",
    aircraft_type: "",
    no_aircraft: false,
    type_of_occurrence: "",
    nature_of_flight: "",
    route_from: "",
    route_to: "",
    training_area: "",
    phase_of_flight: "",
    training_maneuver: "",
    aircraft_commander_person_id: "",
    aircraft_commander_name: "",
    put_sic_person_id: "",
    put_sic_name: "",
    student_person_id: "",
    instructor_person_id: "",
    other_crew: "",
    passengers: "",
    program: "",
    wind: "",
    turbulence: "",
    day_night: "",
    visibility_sm: "",
    flight_conditions: "",
    precipitation: "",
    oat_c: "",
    icing: "",
    precipitation_intensity: "",
    fuel_state_value: "",
    fuel_state_unit: "Gal",
    gross_weight_value: "",
    gross_weight_unit: "Lbs",
    speed_value: "",
    speed_unit: "KIAS",
    altitude_value: "",
    altitude_unit: "ft",
    description: "",
    reporter_title: "",
  };
}

const ASR_REPORT_SELECT = `
  id, organization_id, status, reference_number, revision_number,
  supersedes_report_id, submitted_by, submitted_by_name,
  created_at, updated_at, closed_at,
  asr_reports!asr_reports_report_id_fkey (
    source_discrepancy_report_id, aircraft_id, aircraft_tail_number,
    aircraft_type, occurrence_date, occurrence_local_time,
    type_of_occurrence, description, report_data, reporter_title,
    reporter_signed_name, reporter_signed_at, risk_score,
    risk_rated_name, risk_rated_at,
    training_review_required, training_comments, training_signed_name,
    training_signed_title, training_signed_at,
    maintenance_review_required, maintenance_comments, maintenance_action,
    maintenance_signed_name, maintenance_signed_title, maintenance_signed_at,
    safety_comments, hazard_log_reference, internal_investigation_reference,
    safety_signed_name, safety_signed_title, safety_signed_at,
    asr_external_notifications (
      id, agency, notified_on, contact_information, sort_order
    )
  ),
  organization_report_events (
    id, event_type, actor_user_id, actor_name, details, created_at
  )
`;

export async function fetchOrganizationAsrReports(
  organizationId: string
): Promise<AsrReport[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("organization_reports")
    .select(ASR_REPORT_SELECT)
    .eq("organization_id", organizationId)
    .eq("report_type", "asr")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .map((value) => normalizeAsrReport(value as unknown as Record<string, unknown>))
    .filter((value): value is AsrReport => value !== null);
}

export async function fetchAsrOptions(organizationId: string): Promise<AsrOption[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("organization_asr_options")
    .select("id, organization_id, category, value, sort_order, is_active")
    .eq("organization_id", organizationId)
    .order("category")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as AsrOption[];
}

export async function createAsrOption(input: {
  organizationId: string;
  category: AsrOptionCategory;
  value: string;
}) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("organization_asr_options").insert({
    organization_id: input.organizationId,
    category: input.category,
    value: input.value.trim(),
  });
  if (error) throw error;
}

export async function setAsrOptionActive(optionId: string, isActive: boolean) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("organization_asr_options")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", optionId);
  if (error) throw error;
}

export async function fetchAsrReviewerAssignments(
  organizationId: string
): Promise<AsrReviewerAssignment[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("organization_report_reviewer_assignments")
    .select("organization_id, user_id, capability, assigned_by, created_at")
    .eq("organization_id", organizationId);
  if (error) throw error;
  return (data ?? []) as AsrReviewerAssignment[];
}

export async function setAsrReviewerCapability(input: {
  organizationId: string;
  userId: string;
  capability: AsrReviewerCapability;
  enabled: boolean;
}) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("set_organization_report_reviewer_capability", {
    p_organization_id: input.organizationId,
    p_user_id: input.userId,
    p_capability: input.capability,
    p_enabled: input.enabled,
  });
  if (error) throw error;
}

export async function saveAsrDraft(input: {
  organizationId: string;
  reportId?: string | null;
  clientRequestId: string;
  reportData: AsrReportData;
}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("save_asr_draft", {
    p_organization_id: input.organizationId,
    p_report_id: input.reportId || null,
    p_client_request_id: input.clientRequestId,
    p_report_data: input.reportData,
  });
  if (error) throw error;
  return String(data ?? "");
}

export async function submitAsrReport(input: {
  reportId: string;
  createDiscrepancy: boolean;
  discrepancyType?: AircraftDiscrepancyType | null;
  discrepancyDescription?: string | null;
  groundAircraft: boolean;
}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("submit_asr_report", {
    p_report_id: input.reportId,
    p_create_discrepancy: input.createDiscrepancy,
    p_discrepancy_type: input.discrepancyType || null,
    p_discrepancy_description: input.discrepancyDescription?.trim() || null,
    p_ground_aircraft: input.groundAircraft,
  });
  if (error) throw error;
  return String(data ?? "");
}

export async function configureAsrReview(input: {
  reportId: string;
  riskScore: number;
  trainingRequired: boolean;
  maintenanceRequired: boolean;
}) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("configure_asr_review", {
    p_report_id: input.reportId,
    p_risk_score: input.riskScore,
    p_training_required: input.trainingRequired,
    p_maintenance_required: input.maintenanceRequired,
  });
  if (error) throw error;
}

export async function completeAsrTrainingReview(input: {
  reportId: string;
  comments: string;
  title: string;
}) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("complete_asr_training_review", {
    p_report_id: input.reportId,
    p_comments: input.comments.trim(),
    p_title: input.title.trim(),
  });
  if (error) throw error;
}

export async function completeAsrMaintenanceReview(input: {
  reportId: string;
  comments: string;
  title: string;
  maintenanceAction: Record<string, unknown>;
}) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("complete_asr_maintenance_review", {
    p_report_id: input.reportId,
    p_comments: input.comments.trim(),
    p_title: input.title.trim(),
    p_maintenance_action: input.maintenanceAction,
  });
  if (error) throw error;
}

export async function closeAsrReport(input: {
  reportId: string;
  safetyComments: string;
  hazardLogReference?: string;
  internalInvestigationReference?: string;
  title: string;
  externalNotifications: AsrExternalNotification[];
}) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("close_asr_report", {
    p_report_id: input.reportId,
    p_safety_comments: input.safetyComments.trim(),
    p_hazard_log_reference: input.hazardLogReference?.trim() || null,
    p_internal_investigation_reference:
      input.internalInvestigationReference?.trim() || null,
    p_title: input.title.trim(),
    p_external_notifications: input.externalNotifications.map((notification) => ({
      agency: notification.agency,
      notified_on: notification.notified_on || null,
      contact_information: notification.contact_information || null,
    })),
  });
  if (error) throw error;
}

export async function createAsrRevision(reportId: string, reason: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("create_asr_revision", {
    p_report_id: reportId,
    p_reason: reason.trim(),
  });
  if (error) throw error;
  return String(data ?? "");
}

function normalizeAsrReport(value: Record<string, unknown>): AsrReport | null {
  const detailValue = Array.isArray(value.asr_reports)
    ? value.asr_reports[0]
    : value.asr_reports;
  const detail = (detailValue ?? null) as Record<string, unknown> | null;
  if (!detail) return null;
  const notificationValues = Array.isArray(detail.asr_external_notifications)
    ? detail.asr_external_notifications
    : [];
  const eventValues = Array.isArray(value.organization_report_events)
    ? value.organization_report_events
    : [];
  return {
    id: String(value.id ?? ""),
    organization_id: String(value.organization_id ?? ""),
    status: normalizeStatus(value.status),
    reference_number: nullableString(value.reference_number),
    revision_number: Number(value.revision_number ?? 1),
    supersedes_report_id: nullableString(value.supersedes_report_id),
    submitted_by: String(value.submitted_by ?? ""),
    submitted_by_name: String(value.submitted_by_name ?? "Organization member"),
    created_at: String(value.created_at ?? ""),
    updated_at: String(value.updated_at ?? ""),
    closed_at: nullableString(value.closed_at),
    source_discrepancy_report_id: nullableString(detail.source_discrepancy_report_id),
    aircraft_id: nullableString(detail.aircraft_id),
    aircraft_tail_number: nullableString(detail.aircraft_tail_number),
    aircraft_type: nullableString(detail.aircraft_type),
    occurrence_date: nullableString(detail.occurrence_date),
    occurrence_local_time: nullableString(detail.occurrence_local_time)?.slice(0, 5) ?? null,
    type_of_occurrence: nullableString(detail.type_of_occurrence),
    description: nullableString(detail.description),
    report_data: normalizeReportData(detail.report_data),
    reporter_title: nullableString(detail.reporter_title),
    reporter_signed_name: nullableString(detail.reporter_signed_name),
    reporter_signed_at: nullableString(detail.reporter_signed_at),
    risk_score: nullableNumber(detail.risk_score),
    risk_rated_name: nullableString(detail.risk_rated_name),
    risk_rated_at: nullableString(detail.risk_rated_at),
    training_review_required: Boolean(detail.training_review_required),
    training_comments: nullableString(detail.training_comments),
    training_signed_name: nullableString(detail.training_signed_name),
    training_signed_title: nullableString(detail.training_signed_title),
    training_signed_at: nullableString(detail.training_signed_at),
    maintenance_review_required: Boolean(detail.maintenance_review_required),
    maintenance_comments: nullableString(detail.maintenance_comments),
    maintenance_action: normalizeObject(detail.maintenance_action),
    maintenance_signed_name: nullableString(detail.maintenance_signed_name),
    maintenance_signed_title: nullableString(detail.maintenance_signed_title),
    maintenance_signed_at: nullableString(detail.maintenance_signed_at),
    safety_comments: nullableString(detail.safety_comments),
    hazard_log_reference: nullableString(detail.hazard_log_reference),
    internal_investigation_reference: nullableString(
      detail.internal_investigation_reference
    ),
    safety_signed_name: nullableString(detail.safety_signed_name),
    safety_signed_title: nullableString(detail.safety_signed_title),
    safety_signed_at: nullableString(detail.safety_signed_at),
    external_notifications: notificationValues
      .map((item) => {
        const record = (item ?? {}) as Record<string, unknown>;
        return {
          id: nullableString(record.id) ?? undefined,
          agency: String(record.agency ?? ""),
          notified_on: nullableString(record.notified_on) ?? "",
          contact_information: nullableString(record.contact_information) ?? "",
          sort_order: Number(record.sort_order ?? 0),
        };
      })
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((notification) => ({
        id: notification.id,
        agency: notification.agency,
        notified_on: notification.notified_on,
        contact_information: notification.contact_information,
      })),
    events: eventValues
      .map((item) => {
        const record = (item ?? {}) as Record<string, unknown>;
        return {
          id: String(record.id ?? ""),
          event_type: String(record.event_type ?? "submitted") as OrganizationReportEvent["event_type"],
          actor_user_id: nullableString(record.actor_user_id),
          actor_name: String(record.actor_name ?? "Organization member"),
          details: normalizeObject(record.details),
          created_at: String(record.created_at ?? ""),
        };
      })
      .sort((left, right) => left.created_at.localeCompare(right.created_at)),
  };
}

function normalizeReportData(value: unknown): AsrReportData {
  return { ...createEmptyAsrReportData(), ...normalizeObject(value) } as AsrReportData;
}

function normalizeObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeStatus(value: unknown): AsrReport["status"] {
  if (
    value === "draft" ||
    value === "submitted" ||
    value === "in_review" ||
    value === "closed" ||
    value === "superseded"
  ) return value;
  return "draft";
}

function nullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
