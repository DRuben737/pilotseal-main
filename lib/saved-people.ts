import { getSupabaseClient } from "@/lib/supabase";

export type SavedPersonRole = "cfi" | "student";

export type SavedPerson = {
  id: string;
  user_id: string;
  role: SavedPersonRole;
  display_name: string;
  cert_number: string | null;
  cert_exp_date: string | null;
  is_default: boolean;
  alert_sent: boolean;
  created_at: string;
};

export type CfiExpirationStatus = "valid" | "expiring-soon" | "expired" | "unknown";

const SAVED_PERSON_SELECT =
  "id, user_id, role, display_name, cert_number, cert_exp_date, is_default, alert_sent, created_at";

function normalizeText(value?: string) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : null;
}

export function parseCertificateExpiration(value: string | null) {
  if (!value) {
    return null;
  }

  if (/^\d{2}\/\d{4}$/.test(value)) {
    const [monthText, yearText] = value.split("/");
    const month = Number.parseInt(monthText, 10);
    const year = Number.parseInt(yearText, 10);

    if (!month || !year) {
      return null;
    }

    return new Date(year, month, 0, 23, 59, 59, 999);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T23:59:59`);
  }

  return null;
}

export function getExpirationStatus(value: string | null): CfiExpirationStatus {
  const expirationDate = parseCertificateExpiration(value);
  if (!expirationDate) {
    return "unknown";
  }

  const now = new Date();
  const reminderThreshold = new Date(now);
  reminderThreshold.setMonth(reminderThreshold.getMonth() + 3);

  if (expirationDate < now) {
    return "expired";
  }

  if (expirationDate <= reminderThreshold) {
    return "expiring-soon";
  }

  return "valid";
}

export const getCfiExpirationStatus = getExpirationStatus;

export async function fetchSavedPeople(userId: string, role?: SavedPersonRole) {
  const supabase = getSupabaseClient();

  let query = supabase
    .from("saved_people")
    .select(SAVED_PERSON_SELECT)
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (role) {
    query = query.eq("role", role);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data ?? []) as SavedPerson[];
}

export async function fetchDefaultCfi(userId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("saved_people")
    .select(SAVED_PERSON_SELECT)
    .eq("user_id", userId)
    .eq("role", "cfi")
    .eq("is_default", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data ?? null) as SavedPerson | null;
}

export async function createSavedPerson(input: {
  userId: string;
  role: SavedPersonRole;
  display_name: string;
  cert_number?: string;
  cert_exp_date?: string;
  is_default?: boolean;
}) {
  const supabase = getSupabaseClient();
  const nextIsDefault = input.role === "cfi" ? Boolean(input.is_default) : false;

  if (nextIsDefault) {
    await setDefaultCfi(input.userId, null);
  }

  const { data, error } = await supabase
    .from("saved_people")
    .insert({
      user_id: input.userId,
      role: input.role,
      display_name: input.display_name.trim(),
      cert_number: normalizeText(input.cert_number),
      cert_exp_date: input.role === "cfi" ? normalizeText(input.cert_exp_date) : null,
      is_default: nextIsDefault,
      alert_sent: false,
    })
    .select(SAVED_PERSON_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data as SavedPerson;
}

export async function updateSavedPerson(
  userId: string,
  id: string,
  updates: {
    display_name: string;
    cert_number?: string;
    cert_exp_date?: string;
    alert_sent?: boolean;
  }
) {
  const supabase = getSupabaseClient();
  const payload: {
    display_name: string;
    cert_number: string | null;
    cert_exp_date?: string | null;
    alert_sent?: boolean;
  } = {
    display_name: updates.display_name.trim(),
    cert_number: normalizeText(updates.cert_number),
    cert_exp_date:
      typeof updates.cert_exp_date === "string" ? normalizeText(updates.cert_exp_date) : undefined,
  };

  if (typeof updates.alert_sent === "boolean") {
    payload.alert_sent = updates.alert_sent;
  }

  const { data, error } = await supabase
    .from("saved_people")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId)
    .select(SAVED_PERSON_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data as SavedPerson;
}

export async function setDefaultCfi(userId: string, id: string | null) {
  const supabase = getSupabaseClient();

  const { error: clearError } = await supabase
    .from("saved_people")
    .update({ is_default: false })
    .eq("user_id", userId)
    .eq("role", "cfi");

  if (clearError) {
    throw clearError;
  }

  if (!id) {
    return;
  }

  const { error } = await supabase
    .from("saved_people")
    .update({ is_default: true, alert_sent: false })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("role", "cfi");

  if (error) {
    throw error;
  }
}

export async function deleteSavedPerson(userId: string, id: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("saved_people")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}
