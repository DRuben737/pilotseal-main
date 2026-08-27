import { getSupabaseClient } from "@/lib/supabase";

export type PlatformAdminAccount = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  created_at: string | null;
};

export type PlatformAdminAuditEntry = {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  target_user_id: string | null;
  target_email: string;
  action: "granted" | "revoked";
  previous_role: string | null;
  new_role: string;
  reason: string;
  created_at: string;
};

export type PlatformOrganization = {
  id: string;
  name: string;
  created_at: string;
  owner_user_id: string;
  owner_email: string | null;
  owner_display_name: string | null;
  member_count: number;
};

export type PlatformOrganizationRequest = {
  id: string;
  requester_user_id: string;
  requested_name: string;
  requester_email: string;
  email_verified: boolean;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  reviewed_at: string | null;
  review_reason: string | null;
  organization_id: string | null;
  reviewer_email: string | null;
};

export async function fetchPlatformAdmins() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("list_platform_admins");

  if (error) throw error;
  return (data ?? []) as PlatformAdminAccount[];
}

export async function fetchPlatformAdminAuditLog(limit = 100) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("list_platform_admin_audit_log", {
    p_limit: limit,
  });

  if (error) throw error;
  return (data ?? []) as PlatformAdminAuditEntry[];
}

export async function fetchPlatformOrganizations() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("list_platform_organizations");

  if (error) throw error;
  const organizations = (data ?? []) as PlatformOrganization[];
  return organizations.map((organization) => ({
    ...organization,
    member_count: Number(organization.member_count ?? 0),
  }));
}

export async function fetchPlatformOrganizationRequests(status?: PlatformOrganizationRequest["status"]) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("list_platform_organization_requests", {
    p_status: status ?? null,
  });
  if (error) throw error;
  return (data ?? []) as PlatformOrganizationRequest[];
}

export async function fetchMyOrganizationRegistrationRequests() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("organization_registration_requests")
    .select("id, requester_user_id, requested_name, requester_email, status, submitted_at, reviewed_at, review_reason, organization_id")
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((request) => ({
    ...request,
    email_verified: true,
    reviewer_email: null,
  })) as PlatformOrganizationRequest[];
}

export async function reviewPlatformOrganizationRequest(input: {
  requestId: string;
  decision: "approved" | "rejected";
  reason: string;
}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("review_organization_registration_request", {
    p_request_id: input.requestId,
    p_decision: input.decision,
    p_reason: input.reason.trim(),
  });
  if (error) throw error;
  return data as PlatformOrganizationRequest;
}

export async function createPlatformOrganization(input: {
  name: string;
  ownerEmail: string;
  reason: string;
}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("create_organization_for_registered_user", {
    p_name: input.name.trim(),
    p_owner_email: input.ownerEmail.trim(),
    p_reason: input.reason.trim(),
  });

  if (error) throw error;
  const organization = (data ?? [])[0] as PlatformOrganization | undefined;
  return organization
    ? { ...organization, member_count: Number(organization.member_count ?? 0) }
    : null;
}

export async function setPlatformAdminByEmail(input: {
  email: string;
  makeAdmin: boolean;
  reason: string;
}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("set_platform_admin_by_email", {
    p_email: input.email.trim(),
    p_make_admin: input.makeAdmin,
    p_reason: input.reason.trim(),
  });

  if (error) throw error;
  return ((data ?? [])[0] as PlatformAdminAccount | undefined) ?? null;
}
