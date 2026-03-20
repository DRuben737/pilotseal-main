import { getSupabaseClient } from "@/lib/supabase";

export type SavedPersonRole = "cfi" | "student";

export type SavedPerson = {
  id: string;
  user_id: string;
  role: SavedPersonRole;
  display_name: string;
  cert_number: string | null;
  cert_exp_date: string | null;
  weight_lbs?: number | null;
  is_default: boolean;
  alert_sent: boolean;
  created_at: string;
};

export type CfiExpirationStatus = "valid" | "expiring-soon" | "expired" | "unknown";

const SAVED_PERSON_SELECTS = [
  "id, user_id, role, display_name, cert_number, cert_exp_date, weight_Ibs, is_default, alert_sent, created_at",
  "id, user_id, role, display_name, cert_number, cert_exp_date, weight_lbs, is_default, alert_sent, created_at",
];
const SAVED_PERSON_SELECT_LEGACY =
  "id, user_id, role, display_name, cert_number, cert_exp_date, is_default, alert_sent, created_at";

function normalizeText(value?: string) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : null;
}

export function formatUsDateInput(input: string) {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "").slice(0, 8);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function convertDisplayDateToIso(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) {
    throw new Error("Certificate expiration must use MM/DD/YYYY.");
  }

  const month = Number.parseInt(match[1], 10);
  const day = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);

  if (month < 1 || month > 12) {
    throw new Error("Certificate expiration month must be between 01 and 12.");
  }

  const maxDay = new Date(year, month, 0).getDate();
  if (day < 1 || day > maxDay) {
    throw new Error("Certificate expiration date is invalid.");
  }

  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

export function formatStoredDateForDisplay(value: string | null) {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${month}/${day}/${year}`;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    return value;
  }

  return value;
}

export function parseCertificateExpiration(value: string | null) {
  if (!value) {
    return null;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [monthText, dayText, yearText] = value.split("/");
    const month = Number.parseInt(monthText, 10);
    const day = Number.parseInt(dayText, 10);
    const year = Number.parseInt(yearText, 10);

    if (!month || !day || !year) {
      return null;
    }

    return new Date(year, month - 1, day, 23, 59, 59, 999);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T23:59:59`);
  }

  return null;
}

export function isOnOrAfterToday(value: string | null) {
  const parsed = parseCertificateExpiration(value);
  if (!parsed) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);

  return parsed >= today;
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

function withWeightFallback(data: Record<string, unknown>[] | null) {
  return (data ?? []).map((person) => ({
    ...person,
    weight_lbs: (() => {
      const nextValue =
        person.weight_lbs ??
        person.weight_Ibs ??
        null;

      if (typeof nextValue === "number") {
        return nextValue;
      }

      if (typeof nextValue === "string") {
        const parsed = Number.parseFloat(nextValue);
        return Number.isFinite(parsed) ? parsed : null;
      }

      return null;
    })(),
  })) as SavedPerson[];
}

async function querySavedPeopleWithWeight(
  userId: string,
  role?: SavedPersonRole
) {
  const supabase = getSupabaseClient();

  for (const select of SAVED_PERSON_SELECTS) {
    let query = supabase
      .from("saved_people")
      .select(select)
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (role) {
      query = query.eq("role", role);
    }

    const { data, error } = await query;
    if (!error) {
      return withWeightFallback((data as unknown) as Record<string, unknown>[]);
    }
  }

  return null;
}

export async function fetchSavedPeople(userId: string, role?: SavedPersonRole) {
  const weightedData = await querySavedPeopleWithWeight(userId, role);
  if (weightedData) {
    return weightedData;
  }

  const supabase = getSupabaseClient();
  let legacyQuery = supabase
    .from("saved_people")
    .select(SAVED_PERSON_SELECT_LEGACY)
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (role) {
    legacyQuery = legacyQuery.eq("role", role);
  }

  const { data: legacyData, error: legacyError } = await legacyQuery;
  if (legacyError) {
    throw legacyError;
  }

  return withWeightFallback((legacyData as unknown) as Record<string, unknown>[]);
}

export async function fetchDefaultCfi(userId: string) {
  const supabase = getSupabaseClient();

  for (const select of SAVED_PERSON_SELECTS) {
    const { data, error } = await supabase
      .from("saved_people")
      .select(select)
      .eq("user_id", userId)
      .eq("role", "cfi")
      .eq("is_default", true)
      .maybeSingle();

    if (!error) {
      return (withWeightFallback(
        data ? [((data as unknown) as Record<string, unknown>)] : []
      )[0] ?? null) as SavedPerson | null;
    }
  }

  const { data: legacyData, error: legacyError } = await supabase
    .from("saved_people")
    .select(SAVED_PERSON_SELECT_LEGACY)
    .eq("user_id", userId)
    .eq("role", "cfi")
    .eq("is_default", true)
    .maybeSingle();

  if (legacyError) {
    throw legacyError;
  }

  return (withWeightFallback(
    legacyData ? [((legacyData as unknown) as Record<string, unknown>)] : []
  )[0] ?? null) as SavedPerson | null;
}

