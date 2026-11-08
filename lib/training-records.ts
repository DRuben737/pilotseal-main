import { getSupabaseClient } from "@/lib/supabase";

export type TrainingRecordScore = {
  line_item_id: string;
  position: number;
  text: string;
  minimum_score: number;
  score: number | null;
  note: string;
};

export type TrainingRecordFinalStatus =
  "completed" | "incomplete" | "unsatisfactory";

export type TrainingRecordInstructor = {
  user_id: string;
  display_name: string;
};

export type TrainingRecord = {
  id: string;
  organization_id: string;
  created_by_user_id: string;
  instructor_user_id: string;
  student_person_id: string;
  student_user_id: string | null;
  course_id: string;
  course_module_id: string;
  student_name: string;
  instructor_name: string;
  course_title: string;
  course_revision: string;
  stage_number: number;
  module_number: number;
  module_type: string;
  lesson_date: string;
  aircraft_type: string;
  aircraft_tail_number: string;
  category_sel: number;
  category_mel: number;
  time_dual: number;
  time_pic: number;
  time_solo: number;
  condition_day: number;
  condition_night: number;
  condition_xc: number;
  condition_actual: number;
  condition_simulated: number;
  approaches: number;
  landings_day: number;
  landings_night: number;
  route_from: string;
  route_to: string;
  flight_duration: number;
  remarks: string;
  scores: TrainingRecordScore[];
  final_status: TrainingRecordFinalStatus | null;
  record_status: "draft" | "completed";
  passed: boolean;
  created_at: string;
  updated_at: string;
};

export type TrainingRecordInput = Pick<
  TrainingRecord,
  | "organization_id"
  | "instructor_user_id"
  | "student_person_id"
  | "course_id"
  | "course_module_id"
  | "lesson_date"
  | "aircraft_type"
  | "aircraft_tail_number"
  | "category_sel"
  | "category_mel"
  | "time_dual"
  | "time_pic"
  | "time_solo"
  | "condition_day"
  | "condition_night"
  | "condition_xc"
  | "condition_actual"
  | "condition_simulated"
  | "approaches"
  | "landings_day"
  | "landings_night"
  | "route_from"
  | "route_to"
  | "flight_duration"
  | "remarks"
  | "scores"
  | "final_status"
> & { id?: string };

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeScore(value: unknown): TrainingRecordScore | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const score = row.score == null ? null : numberValue(row.score);
  return {
    line_item_id: String(row.line_item_id ?? ""),
    position: numberValue(row.position),
    text: String(row.text ?? ""),
    minimum_score: numberValue(row.minimum_score),
    score,
    note: String(row.note ?? ""),
  };
}

function normalizeRecord(value: unknown): TrainingRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const numericFields = [
    "stage_number",
    "module_number",
    "category_sel",
    "category_mel",
    "time_dual",
    "time_pic",
    "time_solo",
    "condition_day",
    "condition_night",
    "condition_xc",
    "condition_actual",
    "condition_simulated",
    "approaches",
    "landings_day",
    "landings_night",
    "flight_duration",
  ] as const;
  const normalized = {
    ...row,
    id: String(row.id ?? ""),
    organization_id: String(row.organization_id ?? ""),
    created_by_user_id: String(row.created_by_user_id ?? ""),
    instructor_user_id: String(row.instructor_user_id ?? ""),
    student_person_id: String(row.student_person_id ?? ""),
    student_user_id:
      typeof row.student_user_id === "string" ? row.student_user_id : null,
    course_id: String(row.course_id ?? ""),
    course_module_id: String(row.course_module_id ?? ""),
    student_name: String(row.student_name ?? ""),
    instructor_name: String(row.instructor_name ?? ""),
    course_title: String(row.course_title ?? ""),
    course_revision: String(row.course_revision ?? ""),
    module_type: String(row.module_type ?? ""),
    lesson_date: String(row.lesson_date ?? ""),
    aircraft_type: String(row.aircraft_type ?? ""),
    aircraft_tail_number: String(row.aircraft_tail_number ?? ""),
    route_from: String(row.route_from ?? ""),
    route_to: String(row.route_to ?? ""),
    remarks: String(row.remarks ?? ""),
    scores: Array.isArray(row.scores)
      ? row.scores
          .map(normalizeScore)
          .filter((score): score is TrainingRecordScore => Boolean(score))
      : [],
    record_status: row.record_status === "completed" ? "completed" : "draft",
    final_status:
      row.final_status === "completed" ||
      row.final_status === "incomplete" ||
      row.final_status === "unsatisfactory"
        ? row.final_status
        : null,
    passed: row.passed === true,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  } as Record<string, unknown>;
  for (const field of numericFields)
    normalized[field] = numberValue(row[field]);
  return normalized as TrainingRecord;
}

export async function fetchMyTrainingRecords() {
  const { data, error } = await getSupabaseClient().rpc(
    "list_my_training_records",
  );
  if (error) throw error;
  return (Array.isArray(data) ? data : []).flatMap((value) => {
    const record = normalizeRecord(value);
    return record ? [record] : [];
  });
}

export async function fetchTrainingRecordInstructors(
  organizationId: string,
): Promise<TrainingRecordInstructor[]> {
  const { data, error } = await getSupabaseClient().rpc(
    "list_training_record_instructors",
    { p_organization_id: organizationId },
  );
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    user_id: String(row.user_id ?? ""),
    display_name: String(row.display_name ?? "Instructor"),
  }));
}

export async function saveMyTrainingRecord(input: TrainingRecordInput) {
  const { data, error } = await getSupabaseClient().rpc(
    "save_my_training_record",
    { p_record: input },
  );
  if (error) throw error;
  return String(data ?? "");
}

export async function deleteMyTrainingRecord(recordId: string) {
  const { error } = await getSupabaseClient().rpc("delete_my_training_record", {
    p_record_id: recordId,
  });
  if (error) throw error;
}
