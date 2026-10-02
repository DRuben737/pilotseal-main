import { getSupabaseClient } from "@/lib/supabase";

export const STUDENT_RECORD_FILES_BUCKET = "student-record-files";
export const STUDENT_RECORD_MAX_FILE_SIZE = 5 * 1024 * 1024;
export const STUDENT_RECORD_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export type StudentRecordFolder = {
  id: string;
  owner_user_id: string;
  student_id: string | null;
  student_user_id: string | null;
  student_name: string;
  student_cert_number: string | null;
  created_at: string;
  updated_at: string;
};

export type StudentRecordItem = {
  id: string;
  folder_id: string;
  title: string;
  record_date: string;
  category: string | null;
  notes: string | null;
  storage_path: string | null;
  original_file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  created_at: string;
  updated_at: string;
};

export type StudentRecordItemInput = {
  id: string;
  folderId: string;
  title: string;
  recordDate: string;
  category?: string | null;
  notes?: string | null;
  storagePath?: string | null;
  originalFileName?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
};

function normalizeFolder(record: Record<string, unknown>): StudentRecordFolder {
  return {
    id: String(record.id ?? ""),
    owner_user_id: String(record.owner_user_id ?? ""),
    student_id: typeof record.student_id === "string" ? record.student_id : null,
    student_user_id: typeof record.student_user_id === "string" ? record.student_user_id : null,
    student_name: String(record.student_name ?? ""),
    student_cert_number:
      typeof record.student_cert_number === "string" ? record.student_cert_number : null,
    created_at: String(record.created_at ?? ""),
    updated_at: String(record.updated_at ?? record.created_at ?? ""),
  };
}

function normalizeItem(record: Record<string, unknown>): StudentRecordItem {
  return {
    id: String(record.id ?? ""),
    folder_id: String(record.folder_id ?? ""),
    title: String(record.title ?? ""),
    record_date: String(record.record_date ?? ""),
    category: typeof record.category === "string" ? record.category : null,
    notes: typeof record.notes === "string" ? record.notes : null,
    storage_path: typeof record.storage_path === "string" ? record.storage_path : null,
    original_file_name:
      typeof record.original_file_name === "string" ? record.original_file_name : null,
    mime_type: typeof record.mime_type === "string" ? record.mime_type : null,
    file_size_bytes:
      typeof record.file_size_bytes === "number" ? record.file_size_bytes : null,
    created_at: String(record.created_at ?? ""),
    updated_at: String(record.updated_at ?? record.created_at ?? ""),
  };
}

export async function fetchStudentRecordFolders() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("student_record_folders")
    .select("id, owner_user_id, student_id, student_user_id, student_name, student_cert_number, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeFolder);
}

export async function fetchStudentRecordItems(folderIds: string[]) {
  if (folderIds.length === 0) return [] as StudentRecordItem[];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("student_record_items")
    .select("id, folder_id, title, record_date, category, notes, storage_path, original_file_name, mime_type, file_size_bytes, created_at, updated_at")
    .in("folder_id", folderIds)
    .order("record_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeItem);
}

export async function createStudentRecordFolder(studentId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("create_student_record_folder", {
    p_student_id: studentId,
  });
  if (error) throw error;
  return normalizeFolder(data as unknown as Record<string, unknown>);
}

function itemRpcPayload(input: StudentRecordItemInput) {
  return {
    p_title: input.title.trim(),
    p_record_date: input.recordDate,
    p_category: input.category?.trim() || null,
    p_notes: input.notes?.trim() || null,
    p_storage_path: input.storagePath ?? null,
    p_original_file_name: input.originalFileName ?? null,
    p_mime_type: input.mimeType ?? null,
    p_file_size_bytes: input.fileSizeBytes ?? null,
  };
}

export async function createStudentRecordItem(input: StudentRecordItemInput) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("create_student_record_item", {
    p_id: input.id,
    p_folder_id: input.folderId,
    ...itemRpcPayload(input),
  });
  if (error) throw error;
  return normalizeItem(data as unknown as Record<string, unknown>);
}

export async function updateStudentRecordItem(input: StudentRecordItemInput) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("update_student_record_item", {
    p_item_id: input.id,
    ...itemRpcPayload(input),
  });
  if (error) throw error;
  return normalizeItem(data as unknown as Record<string, unknown>);
}

export async function deleteStudentRecordItem(itemId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("delete_student_record_item", {
    p_item_id: itemId,
  });
  if (error) throw error;
  return typeof data === "string" ? data : null;
}

export async function uploadStudentRecordFile(path: string, file: File) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.storage
    .from(STUDENT_RECORD_FILES_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
}

export async function removeStudentRecordFiles(paths: string[]) {
  const filteredPaths = paths.filter(Boolean);
  if (filteredPaths.length === 0) return;
  const supabase = getSupabaseClient();
  const { error } = await supabase.storage
    .from(STUDENT_RECORD_FILES_BUCKET)
    .remove(filteredPaths);
  if (error) throw error;
}

export async function createStudentRecordFileSignedUrl(path: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage
    .from(STUDENT_RECORD_FILES_BUCKET)
    .createSignedUrl(path, 10 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export function validateStudentRecordFile(file: File) {
  if (!STUDENT_RECORD_ALLOWED_MIME_TYPES.includes(file.type as (typeof STUDENT_RECORD_ALLOWED_MIME_TYPES)[number])) {
    throw new Error("Only PDF, JPG, and PNG files are allowed.");
  }
  if (file.size <= 0 || file.size > STUDENT_RECORD_MAX_FILE_SIZE) {
    throw new Error("The attachment must be 5 MB or smaller.");
  }
}
