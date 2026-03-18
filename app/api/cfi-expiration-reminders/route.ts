import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const reminderFromEmail = process.env.REMINDER_FROM_EMAIL;
const reminderCronSecret = process.env.REMINDER_CRON_SECRET;

function parseCertificateExpiration(value: string | null) {
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

async function sendReminderEmail(to: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: reminderFromEmail,
      to,
      subject: "CFI certificate expiration reminder",
      text: [
        "Your CFI certificate will expire within the next 3 months.",
        "You may renew within this period without changing your expiration cycle.",
      ].join("\n\n"),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send reminder email: ${errorText}`);
  }
}

export async function POST(request: Request) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("Missing Supabase service role configuration for reminders.");
    return Response.json({ error: "Server configuration error." }, { status: 500 });
  }

  if (!resendApiKey || !reminderFromEmail) {
    console.error("Missing email configuration for reminders.");
    return Response.json({ error: "Email configuration error." }, { status: 500 });
  }

  if (reminderCronSecret) {
    const providedSecret = request.headers.get("x-reminder-secret");
    if (providedSecret !== reminderCronSecret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  try {
    const { data: cfis, error } = await supabase
      .from("saved_people")
      .select("id, user_id, cert_exp_date, alert_sent, is_default")
      .eq("role", "cfi")
      .eq("is_default", true)
      .eq("alert_sent", false)
      .not("cert_exp_date", "is", null);

    if (error) {
      console.error("Failed to load default CFIs for reminders:", error);
      return Response.json({ error: "Failed to load default CFIs." }, { status: 500 });
    }

    const threshold = new Date();
    threshold.setMonth(threshold.getMonth() + 3);

    let remindersSent = 0;

    for (const cfi of cfis ?? []) {
      const expirationDate = parseCertificateExpiration(cfi.cert_exp_date);
      if (!expirationDate || expirationDate > threshold) {
        continue;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", cfi.user_id)
        .maybeSingle();

      if (profileError) {
        console.error("Failed to load profile email for reminder:", profileError);
        continue;
      }

      if (!profile?.email) {
        continue;
      }

      try {
        await sendReminderEmail(profile.email);

        const { error: updateError } = await supabase
          .from("saved_people")
          .update({ alert_sent: true })
          .eq("id", cfi.id);

        if (updateError) {
          console.error("Failed to mark reminder as sent:", updateError);
          continue;
        }

        remindersSent += 1;
      } catch (sendError) {
        console.error("Failed to send reminder email:", sendError);
      }
    }

    return Response.json({ success: true, remindersSent });
  } catch (error) {
    console.error("Unexpected reminder processing error:", error);
    return Response.json({ error: "Failed to process reminders." }, { status: 500 });
  }
}
