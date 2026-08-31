import { getSupabaseClient } from "@/lib/supabase";

export const ENDORSEMENT_RECORDS_BUCKET = "endorsement-records";

export type EndorsementRecord = {
  id: string;
  user_id: string;
  organization_id: string | null;
  student_id: string | null;
  student_user_id: string | null;
  instructor_membership_period_id: string | null;
  student_membership_period_id: string | null;
  scope_status: "personal" | "confirmed" | "pending_review";
  supersedes_record_id: string | null;
  student_name: string;
  student_cert_number: string | null;
  instructor_name: string;
  instructor_cert_number: string | null;
  endorsement_date: string;
  template_titles: string[];
  storage_path: string;
  file_size_bytes: number | null;
  created_at: string;
};

export type LegacyEndorsementReviewContext = {
  record_id: string;
  organization_id: string;
  organization_name: string;
  linked_student_user_id: string | null;
  linked_student_name: string | null;
  linked_student_email: string | null;
  account_linked: boolean;
  organization_student: boolean;
  student_period_at_record: string | null;
  instructor_period_at_record: string | null;
  requires_historical_attestation: boolean;
  blocker: string | null;
};

export type CreateEndorsementRecordInput = {
  id: string;
  userId: string;
  organizationId?: string | null;
  studentId?: string | null;
  studentName: string;
  studentCertNumber?: string | null;
  instructorName: string;
  instructorCertNumber?: string | null;
  endorsementDate: string;
  templateTitles: string[];
  storagePath: string;
  fileSizeBytes?: number | null;
  supersedesRecordId?: string | null;
};

const ENDORSEMENT_RECORD_SELECTS = [
  "id, user_id, organization_id, student_id, student_user_id, instructor_membership_period_id, student_membership_period_id, scope_status, supersedes_record_id, student_name, student_cert_number, instructor_name, instructor_cert_number, endorsement_date, template_titles, storage_path, file_size_bytes, created_at, updated_at",
  "id, user_id, student_id, student_name, student_cert_number, instructor_name, endorsement_date, template_titles, storage_path, file_size_bytes, created_at",
];

function normalizeText(value?: string | null) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : null;
}

function normalizeRecord(record: Record<string, unknown>): EndorsementRecord {
  return {
    id: String(record.id ?? ""),
    user_id: String(record.user_id ?? ""),
    organization_id: typeof record.organization_id === "string" ? record.organization_id : null,
    student_id: typeof record.student_id === "string" ? record.student_id : null,
    student_user_id: typeof record.student_user_id === "string" ? record.student_user_id : null,
    instructor_membership_period_id: typeof record.instructor_membership_period_id === "string" ? record.instructor_membership_period_id : null,
    student_membership_period_id: typeof record.student_membership_period_id === "string" ? record.student_membership_period_id : null,
    scope_status:
      record.scope_status === "confirmed" || record.scope_status === "pending_review"
        ? record.scope_status
        : "personal",
    supersedes_record_id: typeof record.supersedes_record_id === "string" ? record.supersedes_record_id : null,
    student_name: String(record.student_name ?? ""),
    student_cert_number:
      typeof record.student_cert_number === "string" ? record.student_cert_number : null,
    instructor_name: String(record.instructor_name ?? ""),
    instructor_cert_number:
      typeof record.instructor_cert_number === "string" ? record.instructor_cert_number : null,
    endorsement_date: String(record.endorsement_date ?? ""),
    template_titles: Array.isArray(record.template_titles)
      ? record.template_titles.map((title) => String(title))
      : [],
    storage_path: String(record.storage_path ?? ""),
    file_size_bytes:
      typeof record.file_size_bytes === "number" ? record.file_size_bytes : null,
    created_at: String(record.created_at ?? ""),
  };
}

