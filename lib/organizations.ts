import { getSupabaseClient } from "@/lib/supabase";

export type OrganizationRole = "owner" | "organization_admin" | "member" | "platform_admin";
export type OrganizationTeachingRole = "instructor" | "student";

export type Organization = {
  id: string;
  name: string;
  member_role: OrganizationRole;
  created_at: string;
};

export type OrganizationMember = {
  user_id: string;
  email: string;
  display_name: string | null;
  member_role: Exclude<OrganizationRole, "platform_admin">;
  teaching_role: OrganizationTeachingRole | null;
  created_at: string;
};

export type OrganizationStudent = {
  student_user_id: string;
  person_id: string | null;
  display_name: string;
  certificate_number: string | null;
};

export type OrganizationPersonStatus = "pending" | "linked";

export type OrganizationPerson = {
  id: string;
  organization_id: string;
  email: string;
  organization_display_name: string | null;
  profile_display_name: string | null;
  teaching_role: OrganizationTeachingRole | null;
  internal_id: string | null;
  notes: string | null;
  user_id: string | null;
  status: OrganizationPersonStatus;
  member_role: Exclude<OrganizationRole, "platform_admin"> | null;
  created_at: string;
  linked_at: string | null;
};

export type AvailableOrganization = {
  person_id: string;
  organization_id: string;
  organization_name: string;
  organization_display_name: string | null;
  teaching_role: OrganizationTeachingRole | null;
  internal_id: string | null;
  added_at: string;
};

export const ACTIVE_ORGANIZATION_STORAGE_KEY = "pilotseal.activeOrganizationId";

export async function fetchUserOrganizations(): Promise<Organization[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("get_my_organizations");

  if (error) {
    if (isMissingOrganizationSchema(error)) {
      return [] as Organization[];
    }
    throw error;
  }

  return ((data ?? []) as unknown[]).map(normalizeOrganization);
}

export async function fetchOrganizationMembers(organizationId: string): Promise<OrganizationMember[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("list_organization_members", {
    p_organization_id: organizationId,
  });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown[]).map(normalizeOrganizationMember);
}

export async function fetchOrganizationPeople(organizationId: string): Promise<OrganizationPerson[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("list_organization_people", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return ((data ?? []) as unknown[]).map(normalizeOrganizationPerson);
}

export async function addOrganizationPerson(input: {
  organizationId: string;
  email: string;
  displayName?: string;
  teachingRole?: OrganizationTeachingRole | null;
  internalId?: string;
  notes?: string;
}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("add_organization_person", {
    p_organization_id: input.organizationId,
    p_email: input.email.trim(),
    p_display_name: input.displayName?.trim() || null,
    p_teaching_role: input.teachingRole ?? null,
    p_internal_id: input.internalId?.trim() || null,
    p_notes: input.notes?.trim() || null,
  });
  if (error) throw error;
  return data as unknown as OrganizationPerson;
}

export async function updateOrganizationPerson(input: {
  personId: string;
  displayName?: string;
  teachingRole?: OrganizationTeachingRole | null;
  internalId?: string;
  notes?: string;
}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("update_organization_person", {
    p_person_id: input.personId,
    p_display_name: input.displayName?.trim() || null,
    p_teaching_role: input.teachingRole ?? null,
    p_internal_id: input.internalId?.trim() || null,
    p_notes: input.notes?.trim() || null,
  });
  if (error) throw error;
  return data as unknown as OrganizationPerson;
}

export async function archivePendingOrganizationPerson(personId: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("archive_pending_organization_person", {
    p_person_id: personId,
  });
  if (error) throw error;
}

export async function fetchAvailableOrganizations(): Promise<AvailableOrganization[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("list_my_available_organizations");
  if (error) throw error;
  return ((data ?? []) as unknown[]).map(normalizeAvailableOrganization);
}

export async function claimOrganizationPerson(personId: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("claim_organization_person", {
    p_person_id: personId,
  });
  if (error) throw error;
}

export async function addOrganizationMemberByEmail(organizationId: string, email: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("add_organization_member_by_email", {
    p_organization_id: organizationId,
    p_email: email.trim(),
  });

  if (error) {
    throw error;
  }
}

export async function setOrganizationMemberRole(
  organizationId: string,
  userId: string,
  role: "organization_admin" | "member"
) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("set_organization_member_role", {
    p_organization_id: organizationId,
    p_user_id: userId,
    p_role: role,
  });

  if (error) {
    throw error;
  }
}

