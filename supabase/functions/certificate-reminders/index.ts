import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.0";

type CertificateRow = {
  id: string;
  user_id: string;
  person_id: string;
  certificate_type: "flight_instructor" | "ground_instructor";
  certificate_number: string | null;
  last_event_date: string | null;
  last_alerted_due_date: string | null;
  person: {
    display_name: string | null;
  } | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  self_person_id: string | null;
  medical_class: 1 | 2 | 3 | null;
  medical_birth_date: string | null;
  medical_exam_date: string | null;
  last_medical_alerted_due_date: string | null;
};

type MedicalPrivilege = {
  label: string;
  dueDate: Date;
};

type AircraftMaintenanceRow = {
  aircraft_id: string;
  user_id?: string;
  annual_due_date: string | null;
  static_due_date: string | null;
  transponder_due_date: string | null;
  elt_due_date: string | null;
  aircraft: {
    tail_number: string;
    organization_id?: string | null;
    organization?: { name: string } | null;
  } | null;
};

type OrganizationMemberRow = {
  organization_id: string;
  user_id: string;
};

const DAY_MS = 86_400_000;
const REMINDER_WINDOW_DAYS = 90;

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseIsoDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatIsoDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addCalendarMonths(date: Date, months: number) {
  return new Date(
    date.getFullYear(),
    date.getMonth() + months,
    date.getDate(),
    23,
    59,
    59,
    999,
  );
}

function endOfCalendarMonthAfter(date: Date, months: number) {
  return new Date(
    date.getFullYear(),
    date.getMonth() + months + 1,
    0,
    23,
    59,
    59,
    999,
  );
}

