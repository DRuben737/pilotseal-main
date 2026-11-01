import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  if (request.method === "GET") {
    return json({ available: Boolean(publicKey), publicKey: publicKey || null });
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@pilotseal.com";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!publicKey || !privateKey || !supabaseUrl || !serviceRoleKey) {
    return json({ error: "Push delivery is not configured" }, 503);
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc("claim_due_notification_web_pushes", { p_limit: 100 });
  if (error) return json({ error: "Unable to claim push deliveries" }, 500);

  const deliveries = Array.isArray(data) ? data : [];
  let delivered = 0;
  let failed = 0;
  for (const item of deliveries) {
    let failureReason: string | null = null;
    try {
      await webpush.sendNotification(
        {
          endpoint: String(item.endpoint),
          keys: { p256dh: String(item.p256dh), auth: String(item.auth_secret) },
        },
        JSON.stringify({
          id: item.notification_id,
          title: item.title,
          body: item.message,
          priority: item.priority,
          source: item.source_label || "PilotSeal",
          url: item.action_url || "/console/personal/notifications",
        }),
        {
          TTL: item.priority === "critical" ? 86400 : item.priority === "high" ? 21600 : 3600,
          urgency: item.priority === "critical" || item.priority === "high" ? "high" : "normal",
        },
      );
      delivered += 1;
    } catch (pushError) {
      failed += 1;
      const statusCode = typeof pushError === "object" && pushError && "statusCode" in pushError
        ? Number((pushError as { statusCode?: number }).statusCode) : 0;
      failureReason = `${statusCode || 500}: delivery rejected`;
    }
    await admin.rpc("finish_notification_web_push", {
      p_notification_id: item.notification_id,
      p_device_id: item.device_id,
      p_delivered: failureReason === null,
      p_failure_reason: failureReason,
    });
  }
  return json({ claimed: deliveries.length, delivered, failed });
});
