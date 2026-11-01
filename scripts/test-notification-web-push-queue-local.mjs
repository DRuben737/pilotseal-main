import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

execFileSync(process.execPath, ["scripts/assert-local-targets.mjs"], { stdio: "pipe" });
const raw = execFileSync("./node_modules/.bin/supabase", ["status", "--network-id", "pilotseal-local", "--output", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const env = Object.fromEntries(raw.split(/\r?\n/).flatMap(line => {
  const match = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/);
  return match ? [[match[1], match[2]]] : [];
}));
assert(["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(env.API_URL).hostname));
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY ?? env.SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const unwrap = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const user = unwrap(await admin.from("profiles").select("id").eq("display_name", "Avery Testpilot").single());
const deviceKey = crypto.randomUUID();
const device = unwrap(await admin.from("notification_devices").insert({
  user_id: user.id, device_key: deviceKey, platform: "web", permission: "granted", enabled: true,
  push_subscription: { endpoint: "https://push.example.test/subscription", keys: { p256dh: "synthetic", auth: "synthetic" } },
}).select("id").single());
const existing = unwrap(await admin.from("notifications").select("id").eq("status", "sent"));
if (existing.length) {
  unwrap(await admin.from("notification_channel_deliveries").insert(existing.map(item => ({
    notification_id: item.id, user_id: user.id, device_id: device.id, channel: "web_push", delivered_at: new Date().toISOString(),
  }))));
}
const created = [];
try {
  for (const priority of ["low", "normal", "high", "critical"]) {
    const row = unwrap(await admin.from("notifications").insert({
      title: `Queue QA ${priority} ${Date.now()}`, message: "Synthetic queue verification.",
      priority, status: "sent", is_active: true, kind: "system", recipient_user_id: user.id, created_by: user.id,
    }).select("id").single());
    created.push({ id: row.id, priority });
  }
  const claims = unwrap(await admin.rpc("claim_due_notification_web_pushes", { p_limit: 100 }));
  const claimed = new Set(claims.map(item => item.notification_id));
  assert(!claimed.has(created.find(item => item.priority === "low").id), "Low priority must not enter Web Push");
  for (const item of created.filter(item => item.priority !== "low")) assert(claimed.has(item.id), `${item.priority} should enter Web Push`);
  const normal = created.find(item => item.priority === "normal");
  unwrap(await admin.rpc("finish_notification_web_push", {
    p_notification_id: normal.id, p_device_id: device.id, p_delivered: true, p_failure_reason: null,
  }));
  const delivery = unwrap(await admin.from("notification_channel_deliveries").select("delivered_at,failed_at").eq("notification_id", normal.id).eq("device_id", device.id).single());
  assert(delivery.delivered_at && !delivery.failed_at);
  console.log("Web Push queue checks passed: priority eligibility, idempotent claim, and delivery receipt.");
} finally {
  await admin.from("notifications").delete().in("id", created.map(item => item.id));
  await admin.from("notification_devices").delete().eq("id", device.id);
}
