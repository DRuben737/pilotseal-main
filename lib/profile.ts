import { getSupabaseClient } from "@/lib/supabase";

export type UserProfile = {
  created_at?: string;
  email?: string | null;
  id: string;
  role: "admin" | "user" | string;
};

export async function fetchCurrentProfile(userId: string) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, role, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as UserProfile | null) ?? null;
}
