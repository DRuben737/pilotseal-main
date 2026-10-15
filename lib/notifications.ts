import { notificationUtcTimestamp } from "@/lib/notification-presentation";
import { getSupabaseClient } from "@/lib/supabase";

export type NotificationPriority = "low" | "normal" | "high" | "critical";
export type NotificationStatus = "draft" | "scheduled" | "sent";
export type NotificationKind = "system" | "reminder" | "organization" | "schedule";

export type NotificationDeliveryMode = "instant" | "inbox" | "off";
export type NotificationDeliveryModes = Record<NotificationKind, NotificationDeliveryMode>;
export const defaultDeliveryModes: NotificationDeliveryModes = { system: "instant", organization: "instant", schedule: "instant", reminder: "inbox" };

export type NotificationPreferences = {
  delivery_modes: NotificationDeliveryModes;
  user_id: string;
  personal_reminders_enabled: boolean;
  organization_messages_enabled: boolean;
  platform_notices_enabled: boolean;
  schedule_notifications_enabled: boolean;
  updated_at: string | null;
};

export function defaultNotificationPreferences(userId: string): NotificationPreferences {
  return {
    delivery_modes: { ...defaultDeliveryModes },
    user_id: userId,
    personal_reminders_enabled: true,
    organization_messages_enabled: true,
    platform_notices_enabled: true,
    schedule_notifications_enabled: true,
    updated_at: null,
  };
}

export type NotificationRecord = {
  is_active: boolean;
  delivery_state?: NotificationDeliveryState;
  expires_at: string | null;
  event_key: string | null;
  requires_acknowledgement: boolean;
  withdrawn_at: string | null;
  created_at: string;
  created_by: string;
  id: string;
  kind: NotificationKind;
  message: string;
  organization_id: string | null;
  priority: NotificationPriority;
  action_url: string | null;
  recipient_user_id: string | null;
  read_at: string | null;
  source_label: string | null;
  scheduled_at: string | null;
  status: NotificationStatus;
  title: string;
};

type NotificationInput = {
  createdBy: string;
  message: string;
  priority: NotificationPriority;
  scheduledAt?: string | null;
  status: NotificationStatus;
  title: string;
};

type NotificationUpdate = {
  message?: string;
  priority?: NotificationPriority;
  scheduledAt?: string | null;
  status?: NotificationStatus;
  title?: string;
};

const notificationSelect =
  "id, title, message, priority, status, scheduled_at, created_at, created_by, kind, recipient_user_id, organization_id, source_label, action_url, expires_at, event_key, requires_acknowledgement, withdrawn_at, is_active";

const notificationInboxChangedEvent = "pilotseal:notification-inbox-changed";
let notificationSubscriptionSequence = 0;

function broadcastNotificationInboxChange(userId: string) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(notificationInboxChangedEvent, {
      detail: { userId },
    })
  );
}

function normalizeNotification(
  value: Record<string, unknown>,
  readsByNotificationId: Map<string, string> = new Map()
): NotificationRecord {
  const id = String(value.id ?? "");
  return {
    is_active: value.is_active !== false,
    expires_at: typeof value.expires_at === "string" ? value.expires_at : null,
    event_key: typeof value.event_key === "string" ? value.event_key : null,
    requires_acknowledgement: value.requires_acknowledgement === true,
    withdrawn_at: typeof value.withdrawn_at === "string" ? value.withdrawn_at : null,
    action_url: typeof value.action_url === "string" ? value.action_url : null,
    created_at: notificationUtcTimestamp(value.created_at) ?? "",
    created_by: String(value.created_by ?? ""),
    id,
    kind: (
      value.kind === "reminder" || value.kind === "organization" || value.kind === "schedule"
        ? value.kind
        : "system"
    ) as NotificationKind,
    message: String(value.message ?? value.content ?? ""),
    organization_id: typeof value.organization_id === "string" ? value.organization_id : null,
    priority: String(value.priority ?? "normal") as NotificationPriority,
    recipient_user_id: typeof value.recipient_user_id === "string" ? value.recipient_user_id : null,
    read_at: readsByNotificationId.get(id) ?? null,
    scheduled_at: notificationUtcTimestamp(value.scheduled_at),
    source_label: typeof value.source_label === "string" ? value.source_label : null,
    status: String(value.status ?? "sent") as NotificationStatus,
    title: String(value.title ?? "Notification"),
  };
}

function mapNotificationPayload(input: NotificationInput | NotificationUpdate) {
  const payload: Record<string, string | null> = {};

  if ("title" in input && input.title !== undefined) {
    payload.title = input.title.trim();
  }

  if ("message" in input && input.message !== undefined) {
    payload.message = input.message.trim();
  }

  if ("priority" in input && input.priority !== undefined) {
    payload.priority = input.priority;
  }

  if ("status" in input && input.status !== undefined) {
    payload.status = input.status;
  }

  if ("scheduledAt" in input) {
    payload.scheduled_at = input.scheduledAt ? new Date(input.scheduledAt).toISOString() : null;
  }

  if ("createdBy" in input) {
    payload.created_by = input.createdBy;
  }

  return payload;
}