export async function createEndorsementRecord(input: CreateEndorsementRecordInput) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("create_endorsement_record", {
    p_id: input.id,
    p_organization_id: input.organizationId || null,
    p_student_id: input.studentId || null,
    p_student_name: input.studentName.trim(),
    p_student_cert_number: normalizeText(input.studentCertNumber),
    p_instructor_name: input.instructorName.trim(),
    p_instructor_cert_number: normalizeText(input.instructorCertNumber),
    p_endorsement_date: input.endorsementDate,
    p_template_titles: input.templateTitles,
    p_storage_path: input.storagePath,
    p_file_size_bytes: input.fileSizeBytes ?? null,
    p_supersedes_record_id: input.supersedesRecordId ?? null,
  });
  if (error) throw error;
  return normalizeRecord(data as unknown as Record<string, unknown>);
}

export async function fetchEndorsementRecords(userId: string) {
  const supabase = getSupabaseClient();

  let lastError: unknown = null;

  for (const select of ENDORSEMENT_RECORD_SELECTS) {
    const { data, error } = await supabase
      .from("endorsement_records")
      .select(select)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!error) {
      return ((data ?? []) as unknown as Record<string, unknown>[]).map(normalizeRecord);
    }

    lastError = error;
  }

  throw lastError;
}

export async function fetchReceivedEndorsementRecords(userId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("endorsement_records")
    .select(ENDORSEMENT_RECORD_SELECTS[0])
    .eq("student_user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(normalizeRecord);
}

export async function fetchIssuedOrganizationEndorsementRecords(userId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("endorsement_records")
    .select(ENDORSEMENT_RECORD_SELECTS[0])
    .eq("user_id", userId)
    .eq("scope_status", "confirmed")
    .not("organization_id", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(normalizeRecord);
}

export async function fetchPendingLegacyEndorsementRecords() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("endorsement_records")
    .select(ENDORSEMENT_RECORD_SELECTS[0])
    .eq("scope_status", "pending_review")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(normalizeRecord);
}

export async function fetchLegacyEndorsementReviewContext(recordId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("get_legacy_endorsement_review_context", {
    p_record_id: recordId,
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? null) as LegacyEndorsementReviewContext | null;
}

export async function reviewLegacyEndorsementScope(input: {
  recordId: string;
  decision: "personal" | "confirmed" | "defer";
  note: string;
  confirmHistoricalEvidence?: boolean;
}) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("review_legacy_endorsement_scope_v2", {
    p_record_id: input.recordId,
    p_decision: input.decision,
    p_note: input.note.trim(),
    p_confirm_historical_evidence: input.confirmHistoricalEvidence ?? false,
  });
  if (error) throw error;
}

export async function fetchOrganizationEndorsementRecords(organizationId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("list_organization_endorsement_records", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(normalizeRecord);
}

export async function updateEndorsementRecord(
  recordId: string,
  input: Pick<EndorsementRecord, "student_name" | "student_cert_number" | "instructor_name" | "instructor_cert_number" | "endorsement_date" | "template_titles">
) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("endorsement_records")
    .update(input)
    .eq("id", recordId)
    .select(ENDORSEMENT_RECORD_SELECTS[0])
    .single();
  if (error) throw error;
  return normalizeRecord(data as unknown as Record<string, unknown>);
}

export async function createEndorsementRecordSignedUrl(storagePath: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage
    .from(ENDORSEMENT_RECORDS_BUCKET)
    .createSignedUrl(storagePath, 10 * 60);

  if (error) {
    throw error;
  }

  return data.signedUrl;
}

export async function deleteEndorsementRecord(record: EndorsementRecord) {
  const supabase = getSupabaseClient();

  const { error: storageError } = await supabase.storage
    .from(ENDORSEMENT_RECORDS_BUCKET)
    .remove([record.storage_path]);

  if (storageError) {
    throw storageError;
  }

  const { error } = await supabase
    .from("endorsement_records")
    .delete()
    .eq("id", record.id)
    .eq("user_id", record.user_id);

  if (error) {
    throw error;
  }
}
