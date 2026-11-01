import { getSupabaseClient } from "@/lib/supabase";

const deviceStorageKey = "pilotseal:notification-device";
export type NotificationPermissionState = NotificationPermission | "unsupported";

function base64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map(character => character.charCodeAt(0)));
}

export function notificationDeviceKey() {
  let key = window.localStorage.getItem(deviceStorageKey);
  if (!key) { key = crypto.randomUUID(); window.localStorage.setItem(deviceStorageKey, key); }
  return key;
}

function devicePlatform() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches
    || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  const ua = navigator.userAgent;
  const platform = /iPad|iPhone|iPod/.test(ua) ? "ios" : /Android/.test(ua) ? "android" : standalone ? "desktop" : "web";
  return { platform, standalone };
}

export function systemNotificationCapability() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { permission: "unsupported" as const, supported: false };
  }
  return { permission: Notification.permission as NotificationPermissionState, supported: true };
}

async function registerDevice(subscription?: PushSubscription | null, enabled = true) {
  const capability = systemNotificationCapability();
  const device = devicePlatform();
  const { data, error } = await getSupabaseClient().rpc("register_notification_device", {
    p_device_key: notificationDeviceKey(), p_platform: device.platform,
    p_permission: capability.permission, p_is_installed: device.standalone,
    p_push_subscription: subscription?.toJSON() ?? null, p_enabled: enabled,
  });
  if (error) throw error;
  return String(data);
}

export async function syncNotificationDevice() {
  const capability = systemNotificationCapability();
  if (!capability.supported) return registerDevice(null);
  const registration = await navigator.serviceWorker.register("/notification-sw.js", { scope: "/" });
  return registerDevice(await registration.pushManager.getSubscription());
}

export async function enableSystemNotifications() {
  const capability = systemNotificationCapability();
  if (!capability.supported) throw new Error("System notifications are not supported by this browser.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    await registerDevice(null);
    throw new Error("Notification permission was not granted.");
  }
  const registration = await navigator.serviceWorker.register("/notification-sw.js", { scope: "/" });
  const response = await fetch((process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") + "/functions/v1/notification-web-push", {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
  });
  if (!response.ok) throw new Error("System notifications are not configured.");
  const config = await response.json() as { available?: boolean; publicKey?: string | null };
  if (!config.available || !config.publicKey) throw new Error("System notifications are not configured.");
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(config.publicKey),
  });
  await registerDevice(subscription);
  return permission;
}

export async function disableSystemNotifications() {
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  }
  await registerDevice(null, false);
}

export async function reserveDeviceNotifications(notificationIds: string[]) {
  const { data, error } = await getSupabaseClient().rpc("reserve_notification_channel_deliveries", {
    p_notification_ids: notificationIds.slice(0, 100), p_device_key: notificationDeviceKey(),
  });
  if (error) throw error;
  return (data ?? []) as string[];
}

export async function updateDeviceNotificationState(notificationIds: string[], state: "displayed" | "dismissed") {
  const { error } = await getSupabaseClient().rpc("update_notification_channel_delivery", {
    p_notification_ids: notificationIds.slice(0, 100), p_device_key: notificationDeviceKey(), p_state: state,
  });
  if (error) throw error;
}
