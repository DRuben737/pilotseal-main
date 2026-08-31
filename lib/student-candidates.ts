import { getSupabaseClient } from "@/lib/supabase";

export type StudentIdentityStatus =
  | "unregistered"
  | "linked"
  | "organization_member"
  | "self";

export type StudentCandidateOrganization = {
  id: string;
  name: string;
};

export type StudentCandidate = {
  identity_key: string;
  record_person_id: string;
  saved_person_id: string | null;
  student_user_id: string | null;
  canonical_person_id: string | null;
  formal_name: string;
  account_nickname: string | null;
  effective_certificate_number: string | null;
  certificate_source: "canonical_profile" | "saved_people" | "conflict" | "missing";
  certificate_conflict: boolean;
  identity_status: StudentIdentityStatus;
  organizations: StudentCandidateOrganization[];
  endorsement_ready: boolean;
};

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeCandidate(record: Record<string, unknown>): StudentCandidate {
  const organizationIds = Array.isArray(record.organization_ids)
    ? record.organization_ids.map(String)
    : [];
  const organizationNames = Array.isArray(record.organization_names)
    ? record.organization_names.map(String)
    : [];
  const identityStatus = String(record.identity_status ?? "unregistered");
  const certificateSource = String(record.certificate_source ?? "missing");

  return {
    identity_key: String(record.identity_key ?? ""),
    record_person_id: String(record.record_person_id ?? ""),
    saved_person_id: stringOrNull(record.saved_person_id),
    student_user_id: stringOrNull(record.student_user_id),
    canonical_person_id: stringOrNull(record.canonical_person_id),
    formal_name: String(record.formal_name ?? ""),
    account_nickname: stringOrNull(record.account_nickname),
    effective_certificate_number: stringOrNull(record.effective_certificate_number),
    certificate_source:
      certificateSource === "canonical_profile" ||
      certificateSource === "saved_people" ||
      certificateSource === "conflict"
        ? certificateSource
        : "missing",
    certificate_conflict: Boolean(record.certificate_conflict),
    identity_status:
      identityStatus === "linked" ||
      identityStatus === "organization_member" ||
      identityStatus === "self"
        ? identityStatus
        : "unregistered",
    organizations: organizationIds.map((id, index) => ({
      id,
      name: organizationNames[index] ?? "Organization",
    })),
    endorsement_ready: Boolean(record.endorsement_ready),
  };
}

export async function fetchMyStudentCandidates(): Promise<StudentCandidate[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("list_my_student_candidates");
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map(normalizeCandidate);
}