export async function setOrganizationMemberTeachingRole(
  organizationId: string,
  userId: string,
  teachingRole: OrganizationTeachingRole | null
) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("set_organization_member_teaching_role", {
    p_organization_id: organizationId,
    p_user_id: userId,
    p_teaching_role: teachingRole,
  });
  if (error) throw error;
}

export async function fetchOrganizationStudents(organizationId: string): Promise<OrganizationStudent[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("list_organization_students", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((record) => ({
    student_user_id: String(record.student_user_id ?? ""),
    person_id: typeof record.person_id === "string" ? record.person_id : null,
    display_name: String(record.display_name ?? "Student"),
    certificate_number: typeof record.certificate_number === "string" ? record.certificate_number : null,
  }));
}

export async function removeOrganizationMember(organizationId: string, userId: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("remove_organization_member", {
    p_organization_id: organizationId,
    p_user_id: userId,
  });

  if (error) {
    throw error;
  }
}

export async function transferOrganizationOwnership(organizationId: string, userId: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("transfer_organization_ownership", {
    p_organization_id: organizationId,
    p_new_owner_user_id: userId,
  });

  if (error) {
    throw error;
  }
}

export function canManageOrganization(role: OrganizationRole | null | undefined) {
  return role === "owner" || role === "organization_admin" || role === "platform_admin";
}

export function canManageOrganizationAdmins(role: OrganizationRole | null | undefined) {
  return role === "owner" || role === "platform_admin";
}

function normalizeOrganization(value: unknown): Organization {
  const record = (value ?? {}) as Record<string, unknown>;
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    member_role: String(record.member_role ?? "member") as OrganizationRole,
    created_at: String(record.created_at ?? ""),
  };
}

function normalizeOrganizationMember(value: unknown): OrganizationMember {
  const record = (value ?? {}) as Record<string, unknown>;
  return {
    user_id: String(record.user_id ?? ""),
    email: String(record.email ?? ""),
    display_name:
      typeof record.display_name === "string" && record.display_name.trim()
        ? record.display_name.trim()
        : null,
    member_role: String(record.member_role ?? "member") as OrganizationMember["member_role"],
    teaching_role:
      record.teaching_role === "instructor" || record.teaching_role === "student"
        ? record.teaching_role
        : null,
    created_at: String(record.created_at ?? ""),
  };
}

function normalizeOrganizationPerson(value: unknown): OrganizationPerson {
  const record = (value ?? {}) as Record<string, unknown>;
  return {
    id: String(record.id ?? ""),
    organization_id: String(record.organization_id ?? ""),
    email: String(record.email ?? ""),
    organization_display_name: optionalText(record.organization_display_name),
    profile_display_name: optionalText(record.profile_display_name),
    teaching_role:
      record.teaching_role === "instructor" || record.teaching_role === "student"
        ? record.teaching_role
        : null,
    internal_id: optionalText(record.internal_id),
    notes: optionalText(record.notes),
    user_id: optionalText(record.user_id),
    status: record.status === "linked" ? "linked" : "pending",
    member_role:
      record.member_role === "owner" ||
      record.member_role === "organization_admin" ||
      record.member_role === "member"
        ? record.member_role
        : null,
    created_at: String(record.created_at ?? ""),
    linked_at: optionalText(record.linked_at),
  };
}

function normalizeAvailableOrganization(value: unknown): AvailableOrganization {
  const record = (value ?? {}) as Record<string, unknown>;
  return {
    person_id: String(record.person_id ?? ""),
    organization_id: String(record.organization_id ?? ""),
    organization_name: String(record.organization_name ?? ""),
    organization_display_name: optionalText(record.organization_display_name),
    teaching_role:
      record.teaching_role === "instructor" || record.teaching_role === "student"
        ? record.teaching_role
        : null,
    internal_id: optionalText(record.internal_id),
    added_at: String(record.added_at ?? ""),
  };
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isMissingOrganizationSchema(error: { code?: string; message?: string }) {
  const message = String(error.message ?? "").toLowerCase();
  return error.code === "PGRST202" || message.includes("get_my_organizations");
}
