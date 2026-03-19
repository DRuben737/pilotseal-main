import { getSupabaseClient } from "@/lib/supabase";

export type UserProfile = {
  created_at?: string;
  display_name?: string | null;
  email?: string | null;
  id: string;
  role: "admin" | "user" | string;
  medical_class?: 1 | 2 | 3 | null;
  medical_birth_date?: string | null;
  medical_exam_date?: string | null;
  medical_exp_date?: string | null;
};

const PROFILE_SELECT =
  "id, email, display_name, role, created_at, medical_class, medical_birth_date, medical_exam_date, medical_exp_date";

export async function fetchCurrentProfile(userId: string) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as UserProfile | null) ?? null;
}

export async function updateCurrentProfile(
  userId: string,
  updates: {
    display_name?: string | null;
    medical_class?: 1 | 2 | 3 | null;
    medical_birth_date?: string | null;
    medical_exam_date?: string | null;
  }
) {
  const supabase = getSupabaseClient();

  const payload: {
    display_name?: string | null;
    medical_class?: 1 | 2 | 3 | null;
    medical_birth_date?: string | null;
    medical_exam_date?: string | null;
  } = {};

  if ("display_name" in updates) {
    payload.display_name = updates.display_name?.trim() || null;
  }

  if ("medical_class" in updates) {
    payload.medical_class = updates.medical_class ?? null;
  }

  if ("medical_birth_date" in updates) {
    payload.medical_birth_date = updates.medical_birth_date ?? null;
  }

  if ("medical_exam_date" in updates) {
    payload.medical_exam_date = updates.medical_exam_date ?? null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", userId)
    .select(PROFILE_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data as UserProfile;
}
