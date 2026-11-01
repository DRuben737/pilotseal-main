import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";

const appUrl = "http://localhost:3000";
const isLocal = value => ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(value).hostname);
assert(isLocal(appUrl));
execFileSync(process.execPath, ["scripts/assert-local-targets.mjs"], { stdio: "pipe" });
const raw = execFileSync("./node_modules/.bin/supabase", ["status", "--network-id", "pilotseal-local", "--output", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const env = Object.fromEntries(raw.split(/\r?\n/).flatMap(line => {
  const match = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/);
  return match ? [[match[1], match[2]]] : [];
}));
assert(isLocal(env.API_URL));
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY ?? env.SECRET_KEY, options);
const pilot = createClient(env.API_URL, env.ANON_KEY ?? env.PUBLISHABLE_KEY, options);
const unwrap = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const auth = unwrap(await pilot.auth.signInWithPassword({ email: "pilot.one@example.test", password: "LocalPilot!2026" }));
const userId = auth.user.id;
const deviceKeys = [crypto.randomUUID(), crypto.randomUUID()];
const prefix = `Interruption QA ${Date.now()}`;
const output = "artifacts/notification-interruption-qa";
await fs.mkdir(output, { recursive: true });

for (const deviceKey of deviceKeys) {
  unwrap(await admin.from("notification_devices").insert({
    user_id: userId, device_key: deviceKey, platform: "web", permission: "default", enabled: true,
  }));
}
const oldNotifications = unwrap(await admin.from("notifications").select("id").eq("status", "sent"));
for (const deviceKey of deviceKeys) {
  const device = unwrap(await admin.from("notification_devices").select("id").eq("user_id", userId).eq("device_key", deviceKey).single());
  if (oldNotifications.length) {
    unwrap(await admin.from("notification_channel_deliveries").insert(oldNotifications.map(item => ({
      notification_id: item.id, user_id: userId, device_id: device.id, channel: "in_app",
      displayed_at: new Date().toISOString(), dismissed_at: new Date().toISOString(),
    }))));
  }
}
const created = [];
for (const priority of ["low", "normal", "high", "critical"]) {
  const notification = unwrap(await admin.from("notifications").insert({
    title: `${prefix} ${priority}`, message: `Synthetic ${priority} message for local verification.`,
    priority, status: "sent", is_active: true, kind: "system", recipient_user_id: userId,
    created_by: userId,
  }).select("id").single());
  created.push(notification.id);
}

const browser = await chromium.launch({ headless: true, channel: "chrome" });
async function makeContext(deviceKey, width) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: "America/New_York" });
  await context.route("**/*", route => isLocal(route.request().url()) ? route.continue() : route.abort());
  const authKey = `sb-${new URL(env.API_URL).hostname.split(".")[0]}-auth-token`;
  await context.addInitScript(({ authKey, session, deviceKey }) => {
    localStorage.setItem(authKey, JSON.stringify(session));
    localStorage.setItem("pilotseal:notification-device", deviceKey);
  }, { authKey, session: auth.session, deviceKey });
  return context;
}

