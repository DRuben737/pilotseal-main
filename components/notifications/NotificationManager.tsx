"use client";

import Link from "next/link";
import styles from "./NotificationInbox.module.css";
import NotificationPublicationManager from "@/components/notifications/NotificationPublicationManager";
import NotificationReader from "@/components/notifications/NotificationReader";

import { useEffect, useMemo, useState } from "react";

import { DetailDrawer, ManagementDisclosure } from "@/components/admin/AdminConsole";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { UsDateTimeInput } from "@/components/forms/UsDateInput";
import {
  createNotification,
  deleteInboxNotification,
  deleteNotification,
  fetchInboxNotifications,
  fetchNotificationPreferences,
  fetchNotificationHistory,
  markAllNotificationsRead,
  markNotificationRead,
  refreshMyProfileReminders,
  sendNotificationNow,
  subscribeToNotificationChanges,
  updateNotification,
  updateNotificationPreferences,
  defaultNotificationPreferences,
  type NotificationPriority,
  type NotificationRecord,
  type NotificationPreferences,
  type NotificationStatus,
} from "@/lib/notifications";
import { fetchCurrentProfile } from "@/lib/profile";
import { formatUsDateTime } from "@/lib/date-format";

const priorityOptions: NotificationPriority[] = ["low", "normal", "high", "critical"];
const statusOptions: NotificationStatus[] = ["draft", "scheduled", "sent"];
const emptyForm = {
  id: "",
  message: "",
  priority: "normal" as NotificationPriority,
  scheduledAt: "",
  status: "draft" as NotificationStatus,
  title: "",
};
type InboxFilter = "all" | "unread" | "reminder" | "organization" | "schedule" | "system";

