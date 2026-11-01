"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import NotificationReader from "@/components/notifications/NotificationReader";
import { reserveDeviceNotifications, syncNotificationDevice, updateDeviceNotificationState } from "@/lib/notification-devices";
import { buildNotificationPushGroups, notificationSource, type NotificationPushGroup } from "@/lib/notification-presentation";
import { defaultDeliveryModes, fetchInboxNotifications, fetchNotificationPreferences, subscribeToNotificationChanges, updateNotificationDeliveryState, type NotificationRecord } from "@/lib/notifications";

type PresentedGroup = NotificationPushGroup & { route: string };

function CloseIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

export default function NotificationPush({ userId }: { userId: string }) {
  const pathname = usePathname();
  const [current, setCurrent] = useState<PresentedGroup | null>(null);
  const [reading, setReading] = useState<NotificationRecord | null>(null);
  const [paused, setPaused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const active = useRef<PresentedGroup | null>(null);
  const readingRef = useRef(false);
  const nextAllowedAt = useRef(0);
  const criticalButton = useRef<HTMLButtonElement>(null);
  const inboxVisible = pathname.endsWith("/notifications");

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let loading = false;
    void syncNotificationDevice().catch(error => console.error("Unable to register notification device:", error));
    async function refresh() {
      if (loading || document.visibilityState !== "visible") return;
      loading = true;
      try {
        const [inbox, preferences] = await Promise.all([fetchInboxNotifications(userId), fetchNotificationPreferences(userId)]);
        if (cancelled) return;
        const modes = { ...defaultDeliveryModes, ...preferences.delivery_modes };
        if (active.current) {
          const group = active.current;
          const remaining = group.notifications.filter(n => inbox.some(i => i.id === n.id) && (n.priority === "critical" || modes[n.kind] === "instant"));
          if (!remaining.length || group.route !== pathname || inboxVisible) { active.current = null; setCurrent(null); }
          else if (remaining.length !== group.notifications.length) { active.current = { ...group, notifications: remaining }; setCurrent(active.current); }
          return;
        }
        if (readingRef.current || inboxVisible || document.querySelector('[role="dialog"], [role="alertdialog"]') || Date.now() < nextAllowedAt.current) return;
        for (const group of buildNotificationPushGroups(inbox, [], modes)) {
          const ids = await reserveDeviceNotifications(group.notifications.map(n => n.id));
          if (ids.length && !cancelled) {
            const presented = { ...group, notifications: group.notifications.filter(n => ids.includes(n.id)), route: pathname };
            active.current = presented; setPaused(false); setDeliveryError(""); setCurrent(presented);
            break;
          }
        }
      } catch (error) { console.error("Unable to load notification alert:", error); }
      finally { loading = false; }
    }
    const firstRefresh = window.setTimeout(() => void refresh(), 800);
    const unsubscribe = subscribeToNotificationChanges(userId, () => void refresh());
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { cancelled = true; clearTimeout(firstRefresh); unsubscribe(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [userId, inboxVisible, pathname]);

  useEffect(() => {
    if (!current || current.route !== pathname || inboxVisible) return;
    void updateDeviceNotificationState(current.notifications.map(n => n.id), "displayed")
      .catch(() => setDeliveryError("Unable to sync this alert. It may appear again."));
  }, [current, pathname, inboxVisible]);

  const close = useCallback((recordDismissal: boolean) => {
    const group = active.current;
    if (recordDismissal && group) {
      void updateDeviceNotificationState(group.notifications.map(n => n.id), "dismissed")
        .catch(() => setDeliveryError("Unable to sync dismissal."));
    }
    setCurrent(null); active.current = null; nextAllowedAt.current = Date.now() + 15000;
  }, []);

  useEffect(() => {
    if (!current || paused || reading || current.notifications.some(n => n.priority === "critical" || n.priority === "high")) return;
    const timer = window.setTimeout(() => close(false), 7000);
    return () => clearTimeout(timer);
  }, [current, paused, reading, close]);

  const first = current?.notifications[0];
  const multiple = (current?.notifications.length ?? 0) > 1;
  const critical = Boolean(current?.notifications.some(n => n.priority === "critical"));

  useEffect(() => {
    if (!critical || reading) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    criticalButton.current?.focus();
    const preventEscape = (event: KeyboardEvent) => { if (event.key === "Escape") event.preventDefault(); };
    document.addEventListener("keydown", preventEscape);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", preventEscape); };
  }, [critical, reading]);

  async function confirmCritical() {
    const group = active.current;
    if (!group || saving) return;
    setSaving(true); setDeliveryError("");
    try {
      await Promise.all(group.notifications.map(n => updateNotificationDeliveryState(n.id, userId, "acknowledged_at")));
      await updateDeviceNotificationState(group.notifications.map(n => n.id), "dismissed");
      close(false);
    } catch { setDeliveryError("Unable to confirm receipt. Please try again."); }
    finally { setSaving(false); }
  }

  const card = current && first && current.route === pathname && !inboxVisible && !reading;
  return <>
    {card && critical ? <div className="notification-critical-backdrop">
      <section className="notification-critical" role="alertdialog" aria-modal="true" aria-labelledby="critical-notification-title" aria-describedby="critical-notification-message">
        <div className="notification-critical-label"><span aria-hidden="true" />Critical notification</div>
        <h2 id="critical-notification-title">{multiple ? `${current.notifications.length} critical messages` : first.title}</h2>
        <p id="critical-notification-message">{multiple ? current.notifications.map(n => n.title).join(" · ") : first.message}</p>
        <p className="notification-critical-source">{notificationSource(first)}</p>
        {deliveryError ? <p role="alert" className="notification-delivery-error">{deliveryError}</p> : null}
        <div className="notification-alert-actions">
          <button type="button" className="secondary-button" onClick={() => { readingRef.current = true; setReading(first); }}>Review details</button>
          <button ref={criticalButton} type="button" className="notification-confirm-button" disabled={saving} onClick={() => void confirmCritical()}>{saving ? "Confirming…" : "Confirm receipt"}</button>
        </div>
      </section>
    </div> : card ? <aside className="notification-push" data-priority={first.priority} aria-label={first.priority === "high" ? "High priority notification" : "New notification"} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
      <div className="notification-push-header">
        <span>{first.priority === "high" ? "High priority · " : ""}{notificationSource(first)}</span>
        <button type="button" aria-label="Dismiss notification" onClick={() => close(true)}><CloseIcon /></button>
      </div>
      <div role={first.priority === "high" ? "alert" : "status"}><h2>{multiple ? `${current.notifications.length} new messages` : first.title}</h2><p>{multiple ? current.notifications.slice(0, 3).map(n => n.title).join(" · ") : first.message}</p></div>
      {deliveryError ? <p role="alert" className="notification-delivery-error">{deliveryError}</p> : null}
      {multiple ? <Link href="/console/personal/notifications" className="secondary-button" onClick={() => close(false)}>View messages</Link> : <button type="button" className="secondary-button" onClick={() => { readingRef.current = true; setReading(first); }}>View message</button>}
    </aside> : null}
    <NotificationReader notification={reading} userId={userId} onClose={() => { readingRef.current = false; setReading(null); }} onChanged={() => { if (critical) void confirmCritical(); }} />
  </>;
}
