import type { NotificationDeliveryModes, NotificationDeliveryState, NotificationRecord } from "./notifications";

export function notificationSource(notification: Pick<NotificationRecord, "source_label" | "kind">) {
  return notification.source_label || ({ system: "PilotSeal", organization: "Organization", schedule: "Schedule", reminder: "Personal reminder" }[notification.kind]);
}

export function safeNotificationAction(url: string | null) {
  if (!url?.startsWith("/") || url.startsWith("//") || /[\\\u0000-\u0020]/.test(url)) return null;
  try {
    const decoded = decodeURIComponent(url);
    if (decoded.startsWith("//") || /[\\\u0000-\u0020]/.test(decoded)) return null;
    return url;
  } catch { return null; }
}

export function notificationIsActive(notification: NotificationRecord, now = Date.now()) {
  return notification.is_active !== false && !notification.delivery_state?.completed_at && notification.status === "sent" && !notification.withdrawn_at
    && (!notification.expires_at || Date.parse(notification.expires_at) > now)
    && (!notification.scheduled_at || Date.parse(notification.scheduled_at) <= now);
}

export function notificationSourceKey(notification: NotificationRecord) {
  return `${notification.kind}:${notification.organization_id ?? "personal"}`;
}

export type NotificationPushGroup = { key: string; notifications: NotificationRecord[] };

export function buildNotificationPushGroups(inbox: NotificationRecord[], states: NotificationDeliveryState[], modes: NotificationDeliveryModes, now = Date.now()): NotificationPushGroup[] {
  const shown = new Set(states.filter(state => state.displayed_at || state.dismissed_at).map(state => state.notification_id));
  const latestEvents = new Map<string, NotificationRecord>();
  for (const n of inbox) {
    if (!n.event_key || !notificationIsActive(n, now)) continue;
    const key = `${notificationSourceKey(n)}:${n.event_key}`;
    const previous = latestEvents.get(key);
    if (!previous || Date.parse(n.created_at) > Date.parse(previous.created_at)) latestEvents.set(key, n);
  }
  const eligible = inbox.filter(n => notificationIsActive(n, now) && !n.read_at && !shown.has(n.id) && modes[n.kind] === "instant"
    && (!n.event_key || latestEvents.get(`${notificationSourceKey(n)}:${n.event_key}`)?.id === n.id));
  const priorities = { critical: 4, high: 3, normal: 2, low: 1 };
  eligible.sort((a, b) => priorities[b.priority] - priorities[a.priority] || Date.parse(b.created_at) - Date.parse(a.created_at));
  // Collapse repeated business events to the newest message, keeping organization boundaries.
  const events = new Set<string>();
  const groups = new Map<string, NotificationPushGroup>();
  for (const n of eligible) {
    const source = notificationSourceKey(n);
    const event = n.event_key ? `${source}:${n.event_key}` : null;
    if (event && events.has(event)) continue;
    if (event) events.add(event);
    const group = groups.get(source) ?? { key: source, notifications: [] };
    group.notifications.push(n);
    groups.set(source, group);
  }
  return [...groups.values()];
}

// Legacy notification timestamps are UTC timestamp-without-time-zone columns.
// PostgREST omits the suffix; append it before browsers parse in their own zone.
export function notificationUtcTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
}

