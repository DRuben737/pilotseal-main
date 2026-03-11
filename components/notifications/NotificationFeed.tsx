"use client";

import { useEffect, useState } from "react";

import { fetchActiveNotifications, type NotificationRecord } from "@/lib/notifications";

export default function NotificationFeed() {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      try {
        const data = await fetchActiveNotifications();
        if (!cancelled) {
          setNotifications(data);
        }
      } catch (fetchError) {
        if (!cancelled) {
          console.error(fetchError);
          setError("Unable to load notifications right now.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadNotifications();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <section className="section-panel-about px-6 py-6 sm:px-8">
        <p className="muted-kicker">Notifications</p>
        <p className="copy-muted mt-3">Loading active notifications...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="section-panel-about px-6 py-6 sm:px-8">
        <p className="muted-kicker">Notifications</p>
        <p className="copy-muted mt-3">{error}</p>
      </section>
    );
  }

  if (notifications.length === 0) {
    return null;
  }

  return (
    <section className="section-panel-about px-6 py-6 sm:px-8">
      <p className="muted-kicker">Notifications</p>
      <div className="mt-4 grid gap-3">
        {notifications.map((notification) => (
          <article key={notification.id} className="content-card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{notification.title}</h2>
              <span className={`saas-pill saas-pill-${notification.priority}`}>
                {notification.priority}
              </span>
            </div>
            <p className="copy-muted mt-2 leading-7">{notification.message}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
