"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import {
  createNotification,
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
type InboxFilter = "all" | "unread" | "reminder" | "organization" | "system";

export default function NotificationManager() {
  const { session } = useAuthSession();
  const userId = session?.user?.id ?? "";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [status, setStatus] = useState("");
  const [inbox, setInbox] = useState<NotificationRecord[]>([]);
  const [adminHistory, setAdminHistory] = useState<NotificationRecord[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => defaultNotificationPreferences(userId));
  const [savingPreferences, setSavingPreferences] = useState(false);

  const unreadCount = useMemo(
    () => inbox.filter((notification) => !notification.read_at).length,
    [inbox]
  );
  const visibleInbox = useMemo(() => {
    if (inboxFilter === "all") return inbox;
    if (inboxFilter === "unread") return inbox.filter((notification) => !notification.read_at);
    return inbox.filter((notification) => notification.kind === inboxFilter);
  }, [inbox, inboxFilter]);

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
        await refreshMyProfileReminders();
        const profile = await fetchCurrentProfile(userId);
        const nextIsAdmin = profile?.role === "admin";
        const [nextInbox, nextHistory, nextPreferences] = await Promise.all([
          fetchInboxNotifications(userId),
          nextIsAdmin ? fetchNotificationHistory() : Promise.resolve([]),
          fetchNotificationPreferences(userId),
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
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    return subscribeToNotificationChanges(userId, () => void refreshInbox());
    // refreshInbox intentionally follows the current signed-in user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function resetForm() {
    setForm(emptyForm);
  }

  async function handleSavePreferences() {
    if (!userId) return;
    setSavingPreferences(true);
    setStatus("");
    try {
      const nextPreferences = await updateNotificationPreferences(userId, {
        personal_reminders_enabled: preferences.personal_reminders_enabled,
        organization_messages_enabled: preferences.organization_messages_enabled,
        platform_notices_enabled: preferences.platform_notices_enabled,
      });
      setPreferences(nextPreferences);
      await refreshInbox();
      setStatus("Notification settings saved.");
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
  }

  async function handleRead(notification: NotificationRecord) {
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
        inbox.filter((notification) => !notification.read_at).map((notification) => notification.id),
        userId
      );
      await refreshInbox();
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to mark notifications as read."));
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
      await Promise.all([refreshInbox(), fetchNotificationHistory().then(setAdminHistory)]);
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
      await Promise.all([refreshInbox(), fetchNotificationHistory().then(setAdminHistory)]);
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
      await Promise.all([refreshInbox(), fetchNotificationHistory().then(setAdminHistory)]);
      setStatus("Platform notification sent.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Failed to send notification."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="saas-panel">Loading notifications...</div>;

  return (
    <div className="grid gap-6">
      {status ? <p className="saas-panel text-sm text-slate-600">{status}</p> : null}

      <section className="saas-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="saas-kicker">Unified inbox</p>
            <h1 className="tools-child-title">Notifications</h1>
            <p className="saas-meta-text mt-2">Personal reminders, organization messages, and platform notices appear here.</p>
          </div>
          <button className="ghost-button" type="button" disabled={saving || unreadCount === 0} onClick={() => void handleMarkAllRead()}>
            Mark all read ({unreadCount})
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          <div className="flex flex-wrap gap-2">
            {([
              ["all", "All"],
              ["unread", `Unread (${unreadCount})`],
              ["reminder", "Reminders"],
              ["organization", "Organization"],
              ["system", "Platform"],
            ] as Array<[InboxFilter, string]>).map(([value, label]) => (
              <button
                key={value}
                className={inboxFilter === value ? "secondary-button" : "ghost-button"}
                type="button"
                onClick={() => setInboxFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {visibleInbox.length === 0 ? <p className="saas-empty-state">No notifications match this filter.</p> : visibleInbox.map((notification) => (
            <article
              key={notification.id}
              className={`saas-list-item saas-list-item-stack ${notification.read_at ? "opacity-70" : "border-sky-200 bg-sky-50/40"}`}
              onClick={() => void handleRead(notification)}
            >
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="saas-card-title">{notification.title}</h2>
                  {!notification.read_at ? <span className="saas-pill saas-pill-high">New</span> : null}
                  <span className="saas-pill">{formatKind(notification.kind)}</span>
                  <span className={`saas-pill saas-pill-${notification.priority}`}>{notification.priority}</span>
                </div>
                {notification.source_label ? <p className="saas-list-meta">{notification.source_label}</p> : null}
                <p className="saas-meta-text">{notification.message}</p>
                <p className="saas-list-meta">{new Date(notification.created_at).toLocaleString()}</p>
              </div>
              {notification.action_url ? <Link className="secondary-button" href={notification.action_url} onClick={() => void handleRead(notification)}>Open</Link> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="saas-panel" aria-labelledby="notification-preferences-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="saas-kicker">Your settings</p>
            <h2 id="notification-preferences-title" className="saas-subsection-title">Notification preferences</h2>
            <p className="saas-meta-text mt-2">Choose what appears in your inbox and unread count. Critical safety and account events always remain enabled.</p>
          </div>
          <button className="primary-button" type="button" disabled={savingPreferences} onClick={() => void handleSavePreferences()}>
            {savingPreferences ? "Saving..." : "Save settings"}
          </button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {([
            ["personal_reminders_enabled", "Personal reminders", "Profile completion, certificates, medical dates, and personal aircraft due dates."],
            ["organization_messages_enabled", "Organization messages", "Messages, role changes, aircraft updates, and organization workflow events."],
            ["platform_notices_enabled", "Platform notices", "General PilotSeal announcements and non-critical platform information."],
          ] as Array<[keyof Pick<NotificationPreferences, "personal_reminders_enabled" | "organization_messages_enabled" | "platform_notices_enabled">, string, string]>).map(([key, label, description]) => (
            <label key={key} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-sky-600"
                checked={preferences[key]}
                onChange={(event) => setPreferences((current) => ({ ...current, [key]: event.target.checked }))}
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">{label}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {isAdmin ? (
        <section className="saas-form-grid">
          <article className="saas-panel">
            <h2 className="saas-subsection-title">{form.id ? "Edit platform notice" : "Create platform notice"}</h2>
            <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
              <label className="saas-field"><span>Title</span><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required /></label>
              <label className="saas-field"><span>Message</span><textarea rows={5} value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} required /></label>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="saas-field"><span>Priority</span><select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as NotificationPriority }))}>{priorityOptions.map((value) => <option key={value}>{value}</option>)}</select></label>
                <label className="saas-field"><span>Status</span><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as NotificationStatus }))}>{statusOptions.map((value) => <option key={value}>{value}</option>)}</select></label>
                <label className="saas-field"><span>Scheduled time</span><input type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))} /></label>
              </div>
              <div className="flex gap-2"><button className="primary-button" type="submit" disabled={saving || !form.title.trim() || !form.message.trim()}>{saving ? "Saving..." : form.id ? "Update" : "Create"}</button><button className="ghost-button" type="button" onClick={resetForm}>Clear</button></div>
            </form>
          </article>

          <article className="saas-panel">
            <div className="flex items-center justify-between gap-3"><h2 className="saas-subsection-title">Platform notice history</h2><span className="saas-pill">{adminHistory.length}</span></div>
            <div className="mt-5 grid gap-3">
              {adminHistory.map((notification) => (
                <article key={notification.id} className="saas-list-item saas-list-item-stack">
                  <div><h3 className="saas-card-title">{notification.title}</h3><p className="saas-meta-text mt-2">{notification.message}</p><p className="saas-list-meta mt-2">{notification.status} · {new Date(notification.created_at).toLocaleString()}</p></div>
                  <div className="flex flex-wrap gap-2"><button className="ghost-button" type="button" onClick={() => handleEdit(notification)}>Edit</button><button className="secondary-button" type="button" disabled={saving || notification.status === "sent"} onClick={() => void handleSendNow(notification.id)}>Send now</button><button className="danger-button" type="button" disabled={saving} onClick={() => void handleDelete(notification.id)}>Delete</button></div>
                </article>
              ))}
            </div>
          </article>
        </section>
      ) : null}
    </div>
  );
}

function formatKind(kind: NotificationRecord["kind"]) {
  if (kind === "organization") return "Organization";
  if (kind === "reminder") return "Reminder";
  return "Platform";
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return fallback;
}