const contexts = [];
try {
  const mobile = await makeContext(deviceKeys[0], 390);
  const desktop = await makeContext(deviceKeys[1], 1440);
  contexts.push(mobile, desktop);
  const mobilePage = await mobile.newPage();
  const desktopPage = await desktop.newPage();
  mobilePage.on("console", message => { if (message.type() === "error") console.log("mobile console:", message.text().replace(/eyJ[\w.-]+/g, "[redacted]")); });
  desktopPage.on("console", message => { if (message.type() === "error") console.log("desktop console:", message.text().replace(/eyJ[\w.-]+/g, "[redacted]")); });
  await Promise.all([
    mobilePage.goto(`${appUrl}/console/personal/account`),
    desktopPage.goto(`${appUrl}/console/personal/account`),
  ]);
  const mobileCritical = mobilePage.getByRole("alertdialog", { name: `${prefix} critical` });
  const desktopCritical = desktopPage.getByRole("alertdialog", { name: `${prefix} critical` });
  try {
    await Promise.all([mobileCritical.waitFor({ timeout: 20000 }), desktopCritical.waitFor({ timeout: 20000 })]);
  const beforeReconnect = unwrap(await admin.from("notification_devices").select("last_seen_at").eq("user_id", userId).eq("device_key", deviceKeys[0]).single());
  await mobile.setOffline(true);
  await mobilePage.waitForTimeout(250);
  await mobile.setOffline(false);
  await mobilePage.waitForTimeout(1000);
  const afterReconnect = unwrap(await admin.from("notification_devices").select("last_seen_at").eq("user_id", userId).eq("device_key", deviceKeys[0]).single());
  assert(Date.parse(afterReconnect.last_seen_at) > Date.parse(beforeReconnect.last_seen_at), "Online recovery re-synchronizes the device");
  } catch (error) {
    console.log("mobile page:", mobilePage.url(), (await mobilePage.locator("body").innerText()).slice(0, 1200));
    console.log("desktop page:", desktopPage.url(), (await desktopPage.locator("body").innerText()).slice(0, 1200));
    await mobilePage.screenshot({ path: `${output}/critical-failure-mobile.png` });
    throw error;
  }
  assert.equal(await mobileCritical.getByRole("button", { name: /dismiss/i }).count(), 0, "Critical cannot be casually dismissed");
  await mobilePage.keyboard.press("Escape");
  assert(await mobileCritical.isVisible(), "Escape cannot dismiss a critical notification");
  assert(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await mobilePage.screenshot({ path: `${output}/critical-mobile.png` });
  await desktopPage.screenshot({ path: `${output}/critical-desktop.png` });

  await mobileCritical.getByRole("button", { name: "Review details" }).click();
  const reader = mobilePage.getByRole("dialog", { name: `${prefix} critical` });
  await reader.waitFor();
  await mobilePage.keyboard.press("Escape");
  await reader.waitFor({ state: "hidden" });
  assert(await mobileCritical.isVisible(), "Closing the reader returns to the critical parent");
  await mobileCritical.getByRole("button", { name: "Confirm receipt" }).click();
  await mobileCritical.waitFor({ state: "hidden" });
  assert(await desktopCritical.isVisible(), "Presentation on one device does not suppress another device");
  await desktopCritical.getByRole("button", { name: "Confirm receipt" }).click();
  await desktopCritical.waitFor({ state: "hidden" });

  await desktopPage.reload();
  const high = desktopPage.getByRole("complementary", { name: "High priority notification" });
  await high.waitFor({ timeout: 20000 });
  await desktopPage.waitForTimeout(8000);
  assert(await high.isVisible(), "High priority notification persists");
  await high.getByRole("button", { name: "Dismiss notification" }).click();
  await high.waitFor({ state: "hidden" });

  await desktopPage.reload();
  const normal = desktopPage.getByRole("complementary", { name: "New notification" });
  await normal.getByText(`${prefix} normal`, { exact: true }).waitFor({ timeout: 20000 });
  await desktopPage.mouse.move(700, 800);
  await normal.waitFor({ state: "hidden", timeout: 12000 });
  await desktopPage.reload();
  await desktopPage.waitForTimeout(2500);
  assert.equal(await desktopPage.getByText(`${prefix} low`, { exact: true }).count(), 0, "Low priority remains inbox-only");
  await desktop.grantPermissions(["notifications"], { origin: appUrl });
  await desktopPage.goto(`${appUrl}/console/personal/notifications`);
  await desktopPage.getByRole("button", { name: "Preferences" }).click();
  const preferences = desktopPage.getByRole("dialog", { name: "Notification preferences" });
  await preferences.getByText("Ready to enable on this device.", { exact: true }).waitFor();
  await preferences.getByRole("button", { name: "Enable", exact: true }).waitFor();

  const rows = unwrap(await admin.from("notification_channel_deliveries").select("notification_id,device_id,channel,displayed_at,dismissed_at").in("notification_id", created));
  assert(rows.filter(row => row.channel === "in_app" && row.displayed_at).length >= 4, "Per-device delivery state is persisted");
  console.log("Notification interruption checks passed: mobile critical modal, nested return, two-device delivery, persistent high, transient normal, inbox-only low.");
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
  await admin.from("notification_channel_deliveries").delete().in("notification_id", created);
  await admin.from("notifications").delete().in("id", created);
  await admin.from("notification_devices").delete().eq("user_id", userId).in("device_key", deviceKeys);
}
