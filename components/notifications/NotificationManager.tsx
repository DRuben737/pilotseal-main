"use client";

import { useEffect, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import {
  createNotification,
  deleteNotification,
  fetchNotificationHistory,
  sendNotificationNow,
  updateNotification,
  type NotificationPriority,
  type NotificationRecord,
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

export default function NotificationManager() {
  const { session } = useAuthSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [status, setStatus] = useState("Manage outbound notifications from this workspace.");
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      if (!session?.user?.id) {
        if (!cancelled) {
          setNotifications([]);
          setIsAdmin(false);
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        const profile = await fetchCurrentProfile(session.user.id);
        const nextIsAdmin = profile?.role === "admin";
        const history = nextIsAdmin ? await fetchNotificationHistory() : [];

        if (!cancelled) {
          setIsAdmin(nextIsAdmin);
          setNotifications(history);
          setStatus(
            nextIsAdmin
              ? "Notification center synchronized."
              : "Notification management is available to admin users."
          );
        }
      } catch (error) {
        console.error(error);

        if (!cancelled) {
          setStatus("Unable to load notifications right now.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadNotifications();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  async function refreshNotifications() {
    const history = await fetchNotificationHistory();
    setNotifications(history);
  }

  function resetForm() {
    setForm(emptyForm);
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session?.user?.id) {
      setStatus("You must be signed in to manage notifications.");
      return;
    }

    if (!isAdmin) {
      setStatus("Only admin users can manage notifications.");
      return;
    }

    if (form.status === "scheduled" && !form.scheduledAt) {
      setStatus("Choose a scheduled time before saving a scheduled notification.");
      return;
    }

    setSaving(true);

    try {
      if (form.id) {
        await updateNotification(form.id, {
          message: form.message,
          priority: form.priority,
          scheduledAt: form.status === "scheduled" ? form.scheduledAt : null,
          status: form.status,
          title: form.title,
        });
        setStatus("Notification updated.");
      } else {
        await createNotification({
          createdBy: session.user.id,
          message: form.message,
          priority: form.priority,
          scheduledAt: form.status === "scheduled" ? form.scheduledAt : null,
          status: form.status,
          title: form.title,
        });
        setStatus("Notification created.");
      }

      await refreshNotifications();
      resetForm();
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Failed to save notification.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!isAdmin) {
      setStatus("Only admin users can manage notifications.");
      return;
    }

    setSaving(true);

    try {
      await deleteNotification(id);
      await refreshNotifications();
      setStatus("Notification deleted.");
      if (form.id === id) {
        resetForm();
      }
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Failed to delete notification.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSendNow(id: string) {
    if (!isAdmin) {
      setStatus("Only admin users can manage notifications.");
      return;
    }

    setSaving(true);

    try {
      await sendNotificationNow(id);
      await refreshNotifications();
      setStatus("Notification marked as sent.");
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Failed to send notification.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6">
      <section className="saas-panel">
        <p className="eyebrow">Notification center</p>
        <h2 className="saas-section-title">Create, schedule, and ship system notices</h2>
        <p className="saas-section-copy">
          Manage drafts, future sends, and live notices with delivery priority and history.
        </p>
        <p className="saas-feedback saas-feedback-info mt-5">
          {loading ? "Loading notification center..." : status}
        </p>
      </section>

      <section className="saas-form-grid">
        <article className="saas-panel">
          <div className="flex items-center justify-between gap-3">
            <h3 className="saas-subsection-title">
              {form.id ? "Edit notification" : "Create notification"}
            </h3>
            <button type="button" className="ghost-button" onClick={resetForm}>
              Clear form
            </button>
          </div>

          <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
            <label className="saas-field">
              <span>Title</span>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                required
              />
            </label>

            <label className="saas-field">
              <span>Message</span>
              <textarea
                value={form.message}
                onChange={(event) =>
                  setForm((current) => ({ ...current, message: event.target.value }))
                }
                rows={5}
                required
              />
            </label>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="saas-field">
                <span>Priority</span>
                <select
                  value={form.priority}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      priority: event.target.value as NotificationPriority,
                    }))
                  }
                >
                  {priorityOptions.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </label>

              <label className="saas-field">
                <span>Status</span>
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as NotificationStatus,
                    }))
                  }
                >
                  {statusOptions.map((statusValue) => (
                    <option key={statusValue} value={statusValue}>
                      {statusValue}
                    </option>
                  ))}
                </select>
              </label>

              <label className="saas-field">
                <span>Scheduled time</span>
                <input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, scheduledAt: event.target.value }))
                  }
                />
              </label>
            </div>

            <button
              className="primary-button justify-center"
              type="submit"
              disabled={saving || !form.title.trim() || !form.message.trim()}
            >
              {saving ? "Saving..." : form.id ? "Update notification" : "Create notification"}
            </button>
          </form>
        </article>

        <article className="saas-panel">
          <div className="flex items-center justify-between gap-3">
            <h3 className="saas-subsection-title">Notification history</h3>
            <span className="saas-pill">{notifications.length}</span>
          </div>

          {!isAdmin && !loading ? (
            <p className="saas-empty-state mt-5">
              Notification management is reserved for admin users.
            </p>
          ) : null}

          <div className="mt-5 grid gap-3">
            {notifications.length === 0 ? (
              <p className="saas-empty-state">No notifications recorded yet.</p>
            ) : (
              notifications.map((notification) => (
                <article key={notification.id} className="saas-list-item saas-list-item-stack">
                  <div className="grid gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="saas-card-title">{notification.title}</h4>
                      <span className={`saas-pill saas-pill-${notification.priority}`}>
                        {notification.priority}
                      </span>
                      <span className="saas-pill">{notification.status}</span>
                    </div>
                    <p className="saas-meta-text">{notification.message}</p>
                    <p className="saas-list-meta">
                      Created {new Date(notification.created_at).toLocaleString()}
                      {notification.scheduled_at
                        ? ` • Scheduled ${new Date(notification.scheduled_at).toLocaleString()}`
                        : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={saving}
                      onClick={() => handleEdit(notification)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={saving || notification.status === "sent"}
                      onClick={() => handleSendNow(notification.id)}
                    >
                      Send now
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      disabled={saving}
                      onClick={() => handleDelete(notification.id)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
