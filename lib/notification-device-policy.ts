export type NotificationPermissionState = NotificationPermission | "unsupported";
export type SystemNotificationStatus = {
  enabled: boolean;
  permission: NotificationPermissionState;
  supported: boolean;
};

export function notificationPermissionLabel(status: SystemNotificationStatus) {
  if (!status.supported) return "Not supported on this device.";
  if (status.permission === "denied") return "Blocked in browser settings.";
  if (status.enabled) return "Alerts when PilotSeal is not open.";
  if (status.permission === "granted") return "Ready to enable on this device.";
  return "Get alerts when PilotSeal is not open.";
}