export async function createSavedPerson(input: {
  userId: string;
  role: SavedPersonRole;
  display_name: string;
  cert_number?: string;
  cert_exp_date?: string;
  is_default?: boolean;
  weight_lbs?: number | null;
}) {
  const supabase = getSupabaseClient();
  const nextIsDefault = input.role === "cfi" ? Boolean(input.is_default) : false;
  const normalizedCertNumber = normalizeText(input.cert_number);
  const normalizedExpirationInput = normalizeText(input.cert_exp_date);
  if (
    input.role === "cfi" &&
    normalizedExpirationInput &&
    !isOnOrAfterToday(normalizedExpirationInput)
  ) {
    throw new Error("Certificate expiration date cannot be earlier than today.");
  }

  const certExpDate =
    input.role === "cfi" && normalizedExpirationInput
      ? convertDisplayDateToIso(normalizedExpirationInput)
      : null;

  if (nextIsDefault) {
    await setDefaultCfi(input.userId, null);
  }

  const attempts = [
    {
      payload: {
        user_id: input.userId,
        role: input.role,
        display_name: input.display_name.trim(),
        cert_number: normalizedCertNumber,
        cert_exp_date: certExpDate,
        weight_Ibs: typeof input.weight_lbs === "number" ? input.weight_lbs : null,
        is_default: nextIsDefault,
        alert_sent: false,
      },
      select: SAVED_PERSON_SELECTS[0],
    },
    {
      payload: {
        user_id: input.userId,
        role: input.role,
        display_name: input.display_name.trim(),
        cert_number: normalizedCertNumber,
        cert_exp_date: certExpDate,
        weight_lbs: typeof input.weight_lbs === "number" ? input.weight_lbs : null,
        is_default: nextIsDefault,
        alert_sent: false,
      },
      select: SAVED_PERSON_SELECTS[1],
    },
  ];

  let lastError: unknown = null;

  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from("saved_people")
      .insert(attempt.payload)
      .select(attempt.select)
      .single();

    if (!error) {
      return withWeightFallback([((data as unknown) as Record<string, unknown>)])[0];
    }

    lastError = error;
  }

  throw lastError;
}

export async function updateSavedPerson(
  userId: string,
  id: string,
  updates: {
    display_name: string;
    cert_number?: string;
    cert_exp_date?: string;
    weight_lbs?: number | null;
    alert_sent?: boolean;
  }
) {
  const supabase = getSupabaseClient();
  const payload: {
    display_name: string;
    cert_number: string | null;
    cert_exp_date?: string | null;
    weight_lbs?: number | null;
    weight_Ibs?: number | null;
    alert_sent?: boolean;
  } = {
    display_name: updates.display_name.trim(),
    cert_number: normalizeText(updates.cert_number),
    cert_exp_date:
      typeof updates.cert_exp_date === "string"
        ? normalizeText(updates.cert_exp_date)
          ? convertDisplayDateToIso(updates.cert_exp_date)
          : null
        : undefined,
  };

  if (
    typeof updates.cert_exp_date === "string" &&
    normalizeText(updates.cert_exp_date) &&
    !isOnOrAfterToday(updates.cert_exp_date)
  ) {
    throw new Error("Certificate expiration date cannot be earlier than today.");
  }

  if (typeof updates.alert_sent === "boolean") {
    payload.alert_sent = updates.alert_sent;
  }

  if ("weight_lbs" in updates) {
    payload.weight_Ibs =
      typeof updates.weight_lbs === "number" ? updates.weight_lbs : null;
  }

  const attempts = [
    { payload, select: SAVED_PERSON_SELECTS[0] },
    {
      payload: {
        ...payload,
        weight_lbs: payload.weight_Ibs,
        weight_Ibs: undefined,
      },
      select: SAVED_PERSON_SELECTS[1],
    },
  ];

  let lastError: unknown = null;

  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from("saved_people")
      .update(attempt.payload)
      .eq("id", id)
      .eq("user_id", userId)
      .select(attempt.select)
      .single();

    if (!error) {
      return withWeightFallback([((data as unknown) as Record<string, unknown>)])[0];
    }

    lastError = error;
  }

  throw lastError;
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