function ageAtDate(birthDate: Date, date: Date) {
  let age = date.getFullYear() - birthDate.getFullYear();
  const monthDelta = date.getMonth() - birthDate.getMonth();

  if (monthDelta < 0 || (monthDelta === 0 && date.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age;
}

function daysUntil(date: Date, now: Date) {
  return Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
}

function isInsideReminderWindow(date: Date, now: Date) {
  return daysUntil(date, now) <= REMINDER_WINDOW_DAYS;
}

function reminderStage(date: Date, now: Date) {
  const days = daysUntil(date, now);
  if (days < 0) return "expired";
  if (days === 0) return "due";
  if (days <= 7) return "7-day";
  if (days <= 30) return "30-day";
  if (days <= 90) return "90-day";
  return null;
}

function getCertificateDueDate(certificate: CertificateRow) {
  const lastEventDate = parseIsoDate(certificate.last_event_date);
  if (!lastEventDate) {
    return null;
  }

  if (certificate.certificate_type === "ground_instructor") {
    return addCalendarMonths(lastEventDate, 12);
  }

  return addCalendarMonths(lastEventDate, 24);
}

function getMedicalPrivileges(profile: ProfileRow): MedicalPrivilege[] {
  const medicalClass = profile.medical_class;
  const examDate = parseIsoDate(profile.medical_exam_date);
  const birthDate = parseIsoDate(profile.medical_birth_date);

  if (!medicalClass || !examDate || !birthDate) {
    return [];
  }

  const under40AtExam = ageAtDate(birthDate, examDate) < 40;
  const thirdClassMonths = under40AtExam ? 60 : 24;

  if (medicalClass === 1) {
    return [
      {
        label: "First-class privilege",
        dueDate: endOfCalendarMonthAfter(examDate, under40AtExam ? 12 : 6),
      },
      {
        label: "Second-class privilege",
        dueDate: endOfCalendarMonthAfter(examDate, 12),
      },
      {
        label: "Third-class privilege",
        dueDate: endOfCalendarMonthAfter(examDate, thirdClassMonths),
      },
    ];
  }

  if (medicalClass === 2) {
    return [
      {
        label: "Second-class privilege",
        dueDate: endOfCalendarMonthAfter(examDate, 12),
      },
      {
        label: "Third-class privilege",
        dueDate: endOfCalendarMonthAfter(examDate, thirdClassMonths),
      },
    ];
  }

  return [
    {
      label: "Third-class privilege",
      dueDate: endOfCalendarMonthAfter(examDate, thirdClassMonths),
    },
  ];
}

function formatDisplayDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function certificateTypeLabel(value: CertificateRow["certificate_type"]) {
  return value === "ground_instructor"
    ? "Ground instructor certificate"
    : "Flight instructor certificate";
}

function reminderLine(dueDate: Date, now: Date) {
  const days = daysUntil(dueDate, now);
  if (days < 0) {
    return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  }

  return `${days} day${days === 1 ? "" : "s"} left`;
}

async function createCertificateReminder(
  supabase: ReturnType<typeof createClient>,
  certificate: CertificateRow,
  dueDate: Date,
  now: Date,
) {
  const displayName = certificate.person?.display_name || "Saved instructor";
  const certificateNumber = certificate.certificate_number || "Not provided";
  const stage = reminderStage(dueDate, now);
  if (!stage) return;

  const message = `${displayName}'s ${certificateTypeLabel(certificate.certificate_type).toLowerCase()} (${certificateNumber}) is due ${formatDisplayDate(dueDate)} — ${reminderLine(dueDate, now)}.`;
  const { error } = await supabase.from("notifications").upsert({
    title: `${certificateTypeLabel(certificate.certificate_type)} reminder`,
    message,
    content: message,
    priority: "high",
    status: "sent",
    is_active: true,
    scheduled_at: now.toISOString(),
    kind: "reminder",
    recipient_user_id: certificate.user_id,
    action_url: "/dashboard/saved-people",
    dedupe_key: `certificate:${certificate.id}:${formatIsoDate(dueDate)}:${stage}`,
  }, { onConflict: "recipient_user_id,dedupe_key" });
  if (error) throw error;
}

async function createMedicalReminder(
  supabase: ReturnType<typeof createClient>,
  profile: ProfileRow,
  privileges: MedicalPrivilege[],
  now: Date,
) {
  const rows = privileges
    .map((privilege) => `${privilege.label}: ${formatDisplayDate(privilege.dueDate)} (${reminderLine(privilege.dueDate, now)})`)
    .join(" · ");
  const dueDate = privileges[0].dueDate;
  const stage = reminderStage(dueDate, now);
  if (!stage) return;
  const message = `${profile.display_name || "Your medical certificate"}: ${rows}`;
  const { error } = await supabase.from("notifications").upsert({
    title: "Medical certificate reminder",
    message,
    content: message,
    priority: "high",
    status: "sent",
    is_active: true,
    scheduled_at: now.toISOString(),
    kind: "reminder",
    recipient_user_id: profile.id,
    action_url: "/dashboard/account-settings",
    dedupe_key: `medical:${formatIsoDate(dueDate)}:${stage}`,
  }, { onConflict: "recipient_user_id,dedupe_key" });
  if (error) throw error;
}

const aircraftDateFields = [
  ["annual_due_date", "Annual inspection"],
  ["static_due_date", "Static inspection"],
  ["transponder_due_date", "Transponder inspection"],
  ["elt_due_date", "ELT inspection"],
] as const;

async function createAircraftReminder(
  supabase: ReturnType<typeof createClient>,
  row: AircraftMaintenanceRow,
  recipientUserId: string,
  field: typeof aircraftDateFields[number][0],
  label: string,
  dueDate: Date,
  stage: string,
  now: Date,
  organizationId: string | null,
  sourceLabel: string,
) {
  const tailNumber = row.aircraft?.tail_number || "Aircraft";
  const message = `${tailNumber} ${label.toLowerCase()} is due ${formatDisplayDate(dueDate)} — ${reminderLine(dueDate, now)}.`;
  const { error } = await supabase.from("notifications").upsert({
    title: `${tailNumber} maintenance reminder`,
    message,
    content: message,
    priority: stage === "expired" ? "critical" : stage === "due" || stage === "7-day" ? "high" : "normal",
    status: "sent",
    is_active: true,
    scheduled_at: now.toISOString(),
    kind: "reminder",
    recipient_user_id: recipientUserId,
    organization_id: organizationId,
    source_label: sourceLabel,
    action_url: "/dashboard/my-aircraft",
    dedupe_key: `aircraft:${organizationId ?? "personal"}:${row.aircraft_id}:${field}:${formatIsoDate(dueDate)}:${stage}`,
  }, { onConflict: "recipient_user_id,dedupe_key" });
  if (error) throw error;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const cronSecret = Deno.env.get("REMINDER_CRON_SECRET");
  if (cronSecret && req.headers.get("x-reminder-secret") !== cronSecret) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing environment configuration" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const now = new Date();

  try {
    const { data: certificates, error: certificateError } = await supabase
      .from("saved_person_certificates")
      .select(`
        id,
        user_id,
        person_id,
        certificate_type,
        certificate_number,
        last_event_date,
        last_alerted_due_date,
        person:saved_people(display_name)
      `)
      .in("certificate_type", ["flight_instructor", "ground_instructor"])
      .not("last_event_date", "is", null);

    if (certificateError) {
      throw certificateError;
    }

    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select(`
        id,
        email,
        display_name,
        self_person_id,
        medical_class,
        medical_birth_date,
        medical_exam_date,
        last_medical_alerted_due_date
      `);

    if (profileError) {
      throw profileError;
    }

    const [personalAircraftResult, organizationMaintenanceResult, organizationMembersResult] = await Promise.all([
      supabase.from("saved_aircraft").select(`
        aircraft_id,
        user_id,
        annual_due_date,
        static_due_date,
        transponder_due_date,
        elt_due_date,
        aircraft:aircraft_id(tail_number)
      `),
      supabase.from("organization_aircraft_maintenance").select(`
        aircraft_id,
        annual_due_date,
        static_due_date,
        transponder_due_date,
        elt_due_date,
        aircraft:aircraft_id(tail_number, organization_id, organization:organization_id(name))
      `),
      supabase.from("organization_members").select("organization_id, user_id"),
    ]);

    if (personalAircraftResult.error) throw personalAircraftResult.error;
    if (organizationMaintenanceResult.error) throw organizationMaintenanceResult.error;
    if (organizationMembersResult.error) throw organizationMembersResult.error;

    const profilesById = new Map((profiles || []).map((profile: ProfileRow) => [profile.id, profile]));
    let certificateRemindersSent = 0;
    let medicalRemindersSent = 0;
    let aircraftRemindersSent = 0;

    for (const certificate of (certificates || []) as CertificateRow[]) {
      const dueDate = getCertificateDueDate(certificate);
      if (!dueDate || !isInsideReminderWindow(dueDate, now)) {
        continue;
      }

      const profile = profilesById.get(certificate.user_id);
      if (!profile.self_person_id || certificate.person_id !== profile.self_person_id) {
        continue;
      }

      await createCertificateReminder(supabase, certificate, dueDate, now);
      certificateRemindersSent += 1;
    }

    for (const profile of (profiles || []) as ProfileRow[]) {
      const duePrivileges = getMedicalPrivileges(profile)
        .filter((privilege) => isInsideReminderWindow(privilege.dueDate, now))
        .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime());

      if (duePrivileges.length === 0) {
        continue;
      }

      await createMedicalReminder(supabase, profile, duePrivileges, now);
      medicalRemindersSent += 1;
    }

    for (const row of (personalAircraftResult.data || []) as unknown as AircraftMaintenanceRow[]) {
      if (!row.user_id) continue;
      for (const [field, label] of aircraftDateFields) {
        const dueDate = parseIsoDate(row[field]);
        if (!dueDate) continue;
        const stage = reminderStage(dueDate, now);
        if (!stage) continue;
        await createAircraftReminder(supabase, row, row.user_id, field, label, dueDate, stage, now, null, "Personal aircraft");
        aircraftRemindersSent += 1;
      }
    }

    const membersByOrganization = new Map<string, string[]>();
    for (const member of (organizationMembersResult.data || []) as OrganizationMemberRow[]) {
      const members = membersByOrganization.get(member.organization_id) || [];
      members.push(member.user_id);
      membersByOrganization.set(member.organization_id, members);
    }

    for (const row of (organizationMaintenanceResult.data || []) as unknown as AircraftMaintenanceRow[]) {
      const organizationId = row.aircraft?.organization_id;
      if (!organizationId) continue;
      const organizationName = row.aircraft?.organization?.name || "Organization aircraft";
      for (const [field, label] of aircraftDateFields) {
        const dueDate = parseIsoDate(row[field]);
        if (!dueDate) continue;
        const stage = reminderStage(dueDate, now);
        if (!stage) continue;
        for (const userId of membersByOrganization.get(organizationId) || []) {
          await createAircraftReminder(supabase, row, userId, field, label, dueDate, stage, now, organizationId, organizationName);
          aircraftRemindersSent += 1;
        }
      }
    }

    return jsonResponse({
      success: true,
      certificateRemindersSent,
      medicalRemindersSent,
      aircraftRemindersSent,
    });
  } catch (error) {
    console.error("Reminder function failed", error);
    return jsonResponse({ error: "Reminder function failed" }, 500);
  }
});