export default function NotificationManager({
  platformPublishingOnly = false,
}: {
  platformPublishingOnly?: boolean;
}) {
  const { session } = useAuthSession();
  const userId = session?.user?.id ?? "";
  const [readingNotification, setReadingNotification] = useState<NotificationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [status, setStatus] = useState("");
  const [inbox, setInbox] = useState<NotificationRecord[]>([]);
  const [adminHistory, setAdminHistory] = useState<NotificationRecord[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showComposer, setShowComposer] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [inboxQuery, setInboxQuery] = useState("");
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => defaultNotificationPreferences(userId));
  const [savingPreferences, setSavingPreferences] = useState(false);
  const unreadCount = useMemo(
    () => inbox.filter((notification) => !notification.read_at && !notification.delivery_state?.completed_at).length,
    [inbox]
  );
  const visibleInbox = useMemo(() => {
    const filteredByKind = inboxFilter === "all"
      ? inbox
      : inboxFilter === "unread"
        ? inbox.filter((notification) => !notification.read_at && !notification.delivery_state?.completed_at)
        : inbox.filter((notification) => notification.kind === inboxFilter);
    const needle = inboxQuery.trim().toLowerCase();
    if (!needle) return filteredByKind;
    return filteredByKind.filter((notification) =>
      [
        notification.title,
        notification.message,
        notification.source_label ?? "",
        notification.kind,
        notification.priority,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [inbox, inboxFilter, inboxQuery]);

  async function refreshInbox() {
    if (!userId) return;
    setInbox(await fetchInboxNotifications(userId));
  }

  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      if (!userId) {
        if (!cancelled) {
          setInbox([]);
          setAdminHistory([]);
          setIsAdmin(false);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setStatus("");
      try {
        if (!platformPublishingOnly) await refreshMyProfileReminders();
        const profile = platformPublishingOnly ? await fetchCurrentProfile(userId) : null;
        const nextIsAdmin = platformPublishingOnly && profile?.role === "admin";
        const [nextInbox, nextHistory, nextPreferences] = await Promise.all([
          platformPublishingOnly ? Promise.resolve([]) : fetchInboxNotifications(userId),
          nextIsAdmin ? fetchNotificationHistory() : Promise.resolve([]),
          platformPublishingOnly
            ? Promise.resolve(defaultNotificationPreferences(userId))
            : fetchNotificationPreferences(userId),
        ]);
        if (!cancelled) {
          setIsAdmin(nextIsAdmin);
          setInbox(nextInbox);
          setAdminHistory(nextHistory);
          setPreferences(nextPreferences);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setStatus("Unable to load notifications right now.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadNotifications();
    return () => {
      cancelled = true;
    };
  }, [platformPublishingOnly, userId]);

  useEffect(() => {
    if (!userId || platformPublishingOnly) return undefined;
    return subscribeToNotificationChanges(userId, () => void refreshInbox());
    // refreshInbox intentionally follows the current signed-in user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformPublishingOnly, userId]);

  function resetForm() {
    setForm(emptyForm);
  }

  async function handleSavePreferences() {
    if (!userId) return;
    setSavingPreferences(true);
    setStatus("");
    try {
      const nextPreferences = await updateNotificationPreferences(userId, {
        delivery_modes: preferences.delivery_modes,
        personal_reminders_enabled: preferences.personal_reminders_enabled,
        organization_messages_enabled: preferences.organization_messages_enabled,
        platform_notices_enabled: preferences.platform_notices_enabled,
        schedule_notifications_enabled: preferences.schedule_notifications_enabled,
      });
      setPreferences(nextPreferences);
      await refreshInbox();
      setStatus("Notification settings saved.");
      setShowPreferences(false);
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to save notification settings."));
    } finally {
      setSavingPreferences(false);
    }
  }

  function handleEdit(notification: NotificationRecord) {
    setForm({
      id: notification.id,
      message: notification.message,
      priority: notification.priority,
      scheduledAt: notification.scheduled_at
        ? new Date(notification.scheduled_at).toISOString().slice(0, 16)
        : "",
      status: notification.status,
      title: notification.title,
    });
    setShowComposer(true);
  }

  async function handleRead(notification: NotificationRecord) {
    setReadingNotification(notification);
    if (!userId || notification.read_at) return;
    try {
      await markNotificationRead(notification.id, userId);
      setInbox((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item
        )
      );
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to mark this notification as read."));
    }
  }

  async function handleMarkAllRead() {
    if (!userId) return;
    setSaving(true);
    try {
      await markAllNotificationsRead(
        inbox.filter((notification) => !notification.read_at && !notification.delivery_state?.completed_at).map((notification) => notification.id),
        userId
      );
      await refreshInbox();
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to mark notifications as read."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteInbox(notification: NotificationRecord) {
    if (!userId) return;
    if (!window.confirm(`Delete “${notification.title}” from your inbox? This cannot be undone.`)) return;
    setSaving(true);
    setStatus("");
    try {
      await deleteInboxNotification(notification.id, userId);
      setInbox((current) => current.filter((item) => item.id !== notification.id));
      setStatus("Notification deleted from your inbox.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to delete this notification."));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || !isAdmin) return;
    if (form.status === "scheduled" && !form.scheduledAt) {
      setStatus("Choose a scheduled time before saving a scheduled notification.");
      return;
    }

    setSaving(true);
    try {
      const input = {
        message: form.message,
        priority: form.priority,
        scheduledAt: form.status === "scheduled" ? form.scheduledAt : null,
        status: form.status,
        title: form.title,
      };
      if (form.id) {
        await updateNotification(form.id, input);
        setStatus("Platform notification updated.");
      } else {
        await createNotification({ ...input, createdBy: userId });
        setStatus("Platform notification created.");
      }
      resetForm();
      setShowComposer(false);
      setAdminHistory(await fetchNotificationHistory());
    } catch (error) {
      setStatus(getErrorMessage(error, "Failed to save notification."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!isAdmin) return;
    setSaving(true);
    try {
      await deleteNotification(id);
      setAdminHistory(await fetchNotificationHistory());
      if (form.id === id) resetForm();
      setStatus("Platform notification deleted.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Failed to delete notification."));
    } finally {
      setSaving(false);
    }
  }

  async function handleSendNow(id: string) {
    if (!isAdmin) return;
    setSaving(true);
    try {
      await sendNotificationNow(id);
      setAdminHistory(await fetchNotificationHistory());
      setStatus("Platform notification sent.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Failed to send notification."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="saas-panel">Loading notifications...</div>;
  if (platformPublishingOnly && !isAdmin) {
    return <div className="saas-panel">Platform administrator access is required.</div>;
  }

  return (
    <div className="grid gap-6">
      <NotificationReader notification={readingNotification} userId={userId} onClose={() => setReadingNotification(null)} />
      {status ? <p className="saas-panel text-sm text-slate-600">{status}</p> : null}

      {!platformPublishingOnly ? <>
      <section className={styles.inbox} aria-label="Notifications">
        <header className={styles.header}>
          <div className={styles.heading}><h2>Inbox</h2><span>{unreadCount} unread</span></div>
          <div className={styles.actions}>
            <button className={styles.iconButton} type="button" aria-label="Mark all read" title="Mark all read" disabled={saving || unreadCount === 0} onClick={() => void handleMarkAllRead()}><InboxIcon name="read" /></button>
            <button className={styles.iconButton} type="button" aria-label="Preferences" title="Notification preferences" onClick={() => setShowPreferences(true)}><InboxIcon name="settings" /></button>
          </div>
        </header>
        <div className={styles.toolbar}>
          <div className={styles.filters} role="group" aria-label="Filter notifications">
            {([
              ["all", "All"], ["unread", "Unread"], ["reminder", "Reminders"],
              ["organization", "Organization"], ["schedule", "Schedule"], ["system", "Platform"],
            ] as Array<[InboxFilter, string]>).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={inboxFilter === value} onClick={() => setInboxFilter(value)}>{label}</button>
            ))}
          </div>
          <div className={styles.search}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
            <input type="search" value={inboxQuery} onChange={event => setInboxQuery(event.target.value)} placeholder="Search notifications" aria-label="Search notifications" />
          </div>
        </div>
        {visibleInbox.length === 0 ? <div className={styles.empty}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><path d="m4 4-2 10v6h20v-6L20 4H4Z" /><path d="M2 14h6l2 3h4l2-3h6" /></svg>
          <p>{inboxQuery || inboxFilter !== "all" ? "No matching notifications" : "You're all caught up"}</p>
          {inboxQuery || inboxFilter !== "all" ? <button type="button" className="ghost-button" onClick={() => { setInboxQuery(""); setInboxFilter("all"); }}>Clear filters</button> : null}
        </div> : <div className={styles.messages} role="list" aria-label="Notifications">
          {visibleInbox.map(notification => {
            const completed = Boolean(notification.delivery_state?.completed_at);
            const unread = !notification.read_at && !completed;
            const state = completed ? "Completed" : notification.delivery_state?.acknowledged_at ? "Confirmed" : notification.read_at ? "Read" : "Unread";
            return <article key={notification.id} role="listitem" className={styles.message} data-unread={unread}>
              <span className={styles.dot} aria-label={unread ? "Unread" : undefined} />
              <button type="button" className={styles.content} aria-label={notification.title} onClick={() => void handleRead(notification)}>
                <span className={styles.title}>{notification.title}{notification.priority === "high" || notification.priority === "critical" ? <span className={styles.priority} data-priority={notification.priority}>{notification.priority === "critical" ? "Critical" : "High priority"}</span> : null}</span>
                <span className={styles.excerpt}>{notification.message}</span>
                <span className={styles.meta}><span>{notification.source_label || formatKind(notification.kind)}</span><span aria-hidden="true">·</span><span>{state}</span></span>
              </button>
              <div className={styles.trailing}>
                <time dateTime={notification.created_at}>{formatUsDateTime(notification.created_at)}</time>
                <div className={styles.rowActions}>
                  {notification.action_url ? <Link className={styles.iconButton} href={notification.action_url} aria-label={`Open related page for ${notification.title}`} title="Open related page" onClick={() => void handleRead(notification)}><InboxIcon name="open" /></Link> : null}
                  <button className={styles.iconButton} type="button" disabled={saving} aria-label={`Delete ${notification.title}`} title="Delete notification" onClick={() => void handleDeleteInbox(notification)}><InboxIcon name="delete" /></button>
                </div>
              </div>
            </article>;
          })}
        </div>}
      </section>

      <DetailDrawer open={showPreferences} title="Notification preferences" onClose={() => setShowPreferences(false)}>
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {([
            ["personal_reminders_enabled", "Personal reminders", "Profile completion, certificates, medical dates, and personal aircraft due dates."],
            ["organization_messages_enabled", "Organization messages", "Messages, role changes, aircraft updates, and organization workflow events."],
            ["schedule_notifications_enabled", "Schedule notifications", "Lessons added, changed, or cancelled by an instructor."],
            ["platform_notices_enabled", "Platform notices", "General PilotSeal announcements and non-critical platform information."],
          ] as Array<[keyof Pick<NotificationPreferences, "personal_reminders_enabled" | "organization_messages_enabled" | "platform_notices_enabled" | "schedule_notifications_enabled">, string, string]>).map(([key, label, description]) => (
            <label key={key} className="grid cursor-pointer grid-cols-[1fr_auto] items-center gap-4 px-1 py-3">
              <select
                className="col-start-2 row-start-1 max-w-40 text-sm"
                aria-label={`${label} delivery`}
                value={!preferences[key] ? "off" : preferences.delivery_modes[key === "personal_reminders_enabled" ? "reminder" : key === "organization_messages_enabled" ? "organization" : key === "schedule_notifications_enabled" ? "schedule" : "system"]}
                onChange={(event) => {
                  const mode = event.target.value as "instant" | "inbox" | "off";
                  const kind = key === "personal_reminders_enabled" ? "reminder" : key === "organization_messages_enabled" ? "organization" : key === "schedule_notifications_enabled" ? "schedule" : "system";
                  setPreferences(current => ({ ...current, [key]: mode !== "off", delivery_modes: { ...current.delivery_modes, [kind]: mode } }));
                }}
              >
                <option value="instant">Instant alerts</option>
                <option value="inbox">Inbox only</option>
                <option value="off">Off</option>
              </select>
              <span className="col-start-1 row-start-1">
                <span className="block text-sm font-semibold text-slate-900">{label}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button className="primary-button" type="button" disabled={savingPreferences} onClick={() => void handleSavePreferences()}>
            {savingPreferences ? "Saving..." : "Save settings"}
          </button>
        </div>
      </DetailDrawer>
      </> : null}

      {platformPublishingOnly && isAdmin ? <NotificationPublicationManager organizationId={null} sourceName="PilotSeal" /> : null}
      {platformPublishingOnly && isAdmin && adminHistory.length > 0 ? (
        <>
        <ManagementDisclosure id="platform-notices" eyebrow="Platform administration" title="Earlier platform notices" summary={`${adminHistory.length}`}>
          <div className="grid gap-3">
            <DetailDrawer open={showComposer} title={form.id ? "Edit platform notice" : "Create platform notice"} onClose={() => setShowComposer(false)}>
          <article>
            <h2 className="saas-subsection-title">{form.id ? "Edit platform notice" : "Create platform notice"}</h2>
            <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
              <label className="saas-field"><span>Title</span><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required /></label>
              <label className="saas-field"><span>Message</span><textarea rows={5} value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} required /></label>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="saas-field"><span>Priority</span><select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as NotificationPriority }))}>{priorityOptions.map((value) => <option key={value}>{value}</option>)}</select></label>
                <label className="saas-field"><span>Status</span><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as NotificationStatus }))}>{statusOptions.map((value) => <option key={value}>{value}</option>)}</select></label>
                <label className="saas-field"><span>Scheduled time</span><UsDateTimeInput value={form.scheduledAt} onChange={(value) => setForm((current) => ({ ...current, scheduledAt: value }))} /></label>
              </div>
              <div className="flex gap-2"><button className="primary-button" type="submit" disabled={saving || !form.title.trim() || !form.message.trim()}>{saving ? "Saving..." : form.id ? "Update" : "Create"}</button><button className="ghost-button" type="button" onClick={resetForm}>Clear</button></div>
            </form>
          </article>
            </DetailDrawer>

          <article>
            <div className="mt-3 divide-y divide-slate-200 border border-slate-200 bg-white">
              {adminHistory.map((notification) => (
                <article key={notification.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                  <div><h3 className="saas-card-title">{notification.title}</h3><p className="saas-list-meta mt-2">{notification.status} · {formatUsDateTime(notification.created_at)}</p></div>
                  <div className="flex flex-wrap gap-2"><button className="ghost-button" type="button" onClick={() => handleEdit(notification)}>Edit</button><button className="secondary-button" type="button" disabled={saving || notification.status === "sent"} onClick={() => void handleSendNow(notification.id)}>Send now</button><button className="danger-button" type="button" disabled={saving} onClick={() => void handleDelete(notification.id)}>Delete</button></div>
                </article>
              ))}
            </div>
          </article>
          </div>
        </ManagementDisclosure>
        </>
      ) : null}
    </div>
  );
}

function formatKind(kind: NotificationRecord["kind"]) {
  if (kind === "organization") return "Organization";
  if (kind === "reminder") return "Reminder";
  if (kind === "schedule") return "Schedule";
  return "Platform";
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return fallback;
}

function InboxIcon({ name }: { name: "read" | "settings" | "open" | "delete" }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {name === "read" ? <><path d="M21 10V5H3v14h11M3 5l9 7 9-7" /><path d="m16 17 3 3 4-5" /></> : null}
    {name === "settings" ? <><path d="m9 3-.6 2.1-1.6.9-2.1-.5-3 5.1 1.5 1.6v1.8l-1.5 1.6 3 5.1 2.1-.5 1.6.9L9 23h6l.6-2.1 1.6-.9 2.1.5 3-5.1-1.5-1.6V12l1.5-1.6-3-5.1-2.1.5-1.6-.9L15 3Z" transform="translate(1 0) scale(.9)" /><circle cx="12" cy="12" r="3" /></> : null}
    {name === "open" ? <><path d="M14 3h7v7m0-7L10 14M10 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6" /></> : null}
    {name === "delete" ? <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></> : null}
  </svg>;
}
