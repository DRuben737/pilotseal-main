"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import NotificationReader from "@/components/notifications/NotificationReader";
import { buildNotificationPushGroups, notificationSource, type NotificationPushGroup } from "@/lib/notification-presentation";
import { confirmNotificationDeliveries, defaultDeliveryModes, fetchInboxNotifications, fetchNotificationDeliveryStates, fetchNotificationPreferences, reserveNotificationDeliveries, subscribeToNotificationChanges, updateNotificationDeliveryState, type NotificationRecord } from "@/lib/notifications";

type PresentedGroup = NotificationPushGroup & { token: string; route: string };

export default function NotificationPush({ userId }: { userId: string }) {
  const pathname = usePathname();
  const [current, setCurrent] = useState<PresentedGroup | null>(null);
  const [reading, setReading] = useState<NotificationRecord | null>(null);
  const [paused, setPaused] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const active = useRef<PresentedGroup | null>(null);
  const readingRef = useRef(false);
  const nextAllowedAt = useRef(0);
  const inboxVisible = pathname.endsWith("/notifications");
  useEffect(() => {
    active.current = null;
    readingRef.current = false;
    setCurrent(null);
    setReading(null);
  }, [pathname]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let loading = false;
    async function refresh() {
      if (loading || document.visibilityState !== "visible") return;
      loading = true;
      try {
        const [inbox, states, preferences] = await Promise.all([fetchInboxNotifications(userId), fetchNotificationDeliveryStates(userId), fetchNotificationPreferences(userId)]);
        if (cancelled) return;
        const modes = { ...defaultDeliveryModes, ...preferences.delivery_modes };
        if (active.current) {
          const group = active.current;
          const remaining = group.notifications.filter(n => inbox.some(i => i.id === n.id && !i.read_at) && modes[n.kind] === "instant" && !states.find(s => s.notification_id === n.id)?.dismissed_at);
          if (!remaining.length || group.route !== pathname || inboxVisible) { active.current = null; setCurrent(null); }
          else if (remaining.length !== group.notifications.length) { active.current = { ...group, notifications: remaining }; setCurrent(active.current); }
          return;
        }
        if (readingRef.current || inboxVisible || document.querySelector('[role="dialog"], [role="alertdialog"]') || Date.now() < nextAllowedAt.current) return;
        const groups = buildNotificationPushGroups(inbox, states, modes);
        for (const group of groups) {
          if (cancelled || document.visibilityState !== "visible") break;
          const token = crypto.randomUUID();
          const ids = await reserveNotificationDeliveries(group.notifications.map(n => n.id), token);
          if (ids.length) {
            if (!cancelled && document.visibilityState === "visible") {
              const presented = { ...group, notifications: group.notifications.filter(n => ids.includes(n.id)), token, route: pathname };
              active.current = presented;
              setPaused(false);
              setDeliveryError("");
              setCurrent(presented);
            }
            break;
          }
        }
      } catch (error) { console.error("Unable to load notification push:", error); }
      finally { loading = false; }
    }
    const first = window.setTimeout(() => void refresh(), 1200);
    const unsubscribe = subscribeToNotificationChanges(userId, () => void refresh());
    const visible = () => {
      if (document.visibilityState !== "visible") { active.current = null; setCurrent(null); }
      else void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => { cancelled = true; clearTimeout(first); unsubscribe(); document.removeEventListener("visibilitychange", visible); };
  }, [userId, inboxVisible, pathname]);

  useEffect(() => {
    if (!current || current.route !== pathname || inboxVisible) return;
    // This effect runs after the card has committed to the visible page.
    void confirmNotificationDeliveries(current.token).catch(() => setDeliveryError("Unable to sync this alert. It may appear again."));
  }, [current, pathname, inboxVisible]);

  const close = useCallback((recordDismissal: boolean) => {
    const group = active.current;
    if (recordDismissal && group) void Promise.all(group.notifications.map(n => updateNotificationDeliveryState(n.id, userId, "dismissed_at"))).catch(() => setDeliveryError("Unable to sync dismissal."));
    setCurrent(null);
    active.current = null;
    nextAllowedAt.current = Date.now() + 60000;
  }, [userId]);
  useEffect(() => {
    if (!current || paused || current.notifications.some(n => n.priority === "critical")) return;
    const timer = window.setTimeout(() => close(false), current.notifications.some(n => n.priority === "high") ? 15000 : 9000);
    return () => clearTimeout(timer);
  }, [current, paused, close]);

  const first = current?.notifications[0];
  const multiple = (current?.notifications.length ?? 0) > 1;
  return <>
    {current && first && current.route === pathname && !inboxVisible && !reading ? <aside className="notification-push" aria-label="New notification" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-slate-500">{notificationSource(first)}</span>
        <button type="button" aria-label="Dismiss notification" onClick={() => close(true)} className="rounded p-1 text-slate-500 hover:bg-slate-100">✕</button>
      </div>
      <div role="status"><h2 className="mt-2 text-sm font-semibold text-slate-900">{multiple ? `${current.notifications.length} new messages` : first.title}</h2><p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm text-slate-600">{multiple ? current.notifications.slice(0, 3).map(n => n.title).join(" · ") : first.message}</p></div>
      {deliveryError ? <p role="alert" className="mt-2 text-xs text-rose-700">{deliveryError}</p> : null}
      {multiple ? <Link href="/console/personal/notifications" className="secondary-button mt-3" onClick={() => close(false)}>View messages</Link> : <button type="button" className="secondary-button mt-3" onClick={() => { readingRef.current = true; setReading(first); close(false); }}>View message</button>}
    </aside> : null}
    <NotificationReader notification={reading} userId={userId} onClose={() => { readingRef.current = false; setReading(null); }} />
  </>;
}