export async function fetchActiveNotifications() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("notifications")
    .select(notificationSelect)
    .eq("status", "sent")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((value) => normalizeNotification(value as Record<string, unknown>));
}

export async function fetchInboxNotifications(userId: string) {
  const supabase = getSupabaseClient();
  const [notificationsResult, readsResult, deletionsResult, preferences, deliveryStates] = await Promise.all([
    supabase
      .from("notifications")
      .select(notificationSelect)
      .eq("status", "sent")
      .order("created_at", { ascending: false }),
    supabase
      .from("notification_reads")
      .select("notification_id, read_at")
      .eq("user_id", userId),
    supabase
      .from("notification_inbox_deletions")
      .select("notification_id")
      .eq("user_id", userId),
    fetchNotificationPreferences(userId),
    fetchNotificationDeliveryStates(userId),
  ]);

  if (notificationsResult.error) throw notificationsResult.error;
  if (readsResult.error) throw readsResult.error;
  if (deletionsResult.error) throw deletionsResult.error;

  const readsByNotificationId = new Map(
    (readsResult.data ?? []).map((read) => [String(read.notification_id), String(read.read_at)])
  );
  const deletedNotificationIds = new Set(
    (deletionsResult.data ?? []).map((deletion) => String(deletion.notification_id))
  );
  const states = new Map(deliveryStates.map(state => [state.notification_id, state]));
  return (notificationsResult.data ?? [])
    .map((value) => normalizeNotification(value as Record<string, unknown>, readsByNotificationId))
    .map(notification => ({ ...notification, delivery_state: states.get(notification.id) }))
    .filter(notification => notification.is_active || notification.delivery_state?.completed_at)
    .filter((notification) => !notification.withdrawn_at && (!notification.expires_at || Date.parse(notification.expires_at) > Date.now()))
    .filter((notification) => !notification.scheduled_at || Date.parse(notification.scheduled_at) <= Date.now())
    .filter((notification) => !deletedNotificationIds.has(notification.id))
    .filter((notification) => notification.priority === "critical" || isNotificationKindEnabled(notification.kind, preferences));
}

function isNotificationKindEnabled(kind: NotificationKind, preferences: NotificationPreferences) {
  if (preferences.delivery_modes?.[kind] === "off") return false;
  if (kind === "reminder") return preferences.personal_reminders_enabled;
  if (kind === "organization") return preferences.organization_messages_enabled;
  if (kind === "schedule") return preferences.schedule_notifications_enabled;
  return preferences.platform_notices_enabled;
}

