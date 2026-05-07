import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.0";
import { Resend } from "npm:resend";

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

function getFromEmail() {
  return Deno.env.get("REMINDER_FROM_EMAIL") || "PilotSeal <noreply@pilotseal.com>";
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

async function sendCertificateReminder(
  resend: Resend,
  to: string,
  certificate: CertificateRow,
  dueDate: Date,
  now: Date,
) {
  const displayName = certificate.person?.display_name || "Saved instructor";
  const certificateNumber = certificate.certificate_number || "Not provided";

  await resend.emails.send({
    from: getFromEmail(),
    to,
    subject: `${certificateTypeLabel(certificate.certificate_type)} reminder`,
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f5f7fa;padding:40px 0;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 8px 24px rgba(0,0,0,0.06);">
    <h2 style="margin:0 0 12px;font-size:18px;">Certificate Reminder</h2>
    <p style="font-size:14px;color:#333;">A saved instructor certificate is within the reminder window.</p>
    <div style="margin:20px 0;padding:14px;border-radius:8px;background:#f1f3f5;">
      <p style="margin:0;font-size:12px;color:#777;">Instructor</p>
      <p style="margin:4px 0 10px;">${displayName}</p>
      <p style="margin:0;font-size:12px;color:#777;">Certificate</p>
      <p style="margin:4px 0 10px;">${certificateTypeLabel(certificate.certificate_type)} - ${certificateNumber}</p>
      <p style="margin:0;font-size:12px;color:#777;">Due</p>
      <p style="margin:4px 0;">${formatDisplayDate(dueDate)} (${reminderLine(dueDate, now)})</p>
    </div>
    <a href="https://pilotseal.com/dashboard/saved-people" style="padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;">Review people</a>
  </div>
</div>`,
  });
}

async function sendMedicalReminder(
  resend: Resend,
  to: string,
  profile: ProfileRow,
  privileges: MedicalPrivilege[],
  now: Date,
) {
  const rows = privileges
    .map((privilege) => `
      <p style="margin:0;font-size:12px;color:#777;">${privilege.label}</p>
      <p style="margin:4px 0 10px;">${formatDisplayDate(privilege.dueDate)} (${reminderLine(privilege.dueDate, now)})</p>
    `)
    .join("");

  await resend.emails.send({
    from: getFromEmail(),
    to,
    subject: "Medical certificate reminder",
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f5f7fa;padding:40px 0;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 8px 24px rgba(0,0,0,0.06);">
    <h2 style="margin:0 0 12px;font-size:18px;">Medical Certificate Reminder</h2>
    <p style="font-size:14px;color:#333;">Your medical certificate privileges are within the reminder window.</p>
    <div style="margin:20px 0;padding:14px;border-radius:8px;background:#f1f3f5;">
      <p style="margin:0;font-size:12px;color:#777;">Account</p>
      <p style="margin:4px 0 10px;">${profile.display_name || "PilotSeal user"}</p>
      ${rows}
    </div>
    <a href="https://pilotseal.com/dashboard/account-settings" style="padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;">Review medical</a>
  </div>
</div>`,
  });
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
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return jsonResponse({ error: "Missing environment configuration" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const resend = new Resend(resendApiKey);
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

    const profilesById = new Map((profiles || []).map((profile: ProfileRow) => [profile.id, profile]));
    let certificateRemindersSent = 0;
    let medicalRemindersSent = 0;

    for (const certificate of (certificates || []) as CertificateRow[]) {
      const dueDate = getCertificateDueDate(certificate);
      if (!dueDate || !isInsideReminderWindow(dueDate, now)) {
        continue;
      }

      const dueDateText = formatIsoDate(dueDate);
      if (certificate.last_alerted_due_date === dueDateText) {
        continue;
      }

      const profile = profilesById.get(certificate.user_id);
      if (!profile?.email) {
        continue;
      }

      if (!profile.self_person_id || certificate.person_id !== profile.self_person_id) {
        continue;
      }

      await sendCertificateReminder(resend, profile.email, certificate, dueDate, now);

      const { error: updateError } = await supabase
        .from("saved_person_certificates")
        .update({
          last_alerted_due_date: dueDateText,
          alert_sent_at: now.toISOString(),
        })
        .eq("id", certificate.id);

      if (updateError) {
        console.error("Failed to mark certificate reminder as sent", updateError);
        continue;
      }

      certificateRemindersSent += 1;
    }

    for (const profile of (profiles || []) as ProfileRow[]) {
      if (!profile.email) {
        continue;
      }

      const duePrivileges = getMedicalPrivileges(profile)
        .filter((privilege) => isInsideReminderWindow(privilege.dueDate, now))
        .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime());

      if (duePrivileges.length === 0) {
        continue;
      }

      const alertDueDate = formatIsoDate(duePrivileges[0].dueDate);
      if (profile.last_medical_alerted_due_date === alertDueDate) {
        continue;
      }

      await sendMedicalReminder(resend, profile.email, profile, duePrivileges, now);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          last_medical_alerted_due_date: alertDueDate,
          medical_alert_sent_at: now.toISOString(),
        })
        .eq("id", profile.id);

      if (updateError) {
        console.error("Failed to mark medical reminder as sent", updateError);
        continue;
      }

      medicalRemindersSent += 1;
    }

    return jsonResponse({
      success: true,
      certificateRemindersSent,
      medicalRemindersSent,
    });
  } catch (error) {
    console.error("Reminder function failed", error);
    return jsonResponse({ error: "Reminder function failed" }, 500);
  }
});
