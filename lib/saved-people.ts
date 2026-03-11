import { getSupabaseClient } from "@/lib/supabase";

export type SavedPersonRole = "cfi" | "student";

export type SavedPerson = {
  id: string;
  user_id: string;
  role: SavedPersonRole;
  display_name: string;
  cert_number: string | null;
  cert_exp_date: string | null;
  created_at: string;
};

export async function fetchSavedPeople(userId: string, role?: SavedPersonRole) {
  const supabase = getSupabaseClient();

  let query = supabase
    .from("saved_people")
    .select("id, user_id, role, display_name, cert_number, cert_exp_date, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (role) {
    query = query.eq("role", role);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as SavedPerson[];
}

export async function createSavedPerson(input: {
  userId: string;
  role: SavedPersonRole;
  display_name: string;
  cert_number?: string;
  cert_exp_date?: string;
}) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("saved_people")
    .insert({
      user_id: input.userId,
      role: input.role,
      display_name: input.display_name.trim(),
      cert_number: input.cert_number?.trim() || null,
      cert_exp_date: input.cert_exp_date?.trim() || null,
    })
    .select("id, user_id, role, display_name, cert_number, cert_exp_date, created_at")
    .single();

  if (error) throw error;
  return data as SavedPerson;
}

export async function deleteSavedPerson(userId: string, id: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("saved_people")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}