export async function fetchNotificationPreferences(userId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("user_id, personal_reminders_enabled, organization_messages_enabled, platform_notices_enabled, schedule_notifications_enabled, delivery_modes, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return (data as NotificationPreferences | null) ?? defaultNotificationPreferences(userId);
}

export async function updateNotificationPreferences(
  userId: string,
  preferences: Pick<NotificationPreferences, "personal_reminders_enabled" | "organization_messages_enabled" | "platform_notices_enabled" | "schedule_notifications_enabled"> & Partial<Pick<NotificationPreferences, "delivery_modes">>
) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .upsert({
      user_id: userId,
      ...preferences,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    .select("user_id, personal_reminders_enabled, organization_messages_enabled, platform_notices_enabled, schedule_notifications_enabled, delivery_modes, updated_at")
    .single();

  if (error) throw error;
  broadcastNotificationInboxChange(userId);
  return data as NotificationPreferences;
}

export async function refreshMyProfileReminders() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("refresh_my_profile_reminders");
  if (error) throw error;
  return Number(data ?? 0);
}

export async function fetchUnreadNotificationCount(userId: string) {
  const notifications = await fetchInboxNotifications(userId);
  return notifications.filter((notification) => !notification.read_at && !notification.delivery_state?.completed_at).length;
}

export function subscribeToNotificationChanges(userId: string, onChange: () => void) {
  const supabase = getSupabaseClient();
  const handleLocalChange = (event: Event) => {
    const changedUserId = (event as CustomEvent<{ userId?: string }>).detail?.userId;
    if (changedUserId === userId) onChange();
  };

  if (typeof window !== "undefined") {
    window.addEventListener(notificationInboxChangedEvent, handleLocalChange);
  }

  // Scheduled publication and expiry change eligibility without a row mutation.
  // Refresh every consumer as time passes, including inbox-only sources.
  const interval = typeof window !== "undefined" ? window.setInterval(onChange, 15000) : null;
  const handleVisibility = () => { if (document.visibilityState === "visible") onChange(); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", handleVisibility);

  const channel = supabase
    .channel(`notification-inbox:${userId}:${++notificationSubscriptionSequence}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications" },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notification_reads", filter: `user_id=eq.${userId}` },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notification_inbox_deletions", filter: `user_id=eq.${userId}` },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notification_preferences", filter: `user_id=eq.${userId}` },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notification_delivery_states", filter: `user_id=eq.${userId}` },
      onChange
    )
    .subscribe();

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener(notificationInboxChangedEvent, handleLocalChange);
    }
    if (interval !== null) window.clearInterval(interval);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", handleVisibility);
    void supabase.removeChannel(channel);
  };
}

export async function fetchNotificationHistory() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("notifications")
    .select(notificationSelect)
    .is("recipient_user_id", null)
    .is("organization_id", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((value) => normalizeNotification(value as Record<string, unknown>));
}

export async function createNotification(input: NotificationInput) {
  const supabase = getSupabaseClient();
  const payload = mapNotificationPayload(input);
  const { data, error } = await supabase
    .from("notifications")
    .insert(payload)
    .select(notificationSelect)
    .single();

  if (error) {
    throw error;
  }

  return normalizeNotification(data as Record<string, unknown>);
}

export async function updateNotification(id: string, updates: NotificationUpdate) {
  const supabase = getSupabaseClient();
  const payload = mapNotificationPayload(updates);
  const { data, error } = await supabase
    .from("notifications")
    .update(payload)
    .eq("id", id)
    .select(notificationSelect)
    .single();

  if (error) {
    throw error;
  }

  return normalizeNotification(data as Record<string, unknown>);
}

export async function deleteNotification(id: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("notifications").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function sendNotificationNow(id: string) {
  return updateNotification(id, {
    scheduledAt: new Date().toISOString(),
    status: "sent",
  });
}

export async function markNotificationRead(notificationId: string, userId: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("notification_reads").upsert(
    {
      notification_id: notificationId,
      user_id: userId,
      read_at: new Date().toISOString(),
    },
    { onConflict: "notification_id,user_id" }
  );
  if (error) throw error;
  broadcastNotificationInboxChange(userId);
}

export async function deleteInboxNotification(notificationId: string, userId: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("notification_inbox_deletions").upsert(
    {
      notification_id: notificationId,
      user_id: userId,
      deleted_at: new Date().toISOString(),
    },
    { onConflict: "notification_id,user_id" }
  );
  if (error) throw error;
  broadcastNotificationInboxChange(userId);
}

export async function markAllNotificationsRead(notificationIds: string[], userId: string) {
  if (notificationIds.length === 0) return;
  const supabase = getSupabaseClient();
  const readAt = new Date().toISOString();
  const { error } = await supabase.from("notification_reads").upsert(
    notificationIds.map((notificationId) => ({
      notification_id: notificationId,
      user_id: userId,
      read_at: readAt,
    })),
    { onConflict: "notification_id,user_id" }
  );
  if (error) throw error;
  broadcastNotificationInboxChange(userId);
}

export async function createOrganizationNotification(input: {
  organizationId: string;
  title: string;
  message: string;
  priority: NotificationPriority;
}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("create_organization_notification", {
    p_organization_id: input.organizationId,
    p_title: input.title.trim(),
    p_message: input.message.trim(),
    p_priority: input.priority,
    p_action_url: "/console/personal/notifications",
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function fetchOrganizationNotificationRecipientCount(organizationId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("get_organization_notification_recipient_count", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export type NotificationDeliveryState = {
  notification_id: string;
  displayed_at: string | null;
  dismissed_at: string | null;
  acknowledged_at: string | null;
  completed_at: string | null;
};

export async function fetchNotificationDeliveryStates(userId: string) {
  const { data, error } = await getSupabaseClient()
    .from("notification_delivery_states")
    .select("notification_id, displayed_at, dismissed_at, acknowledged_at, completed_at")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as NotificationDeliveryState[];
}

export async function claimNotificationDelivery(notificationId: string) {
  const { data, error } = await getSupabaseClient().rpc("claim_notification_delivery", {
    p_notification_id: notificationId,
  });
  if (error) throw error;
  return data === true;
}

export async function updateNotificationDeliveryState(
  notificationId: string,
  userId: string,
  state: "dismissed_at" | "acknowledged_at" | "completed_at",
) {
  const { error } = await getSupabaseClient().from("notification_delivery_states")
    .upsert({ notification_id: notificationId, user_id: userId, [state]: new Date().toISOString() },
      { onConflict: "notification_id,user_id" });
  if (error) throw error;
  broadcastNotificationInboxChange(userId);
}

export async function reserveNotificationDeliveries(notificationIds: string[], token: string) {
  const { data, error } = await getSupabaseClient().rpc("reserve_notification_deliveries", {
    p_notification_ids: notificationIds.slice(0, 100), p_token: token,
  });
  if (error) throw error;
  return (data ?? []) as string[];
}

export async function confirmNotificationDeliveries(token: string) {
  const { error } = await getSupabaseClient().rpc("confirm_notification_deliveries", { p_token: token });
  if (error) throw error;
}
