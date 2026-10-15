"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DetailDrawer } from "@/components/admin/AdminConsole";
import { fetchInboxNotifications, fetchNotificationDeliveryStates, markNotificationRead, subscribeToNotificationChanges, updateNotificationDeliveryState, type NotificationRecord } from "@/lib/notifications";

import { notificationSource, safeNotificationAction } from "@/lib/notification-presentation";
export { notificationSource, safeNotificationAction } from "@/lib/notification-presentation";

export default function NotificationReader({ notification, userId, onClose, onChanged }: {
  notification: NotificationRecord | null;
  userId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [completedId, setCompletedId] = useState("");
  const [unavailableId, setUnavailableId] = useState("");
  const [acknowledgedId, setAcknowledgedId] = useState("");
  const action = safeNotificationAction(notification?.action_url ?? null);
  const notificationId = notification?.id;
  useEffect(() => {
    if (!notificationId || !userId) return;
    let cancelled = false;
    async function refresh() {
      try {
        const [states, inbox] = await Promise.all([fetchNotificationDeliveryStates(userId), fetchInboxNotifications(userId)]);
        if (!cancelled) {
          setUnavailableId(inbox.some(item => item.id === notificationId) ? "" : notificationId!);
          const state = states.find(s => s.notification_id === notificationId);
          setAcknowledgedId(state?.acknowledged_at ? notificationId! : "");
          setCompletedId(state?.completed_at ? notificationId! : "");
        }
      } catch { if (!cancelled) setError("Unable to load receipt status. Please reopen this message to retry."); }
    }
    setError("");
    void markNotificationRead(notificationId, userId).catch(() => { if (!cancelled) setError("Unable to mark this message as read. Please reopen to retry."); });
    void refresh();
    const unsubscribe = subscribeToNotificationChanges(userId, () => void refresh());
    return () => { cancelled = true; unsubscribe(); };
  }, [notificationId, userId]);

  async function acknowledge() {
    if (!notification || saving) return;
    setSaving(true);
    setError("");
    try {
      await updateNotificationDeliveryState(notification.id, userId, "acknowledged_at");
      setAcknowledgedId(notification.id);
      onChanged?.();
    } catch {
      setError("Unable to confirm receipt. Please try again.");
    } finally { setSaving(false); }
  }
  return <DetailDrawer open={Boolean(notification)} title={notification?.title ?? "Notification"} onClose={onClose}>
    {notification && unavailableId === notification.id ? <p role="status" className="text-sm text-slate-600">This message is no longer available.</p> : notification ? <article className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>{notificationSource(notification)}</span>
        <time dateTime={notification.created_at}>{new Date(notification.created_at).toLocaleString()}</time>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{notification.message}</p>
      {completedId === notification.id ? <p role="status" className="text-sm text-emerald-700">Task completed</p> : null}
      {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        {action ? <Link className="secondary-button" href={action} onClick={onClose}>Open related page</Link> : null}
        {notification.requires_acknowledgement ? <button type="button" className="primary-button" disabled={saving || acknowledgedId === notification.id} onClick={() => void acknowledge()}>{acknowledgedId === notification.id ? "Receipt confirmed" : saving ? "Confirming…" : "Confirm receipt"}</button> : null}
      </div>
    </article> : null}
  </DetailDrawer>;
}
