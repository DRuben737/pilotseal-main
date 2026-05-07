const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const reminderCronSecret = process.env.REMINDER_CRON_SECRET;

export async function POST() {
  if (!supabaseUrl) {
    console.error("Missing Supabase URL for reminders.");
    return Response.json({ error: "Server configuration error." }, { status: 500 });
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/CFI-exp-check`, {
    method: "POST",
    headers: {
      ...(reminderCronSecret ? { "x-reminder-secret": reminderCronSecret } : {}),
    },
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : { message: await response.text() };

  return Response.json(payload, { status: response.status });
}
