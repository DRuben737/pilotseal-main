import { getSupabaseClient } from "@/lib/supabase";

export type PersonCertificateType = "pilot" | "flight_instructor" | "ground_instructor";

export type PersonCertificate = {
  id: string;
  user_id: string;
  person_id: string;
  certificate_type: PersonCertificateType;
  certificate_number: string | null;
  ratings: string[];
  issue_date: string | null;
  last_event_date: string | null;
  event_type: string | null;
  is_default_for_endorsements: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

export type CertificateCurrencyStatus = "current" | "due-soon" | "expired" | "unknown";

export const CERTIFICATE_TYPE_LABELS: Record<PersonCertificateType, string> = {
  pilot: "Pilot certificate",
  flight_instructor: "Flight instructor certificate",
  ground_instructor: "Ground instructor certificate",
};

const CERTIFICATE_SELECT =
  "id, user_id, person_id, certificate_type, certificate_number, ratings, issue_date, last_event_date, event_type, is_default_for_endorsements, notes, created_at, updated_at";

function normalizeText(value?: string | null) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : null;
}

function normalizeDate(value?: string | null) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : null;
}

function normalizeRatings(value?: string[] | string | null) {
  if (Array.isArray(value)) {
    return value.map((rating) => rating.trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((rating) => rating.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeCertificate(record: Record<string, unknown>): PersonCertificate {
  return {
    id: String(record.id ?? ""),
    user_id: String(record.user_id ?? ""),
    person_id: String(record.person_id ?? ""),
    certificate_type: String(record.certificate_type ?? "pilot") as PersonCertificateType,
    certificate_number:
      typeof record.certificate_number === "string" ? record.certificate_number : null,
    ratings: Array.isArray(record.ratings)
      ? record.ratings.map((rating) => String(rating))
      : [],
    issue_date: typeof record.issue_date === "string" ? record.issue_date : null,
    last_event_date: typeof record.last_event_date === "string" ? record.last_event_date : null,
    event_type: typeof record.event_type === "string" ? record.event_type : null,
    is_default_for_endorsements: Boolean(record.is_default_for_endorsements),
    notes: typeof record.notes === "string" ? record.notes : null,
    created_at: String(record.created_at ?? ""),
    updated_at: typeof record.updated_at === "string" ? record.updated_at : null,
  };
}

function addCalendarMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months + 1, 0, 23, 59, 59, 999);
}

export function formatIsoDateForDisplay(value: string | null) {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${month}/${day}/${year}`;
  }

  return value;
}

export function convertDisplayDateToIsoDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    throw new Error("Use MM/DD/YYYY for certificate dates.");
  }

  const month = Number.parseInt(match[1], 10);
  const day = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  const maxDay = new Date(year, month, 0).getDate();

  if (month < 1 || month > 12 || day < 1 || day > maxDay) {
    throw new Error("Certificate date is invalid.");
  }

  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

export function getCertificateCurrencyDueDate(certificate: PersonCertificate) {
  if (!certificate.last_event_date) {
    return null;
  }

  const date = new Date(`${certificate.last_event_date}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (certificate.certificate_type === "ground_instructor") {
    return addCalendarMonths(date, 12);
  }

  if (certificate.certificate_type === "pilot" || certificate.certificate_type === "flight_instructor") {
    return addCalendarMonths(date, 24);
  }

  return null;
}

export function getCertificateCurrencyStatus(certificate: PersonCertificate): CertificateCurrencyStatus {
  const dueDate = getCertificateCurrencyDueDate(certificate);
  if (!dueDate) {
    return "unknown";
  }

  const now = new Date();
  const warningDate = new Date(now);
  warningDate.setDate(warningDate.getDate() + 90);

  if (dueDate < now) {
    return "expired";
  }

  if (dueDate <= warningDate) {
    return "due-soon";
  }

  return "current";
}

export function getCertificateCurrencyLabel(certificate: PersonCertificate) {
  const dueDate = getCertificateCurrencyDueDate(certificate);
  if (!dueDate) {
    return "No currency date saved";
  }

  const now = new Date();
  const days = Math.ceil((dueDate.getTime() - now.getTime()) / 86_400_000);
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(dueDate);

  if (days < 0) {
    return `Due ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago (${formatted})`;
  }

  return `${days} day${days === 1 ? "" : "s"} left (${formatted})`;
}

export async function fetchPersonCertificates(userId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("saved_person_certificates")
    .select(CERTIFICATE_SELECT)
    .eq("user_id", userId)
    .order("is_default_for_endorsements", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as Record<string, unknown>[]).map(normalizeCertificate);
}

export async function createPersonCertificate(input: {
  userId: string;
  personId: string;
  certificateType: PersonCertificateType;
  certificateNumber?: string | null;
  ratings?: string[] | string | null;
  issueDate?: string | null;
  lastEventDate?: string | null;
  eventType?: string | null;
  isDefaultForEndorsements?: boolean;
  notes?: string | null;
}) {
  const supabase = getSupabaseClient();
  const nextIsDefault =
    (input.certificateType === "flight_instructor" || input.certificateType === "ground_instructor") &&
    Boolean(input.isDefaultForEndorsements);

  if (nextIsDefault) {
    await setDefaultInstructorCertificate(input.userId, null);
  }

  const { data, error } = await supabase
    .from("saved_person_certificates")
    .insert({
      user_id: input.userId,
      person_id: input.personId,
      certificate_type: input.certificateType,
      certificate_number: normalizeText(input.certificateNumber),
      ratings: normalizeRatings(input.ratings),
      issue_date: normalizeDate(input.issueDate),
      last_event_date: normalizeDate(input.lastEventDate),
      event_type: normalizeText(input.eventType),
      is_default_for_endorsements: nextIsDefault,
      notes: normalizeText(input.notes),
    })
    .select(CERTIFICATE_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return normalizeCertificate((data as unknown) as Record<string, unknown>);
}

export async function updatePersonCertificate(
  userId: string,
  id: string,
  updates: {
    certificateType: PersonCertificateType;
    certificateNumber?: string | null;
    ratings?: string[] | string | null;
    issueDate?: string | null;
    lastEventDate?: string | null;
    eventType?: string | null;
    isDefaultForEndorsements?: boolean;
    notes?: string | null;
  }
) {
  const supabase = getSupabaseClient();
  const nextIsDefault =
    (updates.certificateType === "flight_instructor" || updates.certificateType === "ground_instructor") &&
    Boolean(updates.isDefaultForEndorsements);

  if (nextIsDefault) {
    await setDefaultInstructorCertificate(userId, null);
  }

  const { data, error } = await supabase
    .from("saved_person_certificates")
    .update({
      certificate_type: updates.certificateType,
      certificate_number: normalizeText(updates.certificateNumber),
      ratings: normalizeRatings(updates.ratings),
      issue_date: normalizeDate(updates.issueDate),
      last_event_date: normalizeDate(updates.lastEventDate),
      event_type: normalizeText(updates.eventType),
      is_default_for_endorsements: nextIsDefault,
      notes: normalizeText(updates.notes),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select(CERTIFICATE_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return normalizeCertificate((data as unknown) as Record<string, unknown>);
}

export async function deletePersonCertificate(userId: string, id: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("saved_person_certificates")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

export async function setDefaultInstructorCertificate(userId: string, id: string | null) {
  const supabase = getSupabaseClient();

  const { error: clearError } = await supabase
    .from("saved_person_certificates")
    .update({ is_default_for_endorsements: false })
    .eq("user_id", userId)
    .in("certificate_type", ["flight_instructor", "ground_instructor"]);

  if (clearError) {
    throw clearError;
  }

  if (!id) {
    return;
  }

  const { error } = await supabase
    .from("saved_person_certificates")
    .update({ is_default_for_endorsements: true })
    .eq("id", id)
    .eq("user_id", userId)
    .in("certificate_type", ["flight_instructor", "ground_instructor"]);

  if (error) {
    throw error;
  }
}
