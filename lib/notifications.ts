import { getSupabaseClient } from "@/lib/supabase";

export type NotificationPriority = "low" | "normal" | "high" | "critical";
export type NotificationStatus = "draft" | "scheduled" | "sent";

export type NotificationRecord = {
  created_at: string;
  created_by: string;
  id: string;
  message: string;
  priority: NotificationPriority;
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
  "id, title, message, priority, status, scheduled_at, created_at, created_by";

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
    payload.scheduled_at = input.scheduledAt || null;
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
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as NotificationRecord[];
}

export async function fetchNotificationHistory() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("notifications")
    .select(notificationSelect)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as NotificationRecord[];
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

  return data as NotificationRecord;
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

  return data as NotificationRecord;
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
