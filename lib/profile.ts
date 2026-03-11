import { getSupabaseClient } from "@/lib/supabase";

export type UserProfile = {
  id: string;
  role: "admin" | "users" | string;
};

export async function fetchCurrentProfile(userId: string) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .single();

  if (error) {
    throw error;
  }

  return data as UserProfile;
}
