import { getSupabaseClient } from "@/lib/supabase";

export const ENDORSEMENT_RECORDS_BUCKET = "endorsement-records";

export type EndorsementRecord = {
  id: string;
  user_id: string;
  organization_id: string | null;
  student_id: string | null;
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
};

const ENDORSEMENT_RECORD_SELECTS = [
  "id, user_id, organization_id, student_id, student_name, student_cert_number, instructor_name, instructor_cert_number, endorsement_date, template_titles, storage_path, file_size_bytes, created_at, updated_at",
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

  const basePayload = {
    id: input.id,
    user_id: input.userId,
    organization_id: input.organizationId ?? null,
    student_id: input.studentId || null,
    student_name: input.studentName.trim(),
    student_cert_number: normalizeText(input.studentCertNumber),
    instructor_name: input.instructorName.trim(),
    endorsement_date: input.endorsementDate,
    template_titles: input.templateTitles,
    storage_path: input.storagePath,
    file_size_bytes: input.fileSizeBytes ?? null,
  };

  const attempts = [
    {
      payload: {
        ...basePayload,
        instructor_cert_number: normalizeText(input.instructorCertNumber),
      },
      select: ENDORSEMENT_RECORD_SELECTS[0],
    },
    {
      payload: basePayload,
      select: ENDORSEMENT_RECORD_SELECTS[1],
    },
  ];

  let lastError: unknown = null;

  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from("endorsement_records")
      .insert(attempt.payload)
      .select(attempt.select)
      .single();

    if (!error) {
      return normalizeRecord((data as unknown) as Record<string, unknown>);
    }

    lastError = error;
  }

  throw lastError;
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

export async function fetchOrganizationEndorsementRecords(organizationId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("endorsement_records")
    .select(ENDORSEMENT_RECORD_SELECTS[0])
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
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
